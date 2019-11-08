/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 598.0, "minX": 0.0, "maxY": 15810.0, "series": [{"data": [[0.0, 598.0], [0.1, 706.0], [0.2, 1142.0], [0.3, 1169.0], [0.4, 1201.0], [0.5, 1215.0], [0.6, 1239.0], [0.7, 1239.0], [0.8, 1248.0], [0.9, 1253.0], [1.0, 1350.0], [1.1, 1390.0], [1.2, 1447.0], [1.3, 1474.0], [1.4, 1514.0], [1.5, 1553.0], [1.6, 1579.0], [1.7, 1683.0], [1.8, 1720.0], [1.9, 1726.0], [2.0, 1745.0], [2.1, 1768.0], [2.2, 1892.0], [2.3, 1987.0], [2.4, 2098.0], [2.5, 2131.0], [2.6, 2175.0], [2.7, 2205.0], [2.8, 2266.0], [2.9, 2321.0], [3.0, 2348.0], [3.1, 2424.0], [3.2, 2450.0], [3.3, 2483.0], [3.4, 2489.0], [3.5, 2519.0], [3.6, 2546.0], [3.7, 2623.0], [3.8, 2661.0], [3.9, 2672.0], [4.0, 2691.0], [4.1, 2812.0], [4.2, 2931.0], [4.3, 2944.0], [4.4, 3025.0], [4.5, 3033.0], [4.6, 3067.0], [4.7, 3147.0], [4.8, 3189.0], [4.9, 3275.0], [5.0, 3316.0], [5.1, 3465.0], [5.2, 3480.0], [5.3, 3558.0], [5.4, 3595.0], [5.5, 3701.0], [5.6, 3714.0], [5.7, 3736.0], [5.8, 3779.0], [5.9, 3798.0], [6.0, 3853.0], [6.1, 3861.0], [6.2, 3863.0], [6.3, 3875.0], [6.4, 3883.0], [6.5, 3898.0], [6.6, 3903.0], [6.7, 3909.0], [6.8, 3927.0], [6.9, 3938.0], [7.0, 3941.0], [7.1, 3949.0], [7.2, 3973.0], [7.3, 3979.0], [7.4, 3983.0], [7.5, 3996.0], [7.6, 4004.0], [7.7, 4019.0], [7.8, 4030.0], [7.9, 4037.0], [8.0, 4052.0], [8.1, 4061.0], [8.2, 4071.0], [8.3, 4075.0], [8.4, 4078.0], [8.5, 4082.0], [8.6, 4085.0], [8.7, 4087.0], [8.8, 4095.0], [8.9, 4115.0], [9.0, 4116.0], [9.1, 4124.0], [9.2, 4125.0], [9.3, 4136.0], [9.4, 4140.0], [9.5, 4148.0], [9.6, 4151.0], [9.7, 4154.0], [9.8, 4172.0], [9.9, 4179.0], [10.0, 4192.0], [10.1, 4211.0], [10.2, 4228.0], [10.3, 4231.0], [10.4, 4256.0], [10.5, 4264.0], [10.6, 4279.0], [10.7, 4297.0], [10.8, 4306.0], [10.9, 4315.0], [11.0, 4333.0], [11.1, 4368.0], [11.2, 4405.0], [11.3, 4413.0], [11.4, 4428.0], [11.5, 4437.0], [11.6, 4455.0], [11.7, 4478.0], [11.8, 4481.0], [11.9, 4493.0], [12.0, 4504.0], [12.1, 4515.0], [12.2, 4540.0], [12.3, 4546.0], [12.4, 4556.0], [12.5, 4567.0], [12.6, 4592.0], [12.7, 4605.0], [12.8, 4615.0], [12.9, 4631.0], [13.0, 4644.0], [13.1, 4654.0], [13.2, 4666.0], [13.3, 4674.0], [13.4, 4675.0], [13.5, 4685.0], [13.6, 4687.0], [13.7, 4694.0], [13.8, 4702.0], [13.9, 4708.0], [14.0, 4716.0], [14.1, 4719.0], [14.2, 4726.0], [14.3, 4732.0], [14.4, 4735.0], [14.5, 4741.0], [14.6, 4751.0], [14.7, 4763.0], [14.8, 4770.0], [14.9, 4770.0], [15.0, 4774.0], [15.1, 4777.0], [15.2, 4791.0], [15.3, 4797.0], [15.4, 4809.0], [15.5, 4815.0], [15.6, 4815.0], [15.7, 4819.0], [15.8, 4842.0], [15.9, 4843.0], [16.0, 4846.0], [16.1, 4848.0], [16.2, 4869.0], [16.3, 4886.0], [16.4, 4887.0], [16.5, 4891.0], [16.6, 4899.0], [16.7, 4909.0], [16.8, 4930.0], [16.9, 4934.0], [17.0, 4936.0], [17.1, 4949.0], [17.2, 4957.0], [17.3, 4973.0], [17.4, 4975.0], [17.5, 4980.0], [17.6, 5005.0], [17.7, 5010.0], [17.8, 5011.0], [17.9, 5014.0], [18.0, 5022.0], [18.1, 5046.0], [18.2, 5053.0], [18.3, 5070.0], [18.4, 5077.0], [18.5, 5086.0], [18.6, 5089.0], [18.7, 5099.0], [18.8, 5113.0], [18.9, 5143.0], [19.0, 5153.0], [19.1, 5168.0], [19.2, 5192.0], [19.3, 5199.0], [19.4, 5216.0], [19.5, 5228.0], [19.6, 5257.0], [19.7, 5259.0], [19.8, 5264.0], [19.9, 5268.0], [20.0, 5289.0], [20.1, 5306.0], [20.2, 5316.0], [20.3, 5326.0], [20.4, 5336.0], [20.5, 5350.0], [20.6, 5383.0], [20.7, 5401.0], [20.8, 5407.0], [20.9, 5423.0], [21.0, 5426.0], [21.1, 5439.0], [21.2, 5441.0], [21.3, 5441.0], [21.4, 5449.0], [21.5, 5452.0], [21.6, 5487.0], [21.7, 5500.0], [21.8, 5515.0], [21.9, 5527.0], [22.0, 5530.0], [22.1, 5544.0], [22.2, 5555.0], [22.3, 5569.0], [22.4, 5577.0], [22.5, 5589.0], [22.6, 5613.0], [22.7, 5621.0], [22.8, 5625.0], [22.9, 5630.0], [23.0, 5636.0], [23.1, 5643.0], [23.2, 5646.0], [23.3, 5655.0], [23.4, 5685.0], [23.5, 5690.0], [23.6, 5691.0], [23.7, 5701.0], [23.8, 5718.0], [23.9, 5728.0], [24.0, 5754.0], [24.1, 5786.0], [24.2, 5837.0], [24.3, 5843.0], [24.4, 5870.0], [24.5, 5907.0], [24.6, 5917.0], [24.7, 5930.0], [24.8, 5939.0], [24.9, 5962.0], [25.0, 5973.0], [25.1, 6003.0], [25.2, 6015.0], [25.3, 6042.0], [25.4, 6052.0], [25.5, 6092.0], [25.6, 6103.0], [25.7, 6122.0], [25.8, 6142.0], [25.9, 6163.0], [26.0, 6192.0], [26.1, 6198.0], [26.2, 6204.0], [26.3, 6211.0], [26.4, 6224.0], [26.5, 6235.0], [26.6, 6270.0], [26.7, 6289.0], [26.8, 6308.0], [26.9, 6345.0], [27.0, 6349.0], [27.1, 6357.0], [27.2, 6364.0], [27.3, 6398.0], [27.4, 6414.0], [27.5, 6441.0], [27.6, 6459.0], [27.7, 6466.0], [27.8, 6511.0], [27.9, 6534.0], [28.0, 6535.0], [28.1, 6562.0], [28.2, 6563.0], [28.3, 6568.0], [28.4, 6598.0], [28.5, 6615.0], [28.6, 6642.0], [28.7, 6653.0], [28.8, 6660.0], [28.9, 6666.0], [29.0, 6693.0], [29.1, 6700.0], [29.2, 6711.0], [29.3, 6730.0], [29.4, 6757.0], [29.5, 6811.0], [29.6, 6818.0], [29.7, 6828.0], [29.8, 6836.0], [29.9, 6861.0], [30.0, 6880.0], [30.1, 6907.0], [30.2, 6935.0], [30.3, 6946.0], [30.4, 6954.0], [30.5, 6958.0], [30.6, 6971.0], [30.7, 6977.0], [30.8, 7014.0], [30.9, 7025.0], [31.0, 7033.0], [31.1, 7044.0], [31.2, 7053.0], [31.3, 7079.0], [31.4, 7095.0], [31.5, 7101.0], [31.6, 7102.0], [31.7, 7112.0], [31.8, 7128.0], [31.9, 7149.0], [32.0, 7170.0], [32.1, 7181.0], [32.2, 7184.0], [32.3, 7191.0], [32.4, 7197.0], [32.5, 7214.0], [32.6, 7233.0], [32.7, 7236.0], [32.8, 7255.0], [32.9, 7270.0], [33.0, 7273.0], [33.1, 7278.0], [33.2, 7302.0], [33.3, 7307.0], [33.4, 7318.0], [33.5, 7327.0], [33.6, 7340.0], [33.7, 7348.0], [33.8, 7360.0], [33.9, 7370.0], [34.0, 7380.0], [34.1, 7387.0], [34.2, 7393.0], [34.3, 7398.0], [34.4, 7406.0], [34.5, 7412.0], [34.6, 7435.0], [34.7, 7448.0], [34.8, 7473.0], [34.9, 7474.0], [35.0, 7485.0], [35.1, 7497.0], [35.2, 7499.0], [35.3, 7506.0], [35.4, 7515.0], [35.5, 7520.0], [35.6, 7529.0], [35.7, 7557.0], [35.8, 7571.0], [35.9, 7578.0], [36.0, 7613.0], [36.1, 7619.0], [36.2, 7635.0], [36.3, 7655.0], [36.4, 7668.0], [36.5, 7697.0], [36.6, 7699.0], [36.7, 7711.0], [36.8, 7729.0], [36.9, 7740.0], [37.0, 7774.0], [37.1, 7785.0], [37.2, 7791.0], [37.3, 7802.0], [37.4, 7817.0], [37.5, 7822.0], [37.6, 7834.0], [37.7, 7836.0], [37.8, 7844.0], [37.9, 7894.0], [38.0, 7905.0], [38.1, 7919.0], [38.2, 7926.0], [38.3, 7934.0], [38.4, 7957.0], [38.5, 7986.0], [38.6, 8006.0], [38.7, 8015.0], [38.8, 8033.0], [38.9, 8041.0], [39.0, 8060.0], [39.1, 8083.0], [39.2, 8102.0], [39.3, 8115.0], [39.4, 8123.0], [39.5, 8135.0], [39.6, 8183.0], [39.7, 8221.0], [39.8, 8229.0], [39.9, 8238.0], [40.0, 8244.0], [40.1, 8250.0], [40.2, 8258.0], [40.3, 8269.0], [40.4, 8283.0], [40.5, 8304.0], [40.6, 8319.0], [40.7, 8339.0], [40.8, 8370.0], [40.9, 8384.0], [41.0, 8405.0], [41.1, 8418.0], [41.2, 8437.0], [41.3, 8458.0], [41.4, 8469.0], [41.5, 8476.0], [41.6, 8491.0], [41.7, 8510.0], [41.8, 8524.0], [41.9, 8538.0], [42.0, 8551.0], [42.1, 8554.0], [42.2, 8595.0], [42.3, 8602.0], [42.4, 8606.0], [42.5, 8614.0], [42.6, 8627.0], [42.7, 8652.0], [42.8, 8664.0], [42.9, 8665.0], [43.0, 8670.0], [43.1, 8711.0], [43.2, 8712.0], [43.3, 8735.0], [43.4, 8752.0], [43.5, 8777.0], [43.6, 8782.0], [43.7, 8793.0], [43.8, 8796.0], [43.9, 8803.0], [44.0, 8807.0], [44.1, 8829.0], [44.2, 8837.0], [44.3, 8840.0], [44.4, 8893.0], [44.5, 8933.0], [44.6, 8949.0], [44.7, 8968.0], [44.8, 8988.0], [44.9, 9000.0], [45.0, 9014.0], [45.1, 9029.0], [45.2, 9034.0], [45.3, 9038.0], [45.4, 9049.0], [45.5, 9055.0], [45.6, 9074.0], [45.7, 9083.0], [45.8, 9101.0], [45.9, 9112.0], [46.0, 9124.0], [46.1, 9138.0], [46.2, 9166.0], [46.3, 9168.0], [46.4, 9184.0], [46.5, 9216.0], [46.6, 9221.0], [46.7, 9224.0], [46.8, 9225.0], [46.9, 9236.0], [47.0, 9237.0], [47.1, 9255.0], [47.2, 9268.0], [47.3, 9274.0], [47.4, 9293.0], [47.5, 9305.0], [47.6, 9331.0], [47.7, 9341.0], [47.8, 9352.0], [47.9, 9358.0], [48.0, 9370.0], [48.1, 9384.0], [48.2, 9392.0], [48.3, 9416.0], [48.4, 9447.0], [48.5, 9449.0], [48.6, 9465.0], [48.7, 9482.0], [48.8, 9508.0], [48.9, 9519.0], [49.0, 9523.0], [49.1, 9532.0], [49.2, 9536.0], [49.3, 9542.0], [49.4, 9608.0], [49.5, 9615.0], [49.6, 9636.0], [49.7, 9639.0], [49.8, 9648.0], [49.9, 9683.0], [50.0, 9700.0], [50.1, 9708.0], [50.2, 9731.0], [50.3, 9743.0], [50.4, 9745.0], [50.5, 9755.0], [50.6, 9758.0], [50.7, 9762.0], [50.8, 9784.0], [50.9, 9800.0], [51.0, 9808.0], [51.1, 9832.0], [51.2, 9838.0], [51.3, 9840.0], [51.4, 9859.0], [51.5, 9881.0], [51.6, 9886.0], [51.7, 9907.0], [51.8, 9912.0], [51.9, 9927.0], [52.0, 9930.0], [52.1, 9939.0], [52.2, 9954.0], [52.3, 9973.0], [52.4, 9994.0], [52.5, 10006.0], [52.6, 10011.0], [52.7, 10020.0], [52.8, 10039.0], [52.9, 10048.0], [53.0, 10067.0], [53.1, 10083.0], [53.2, 10092.0], [53.3, 10096.0], [53.4, 10112.0], [53.5, 10118.0], [53.6, 10123.0], [53.7, 10135.0], [53.8, 10140.0], [53.9, 10142.0], [54.0, 10144.0], [54.1, 10149.0], [54.2, 10164.0], [54.3, 10176.0], [54.4, 10191.0], [54.5, 10210.0], [54.6, 10214.0], [54.7, 10224.0], [54.8, 10250.0], [54.9, 10260.0], [55.0, 10270.0], [55.1, 10285.0], [55.2, 10302.0], [55.3, 10309.0], [55.4, 10317.0], [55.5, 10324.0], [55.6, 10332.0], [55.7, 10344.0], [55.8, 10353.0], [55.9, 10367.0], [56.0, 10376.0], [56.1, 10378.0], [56.2, 10394.0], [56.3, 10428.0], [56.4, 10429.0], [56.5, 10432.0], [56.6, 10446.0], [56.7, 10457.0], [56.8, 10469.0], [56.9, 10495.0], [57.0, 10537.0], [57.1, 10563.0], [57.2, 10583.0], [57.3, 10599.0], [57.4, 10615.0], [57.5, 10647.0], [57.6, 10652.0], [57.7, 10658.0], [57.8, 10669.0], [57.9, 10676.0], [58.0, 10706.0], [58.1, 10716.0], [58.2, 10785.0], [58.3, 10796.0], [58.4, 10838.0], [58.5, 10868.0], [58.6, 10876.0], [58.7, 10877.0], [58.8, 10880.0], [58.9, 10893.0], [59.0, 10913.0], [59.1, 10924.0], [59.2, 10951.0], [59.3, 10961.0], [59.4, 10964.0], [59.5, 10977.0], [59.6, 10989.0], [59.7, 10999.0], [59.8, 11004.0], [59.9, 11006.0], [60.0, 11020.0], [60.1, 11039.0], [60.2, 11058.0], [60.3, 11081.0], [60.4, 11121.0], [60.5, 11130.0], [60.6, 11141.0], [60.7, 11157.0], [60.8, 11164.0], [60.9, 11187.0], [61.0, 11197.0], [61.1, 11201.0], [61.2, 11211.0], [61.3, 11218.0], [61.4, 11242.0], [61.5, 11250.0], [61.6, 11254.0], [61.7, 11287.0], [61.8, 11303.0], [61.9, 11305.0], [62.0, 11330.0], [62.1, 11356.0], [62.2, 11373.0], [62.3, 11392.0], [62.4, 11398.0], [62.5, 11406.0], [62.6, 11419.0], [62.7, 11432.0], [62.8, 11441.0], [62.9, 11450.0], [63.0, 11474.0], [63.1, 11491.0], [63.2, 11499.0], [63.3, 11516.0], [63.4, 11535.0], [63.5, 11556.0], [63.6, 11569.0], [63.7, 11578.0], [63.8, 11589.0], [63.9, 11591.0], [64.0, 11592.0], [64.1, 11627.0], [64.2, 11642.0], [64.3, 11689.0], [64.4, 11710.0], [64.5, 11722.0], [64.6, 11730.0], [64.7, 11765.0], [64.8, 11774.0], [64.9, 11780.0], [65.0, 11796.0], [65.1, 11807.0], [65.2, 11811.0], [65.3, 11857.0], [65.4, 11869.0], [65.5, 11880.0], [65.6, 11894.0], [65.7, 11910.0], [65.8, 11925.0], [65.9, 11931.0], [66.0, 11971.0], [66.1, 11994.0], [66.2, 12020.0], [66.3, 12043.0], [66.4, 12076.0], [66.5, 12090.0], [66.6, 12104.0], [66.7, 12114.0], [66.8, 12154.0], [66.9, 12164.0], [67.0, 12177.0], [67.1, 12183.0], [67.2, 12188.0], [67.3, 12205.0], [67.4, 12206.0], [67.5, 12215.0], [67.6, 12256.0], [67.7, 12258.0], [67.8, 12266.0], [67.9, 12272.0], [68.0, 12285.0], [68.1, 12296.0], [68.2, 12311.0], [68.3, 12313.0], [68.4, 12317.0], [68.5, 12331.0], [68.6, 12338.0], [68.7, 12342.0], [68.8, 12351.0], [68.9, 12362.0], [69.0, 12375.0], [69.1, 12387.0], [69.2, 12391.0], [69.3, 12396.0], [69.4, 12400.0], [69.5, 12409.0], [69.6, 12424.0], [69.7, 12432.0], [69.8, 12436.0], [69.9, 12468.0], [70.0, 12474.0], [70.1, 12489.0], [70.2, 12566.0], [70.3, 12603.0], [70.4, 12607.0], [70.5, 12613.0], [70.6, 12637.0], [70.7, 12667.0], [70.8, 12689.0], [70.9, 12691.0], [71.0, 12696.0], [71.1, 12704.0], [71.2, 12714.0], [71.3, 12724.0], [71.4, 12732.0], [71.5, 12740.0], [71.6, 12742.0], [71.7, 12752.0], [71.8, 12761.0], [71.9, 12788.0], [72.0, 12790.0], [72.1, 12809.0], [72.2, 12819.0], [72.3, 12829.0], [72.4, 12846.0], [72.5, 12855.0], [72.6, 12882.0], [72.7, 12894.0], [72.8, 12913.0], [72.9, 12920.0], [73.0, 12937.0], [73.1, 12965.0], [73.2, 12995.0], [73.3, 13027.0], [73.4, 13032.0], [73.5, 13035.0], [73.6, 13050.0], [73.7, 13083.0], [73.8, 13095.0], [73.9, 13119.0], [74.0, 13129.0], [74.1, 13138.0], [74.2, 13149.0], [74.3, 13151.0], [74.4, 13153.0], [74.5, 13165.0], [74.6, 13192.0], [74.7, 13195.0], [74.8, 13202.0], [74.9, 13211.0], [75.0, 13222.0], [75.1, 13232.0], [75.2, 13250.0], [75.3, 13258.0], [75.4, 13295.0], [75.5, 13309.0], [75.6, 13338.0], [75.7, 13342.0], [75.8, 13354.0], [75.9, 13369.0], [76.0, 13396.0], [76.1, 13402.0], [76.2, 13419.0], [76.3, 13424.0], [76.4, 13425.0], [76.5, 13429.0], [76.6, 13454.0], [76.7, 13460.0], [76.8, 13465.0], [76.9, 13474.0], [77.0, 13494.0], [77.1, 13511.0], [77.2, 13520.0], [77.3, 13524.0], [77.4, 13533.0], [77.5, 13542.0], [77.6, 13560.0], [77.7, 13561.0], [77.8, 13563.0], [77.9, 13579.0], [78.0, 13594.0], [78.1, 13606.0], [78.2, 13614.0], [78.3, 13616.0], [78.4, 13635.0], [78.5, 13645.0], [78.6, 13668.0], [78.7, 13670.0], [78.8, 13680.0], [78.9, 13682.0], [79.0, 13692.0], [79.1, 13700.0], [79.2, 13714.0], [79.3, 13735.0], [79.4, 13739.0], [79.5, 13746.0], [79.6, 13756.0], [79.7, 13771.0], [79.8, 13803.0], [79.9, 13808.0], [80.0, 13817.0], [80.1, 13846.0], [80.2, 13876.0], [80.3, 13882.0], [80.4, 13891.0], [80.5, 13901.0], [80.6, 13905.0], [80.7, 13917.0], [80.8, 13924.0], [80.9, 13926.0], [81.0, 13940.0], [81.1, 13947.0], [81.2, 13958.0], [81.3, 13961.0], [81.4, 13973.0], [81.5, 13973.0], [81.6, 13986.0], [81.7, 13987.0], [81.8, 13995.0], [81.9, 14003.0], [82.0, 14012.0], [82.1, 14029.0], [82.2, 14035.0], [82.3, 14039.0], [82.4, 14054.0], [82.5, 14056.0], [82.6, 14062.0], [82.7, 14067.0], [82.8, 14082.0], [82.9, 14084.0], [83.0, 14091.0], [83.1, 14112.0], [83.2, 14119.0], [83.3, 14124.0], [83.4, 14127.0], [83.5, 14133.0], [83.6, 14140.0], [83.7, 14142.0], [83.8, 14145.0], [83.9, 14146.0], [84.0, 14152.0], [84.1, 14180.0], [84.2, 14184.0], [84.3, 14197.0], [84.4, 14202.0], [84.5, 14212.0], [84.6, 14213.0], [84.7, 14218.0], [84.8, 14223.0], [84.9, 14233.0], [85.0, 14244.0], [85.1, 14249.0], [85.2, 14253.0], [85.3, 14259.0], [85.4, 14261.0], [85.5, 14268.0], [85.6, 14269.0], [85.7, 14274.0], [85.8, 14278.0], [85.9, 14287.0], [86.0, 14288.0], [86.1, 14295.0], [86.2, 14306.0], [86.3, 14309.0], [86.4, 14311.0], [86.5, 14314.0], [86.6, 14318.0], [86.7, 14327.0], [86.8, 14333.0], [86.9, 14337.0], [87.0, 14341.0], [87.1, 14346.0], [87.2, 14354.0], [87.3, 14357.0], [87.4, 14362.0], [87.5, 14365.0], [87.6, 14366.0], [87.7, 14370.0], [87.8, 14374.0], [87.9, 14375.0], [88.0, 14379.0], [88.1, 14380.0], [88.2, 14389.0], [88.3, 14393.0], [88.4, 14411.0], [88.5, 14416.0], [88.6, 14418.0], [88.7, 14433.0], [88.8, 14435.0], [88.9, 14444.0], [89.0, 14451.0], [89.1, 14453.0], [89.2, 14459.0], [89.3, 14471.0], [89.4, 14476.0], [89.5, 14488.0], [89.6, 14489.0], [89.7, 14494.0], [89.8, 14500.0], [89.9, 14508.0], [90.0, 14522.0], [90.1, 14529.0], [90.2, 14538.0], [90.3, 14541.0], [90.4, 14543.0], [90.5, 14544.0], [90.6, 14551.0], [90.7, 14553.0], [90.8, 14554.0], [90.9, 14559.0], [91.0, 14567.0], [91.1, 14581.0], [91.2, 14583.0], [91.3, 14595.0], [91.4, 14603.0], [91.5, 14612.0], [91.6, 14632.0], [91.7, 14639.0], [91.8, 14643.0], [91.9, 14658.0], [92.0, 14664.0], [92.1, 14671.0], [92.2, 14676.0], [92.3, 14695.0], [92.4, 14700.0], [92.5, 14725.0], [92.6, 14733.0], [92.7, 14739.0], [92.8, 14748.0], [92.9, 14763.0], [93.0, 14778.0], [93.1, 14786.0], [93.2, 14793.0], [93.3, 14805.0], [93.4, 14809.0], [93.5, 14815.0], [93.6, 14826.0], [93.7, 14831.0], [93.8, 14835.0], [93.9, 14846.0], [94.0, 14857.0], [94.1, 14868.0], [94.2, 14873.0], [94.3, 14876.0], [94.4, 14892.0], [94.5, 14893.0], [94.6, 14904.0], [94.7, 14915.0], [94.8, 14917.0], [94.9, 14925.0], [95.0, 14927.0], [95.1, 14946.0], [95.2, 14953.0], [95.3, 14964.0], [95.4, 14970.0], [95.5, 14989.0], [95.6, 15002.0], [95.7, 15010.0], [95.8, 15019.0], [95.9, 15037.0], [96.0, 15054.0], [96.1, 15056.0], [96.2, 15059.0], [96.3, 15073.0], [96.4, 15082.0], [96.5, 15093.0], [96.6, 15100.0], [96.7, 15124.0], [96.8, 15126.0], [96.9, 15143.0], [97.0, 15156.0], [97.1, 15165.0], [97.2, 15173.0], [97.3, 15188.0], [97.4, 15213.0], [97.5, 15221.0], [97.6, 15234.0], [97.7, 15236.0], [97.8, 15260.0], [97.9, 15264.0], [98.0, 15324.0], [98.1, 15332.0], [98.2, 15365.0], [98.3, 15396.0], [98.4, 15419.0], [98.5, 15437.0], [98.6, 15478.0], [98.7, 15501.0], [98.8, 15516.0], [98.9, 15557.0], [99.0, 15606.0], [99.1, 15635.0], [99.2, 15653.0], [99.3, 15673.0], [99.4, 15694.0], [99.5, 15700.0], [99.6, 15703.0], [99.7, 15722.0], [99.8, 15770.0], [99.9, 15797.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 45.0, "series": [{"data": [[500.0, 1.0], [600.0, 1.0], [700.0, 1.0], [1100.0, 5.0], [1200.0, 10.0], [1300.0, 4.0], [1400.0, 4.0], [1500.0, 6.0], [1600.0, 3.0], [1700.0, 8.0], [1800.0, 2.0], [1900.0, 3.0], [2000.0, 1.0], [2100.0, 5.0], [2200.0, 4.0], [2300.0, 4.0], [2400.0, 8.0], [2500.0, 4.0], [2600.0, 7.0], [2700.0, 1.0], [2800.0, 1.0], [2900.0, 4.0], [3000.0, 6.0], [3100.0, 4.0], [3200.0, 3.0], [3300.0, 1.0], [3400.0, 5.0], [3500.0, 3.0], [3700.0, 10.0], [3800.0, 12.0], [3900.0, 21.0], [4000.0, 25.0], [4100.0, 23.0], [4200.0, 15.0], [4300.0, 8.0], [4400.0, 16.0], [4600.0, 23.0], [4500.0, 13.0], [4700.0, 31.0], [4800.0, 26.0], [4900.0, 18.0], [5000.0, 24.0], [5100.0, 12.0], [5300.0, 12.0], [5200.0, 15.0], [5500.0, 17.0], [5600.0, 23.0], [5400.0, 20.0], [5800.0, 7.0], [5700.0, 9.0], [6000.0, 11.0], [5900.0, 11.0], [6100.0, 11.0], [6200.0, 13.0], [6300.0, 11.0], [6600.0, 12.0], [6500.0, 14.0], [6400.0, 9.0], [6800.0, 12.0], [6700.0, 8.0], [6900.0, 14.0], [7000.0, 14.0], [7100.0, 19.0], [7400.0, 18.0], [7300.0, 23.0], [7200.0, 15.0], [7600.0, 14.0], [7500.0, 14.0], [7700.0, 13.0], [7800.0, 14.0], [7900.0, 13.0], [8000.0, 11.0], [8100.0, 10.0], [8300.0, 10.0], [8400.0, 13.0], [8500.0, 13.0], [8700.0, 16.0], [8200.0, 17.0], [8600.0, 16.0], [8800.0, 11.0], [8900.0, 9.0], [9100.0, 13.0], [9000.0, 18.0], [9200.0, 21.0], [9400.0, 10.0], [9500.0, 13.0], [9600.0, 12.0], [9300.0, 15.0], [9700.0, 18.0], [9900.0, 15.0], [9800.0, 16.0], [10100.0, 22.0], [10000.0, 18.0], [10200.0, 15.0], [10300.0, 21.0], [10400.0, 14.0], [10700.0, 7.0], [10500.0, 8.0], [10600.0, 13.0], [10800.0, 12.0], [11200.0, 14.0], [11100.0, 15.0], [10900.0, 17.0], [11000.0, 11.0], [11300.0, 13.0], [11400.0, 16.0], [11500.0, 16.0], [11700.0, 13.0], [11600.0, 7.0], [12200.0, 17.0], [11800.0, 12.0], [12100.0, 14.0], [11900.0, 10.0], [12000.0, 9.0], [12300.0, 25.0], [12600.0, 16.0], [12700.0, 20.0], [12500.0, 3.0], [12400.0, 15.0], [12900.0, 10.0], [12800.0, 13.0], [13000.0, 12.0], [13200.0, 14.0], [13300.0, 13.0], [13100.0, 18.0], [13600.0, 21.0], [13400.0, 19.0], [13500.0, 20.0], [13700.0, 14.0], [13800.0, 14.0], [13900.0, 28.0], [14000.0, 24.0], [14100.0, 25.0], [14200.0, 36.0], [14300.0, 45.0], [14500.0, 33.0], [14600.0, 20.0], [14400.0, 27.0], [14700.0, 17.0], [14800.0, 26.0], [14900.0, 20.0], [15100.0, 15.0], [15000.0, 21.0], [15200.0, 12.0], [15300.0, 8.0], [15400.0, 7.0], [15600.0, 11.0], [15700.0, 9.0], [15800.0, 1.0], [15500.0, 5.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 15800.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 26.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1974.0, "series": [{"data": [[1.0, 26.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 1974.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 887.8370000000006, "minX": 1.5495831E12, "maxY": 887.8370000000006, "series": [{"data": [[1.5495831E12, 887.8370000000006]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 2713.0, "minX": 1.0, "maxY": 15810.0, "series": [{"data": [[2.0, 14543.0], [3.0, 14946.0], [4.0, 14339.0], [5.0, 14760.0], [6.0, 14658.0], [7.0, 14550.0], [8.0, 14333.0], [10.0, 14468.5], [11.0, 15645.0], [13.0, 14584.5], [14.0, 14414.0], [15.0, 14603.0], [16.0, 14635.0], [17.0, 14916.0], [19.0, 14696.5], [20.0, 14333.0], [21.0, 14582.0], [22.0, 15797.0], [23.0, 14341.0], [24.0, 15722.0], [25.0, 14551.0], [26.0, 14374.0], [28.0, 15666.5], [29.0, 14295.0], [30.0, 14643.0], [31.0, 15478.0], [33.0, 15103.0], [32.0, 15426.0], [35.0, 14352.0], [34.0, 15100.0], [37.0, 14543.0], [36.0, 14374.0], [39.0, 14488.0], [38.0, 14310.0], [41.0, 14456.0], [40.0, 14729.0], [43.0, 14541.0], [42.0, 15234.0], [44.0, 14830.0], [47.0, 14433.0], [46.0, 14703.5], [48.0, 14805.0], [51.0, 15098.0], [50.0, 15566.0], [53.0, 14425.0], [55.0, 14559.0], [54.0, 14543.0], [57.0, 15606.0], [56.0, 14474.0], [59.0, 14396.0], [58.0, 15785.0], [61.0, 14857.0], [60.0, 14379.0], [63.0, 14868.0], [62.0, 14249.0], [67.0, 14371.0], [66.0, 14544.0], [65.0, 14468.0], [64.0, 14970.0], [71.0, 14491.0], [70.0, 14385.0], [69.0, 15306.0], [75.0, 14902.0], [73.0, 14253.0], [72.0, 14274.0], [79.0, 15365.0], [78.0, 14596.5], [76.0, 14212.0], [83.0, 14841.0], [82.0, 14357.0], [81.0, 14335.0], [80.0, 14311.0], [87.0, 14380.0], [86.0, 15694.0], [85.0, 15653.0], [84.0, 15689.0], [91.0, 14260.0], [90.0, 15502.0], [89.0, 14354.0], [88.0, 15655.0], [95.0, 14358.0], [94.0, 15714.0], [93.0, 14278.0], [92.0, 15056.0], [99.0, 14218.0], [98.0, 14259.0], [97.0, 14849.0], [96.0, 15600.0], [103.0, 15770.0], [102.0, 14200.0], [101.0, 15083.0], [107.0, 14337.0], [106.0, 14471.0], [105.0, 14816.0], [104.0, 14369.0], [111.0, 14832.0], [110.0, 14375.0], [109.0, 14416.0], [108.0, 14925.0], [115.0, 15494.0], [114.0, 15516.0], [113.0, 14448.0], [112.0, 14651.0], [118.0, 15221.0], [117.0, 14927.0], [116.0, 15550.0], [123.0, 14541.0], [122.0, 14317.0], [121.0, 15328.0], [120.0, 14694.0], [127.0, 15419.0], [126.0, 14826.0], [125.0, 14123.0], [124.0, 14671.0], [135.0, 14904.0], [134.0, 14233.0], [133.0, 14314.0], [132.0, 14343.0], [131.0, 15260.0], [130.0, 14522.0], [129.0, 15703.0], [128.0, 14553.0], [143.0, 14634.5], [141.0, 14552.0], [140.0, 15501.0], [139.0, 14298.0], [137.0, 14553.0], [136.0, 14665.0], [151.0, 15073.0], [150.0, 14054.0], [149.0, 14318.0], [148.0, 14488.0], [147.0, 15114.0], [145.0, 14801.0], [144.0, 14326.0], [159.0, 14119.0], [158.0, 14059.0], [157.0, 14875.0], [156.0, 15019.0], [155.0, 14989.0], [154.0, 14397.5], [152.0, 14417.0], [167.0, 14288.0], [166.0, 15005.0], [165.0, 14082.0], [164.0, 15155.0], [163.0, 14698.0], [162.0, 15059.0], [161.0, 14365.0], [160.0, 14451.0], [168.0, 7998.0], [169.0, 7543.5], [171.0, 7881.5], [175.0, 14131.0], [174.0, 14027.0], [173.0, 14366.0], [172.0, 14793.0], [170.0, 14508.0], [183.0, 14062.0], [182.0, 15125.0], [181.0, 14674.0], [180.0, 14268.0], [179.0, 15261.0], [178.0, 13966.0], [177.0, 14192.0], [176.0, 13919.0], [191.0, 14363.0], [190.0, 14921.0], [189.0, 14082.0], [188.0, 14558.0], [187.0, 14268.0], [186.0, 14029.0], [185.0, 14868.0], [184.0, 15204.0], [199.0, 13877.0], [198.0, 15264.0], [197.0, 13891.0], [196.0, 14411.0], [195.0, 14915.0], [194.0, 14887.0], [193.0, 14127.0], [192.0, 14202.0], [207.0, 14433.0], [206.0, 15173.0], [205.0, 15324.0], [204.0, 14176.0], [202.0, 14054.0], [201.0, 14231.0], [200.0, 15396.0], [215.0, 14554.0], [214.0, 14846.0], [213.0, 15346.0], [212.0, 15369.0], [211.0, 13909.0], [210.0, 15143.0], [209.0, 14039.0], [208.0, 14793.0], [223.0, 15213.0], [222.0, 14709.0], [221.0, 14033.0], [220.0, 14835.0], [219.0, 13904.0], [218.0, 14309.0], [217.0, 14529.0], [216.0, 15082.0], [231.0, 13680.0], [230.0, 15093.0], [229.0, 15259.0], [228.0, 14676.0], [227.0, 15165.0], [226.0, 14926.0], [225.0, 14244.0], [224.0, 13817.0], [239.0, 14392.0], [238.0, 15136.0], [237.0, 14733.0], [236.0, 15173.0], [235.0, 15214.0], [234.0, 13991.0], [233.0, 15180.0], [232.0, 14809.0], [247.0, 14643.0], [246.0, 14267.0], [245.0, 14091.0], [244.0, 14725.0], [243.0, 14287.0], [242.0, 13693.0], [241.0, 14124.0], [240.0, 14778.0], [255.0, 14295.0], [254.0, 15037.0], [253.0, 14987.0], [252.0, 13958.0], [251.0, 15810.0], [250.0, 14917.0], [249.0, 14568.0], [248.0, 15054.0], [270.0, 14451.0], [271.0, 14963.0], [269.0, 13560.0], [268.0, 13973.0], [267.0, 15065.0], [266.0, 13876.0], [265.0, 13636.0], [264.0, 14269.0], [263.0, 13986.0], [257.0, 14735.0], [256.0, 14393.0], [259.0, 13943.0], [258.0, 15701.0], [262.0, 14064.0], [261.0, 14476.0], [260.0, 13682.0], [286.0, 14148.0], [287.0, 13407.0], [285.0, 15011.0], [284.0, 14763.0], [283.0, 15001.0], [282.0, 14145.0], [281.0, 15043.0], [280.0, 14639.0], [279.0, 14056.0], [273.0, 14940.5], [275.0, 15673.0], [274.0, 15019.0], [278.0, 14357.0], [277.0, 14500.0], [276.0, 13818.0], [302.0, 14659.0], [303.0, 13917.0], [301.0, 13670.0], [300.0, 14389.0], [299.0, 14288.0], [298.0, 14180.0], [297.0, 14763.0], [296.0, 15089.5], [294.0, 13425.0], [288.0, 14915.0], [290.0, 15417.0], [289.0, 13756.0], [293.0, 14068.0], [292.0, 14493.5], [307.0, 5345.333333333333], [305.0, 5462.333333333333], [306.0, 5457.333333333333], [308.0, 4576.25], [309.0, 4398.0], [311.0, 14609.0], [304.0, 13628.0], [310.0, 14183.0], [318.0, 7410.5], [319.0, 13806.0], [313.0, 14306.0], [312.0, 13739.0], [315.0, 14583.0], [314.0, 13579.0], [317.0, 15188.0], [316.0, 14145.0], [334.0, 13947.0], [325.0, 7528.0], [324.0, 14287.0], [327.0, 14146.0], [321.0, 14687.0], [320.0, 14247.0], [323.0, 13682.0], [322.0, 14613.0], [326.0, 14346.0], [335.0, 15300.0], [333.0, 14429.0], [332.0, 13616.0], [331.0, 14137.0], [330.0, 14261.0], [329.0, 14595.0], [328.0, 13959.0], [338.0, 7883.0], [336.0, 7846.0], [337.0, 15126.0], [343.0, 15124.0], [342.0, 13562.0], [341.0, 13655.0], [340.0, 13897.0], [344.0, 5460.666666666666], [351.0, 14378.0], [350.0, 13541.0], [349.0, 15236.0], [348.0, 14535.0], [339.0, 13309.0], [347.0, 15070.0], [345.0, 14112.0], [367.0, 13614.0], [360.0, 5874.333333333333], [366.0, 13222.0], [365.0, 14612.0], [364.0, 14223.0], [355.0, 13560.0], [354.0, 13454.0], [353.0, 14831.0], [352.0, 15002.0], [363.0, 14435.0], [362.0, 13218.0], [361.0, 13924.0], [359.0, 14091.0], [358.0, 15156.0], [357.0, 13202.0], [356.0, 14511.0], [382.0, 13525.0], [370.0, 7664.5], [375.0, 7946.0], [369.0, 13119.0], [368.0, 13152.0], [374.0, 14700.0], [373.0, 14739.0], [372.0, 14969.0], [381.0, 7563.5], [383.0, 13005.0], [380.0, 13033.0], [371.0, 14219.0], [379.0, 13138.0], [378.0, 14873.0], [377.0, 14502.0], [376.0, 13346.0], [398.0, 14067.0], [389.0, 8203.0], [388.0, 13815.0], [391.0, 13885.0], [385.0, 14035.0], [384.0, 13520.0], [387.0, 13169.0], [386.0, 13732.0], [390.0, 14141.0], [399.0, 14258.0], [397.0, 13714.0], [396.0, 14876.0], [395.0, 14892.0], [394.0, 14581.0], [393.0, 14278.0], [392.0, 13524.0], [414.0, 13044.0], [401.0, 7354.0], [400.0, 13798.0], [402.0, 14213.0], [407.0, 13955.0], [406.0, 13127.0], [405.0, 13746.0], [404.0, 13318.0], [403.0, 7310.5], [415.0, 14786.0], [413.0, 14664.0], [412.0, 13846.0], [411.0, 14781.0], [410.0, 13925.0], [409.0, 13961.0], [408.0, 13398.0], [430.0, 13193.0], [426.0, 7193.5], [416.0, 4500.0], [417.0, 13153.0], [419.0, 13211.0], [418.0, 12894.0], [423.0, 14156.0], [422.0, 14084.0], [421.0, 12850.0], [420.0, 14747.0], [427.0, 7714.0], [431.0, 13771.0], [429.0, 14695.0], [428.0, 12749.0], [425.0, 14481.0], [424.0, 14565.0], [447.0, 12921.0], [433.0, 6041.333333333333], [437.0, 5704.666666666666], [436.0, 12819.0], [439.0, 14303.0], [432.0, 13668.0], [438.0, 14042.0], [440.0, 5815.0], [441.0, 13095.0], [446.0, 14270.0], [445.0, 13533.0], [444.0, 14379.0], [435.0, 13542.0], [434.0, 13258.0], [443.0, 13563.0], [442.0, 14529.0], [463.0, 14012.0], [451.0, 7266.0], [450.0, 13340.0], [449.0, 13803.0], [448.0, 12691.0], [460.0, 7968.5], [462.0, 12548.0], [459.0, 13987.0], [458.0, 13402.0], [457.0, 13135.0], [456.0, 13419.0], [455.0, 12598.0], [454.0, 12769.0], [453.0, 13569.0], [452.0, 13195.0], [478.0, 14125.0], [465.0, 7534.0], [464.0, 13027.0], [467.0, 14133.0], [466.0, 12900.0], [471.0, 14003.0], [470.0, 14253.0], [469.0, 12788.0], [468.0, 14112.0], [479.0, 14212.0], [477.0, 14009.0], [476.0, 13027.0], [475.0, 12752.0], [474.0, 13243.0], [473.0, 12789.0], [472.0, 12714.0], [494.0, 13083.0], [483.0, 7338.5], [482.0, 13752.0], [481.0, 12752.0], [480.0, 13670.0], [487.0, 14140.0], [486.0, 13465.0], [485.0, 12474.0], [484.0, 13581.0], [495.0, 12436.0], [493.0, 13735.0], [492.0, 13901.0], [491.0, 12937.0], [490.0, 13940.0], [489.0, 13274.0], [488.0, 13940.0], [510.0, 12154.0], [499.0, 7156.0], [498.0, 13605.0], [497.0, 14035.0], [496.0, 13594.0], [503.0, 13996.0], [502.0, 12375.0], [501.0, 13635.0], [500.0, 13227.0], [511.0, 12704.0], [509.0, 13256.0], [508.0, 12613.0], [507.0, 13736.0], [506.0, 13424.0], [505.0, 13995.0], [504.0, 13032.0], [542.0, 12272.0], [530.0, 12761.0], [528.0, 11925.0], [532.0, 13765.0], [534.0, 13150.0], [540.0, 12429.0], [538.0, 13116.0], [536.0, 12197.0], [518.0, 13335.5], [516.0, 13202.0], [514.0, 13677.0], [512.0, 13561.0], [526.0, 12205.0], [524.0, 13502.0], [522.0, 13862.0], [520.0, 13377.0], [544.0, 13035.0], [570.0, 12020.0], [574.0, 12272.0], [552.0, 13192.0], [554.0, 13551.0], [556.0, 13511.0], [546.0, 11929.0], [548.0, 12362.0], [550.0, 12471.0], [558.0, 13489.0], [568.0, 12733.0], [564.0, 7715.0], [566.0, 12184.0], [560.0, 13460.0], [562.0, 12177.0], [572.0, 13424.0], [590.0, 12215.0], [604.0, 12372.0], [584.0, 13429.0], [586.0, 11931.0], [588.0, 12965.0], [594.0, 12829.0], [596.0, 12696.0], [598.0, 12917.0], [606.0, 12696.0], [602.0, 12809.0], [600.0, 13338.0], [582.0, 12118.0], [580.0, 12380.0], [578.0, 11808.0], [576.0, 13396.0], [622.0, 12341.0], [618.0, 12660.0], [616.0, 12698.0], [620.0, 12637.0], [634.0, 7459.0], [624.0, 11569.0], [626.0, 13301.0], [628.0, 12566.0], [630.0, 13973.0], [638.0, 12418.0], [636.0, 12438.0], [632.0, 11023.0], [614.0, 12690.0], [612.0, 12705.0], [610.0, 12223.0], [608.0, 11770.0], [642.0, 12079.0], [668.0, 12157.0], [640.0, 7378.0], [646.0, 11218.0], [664.0, 11077.0], [648.0, 7155.5], [650.0, 12347.0], [652.0, 12300.0], [654.0, 12316.0], [670.0, 6695.5], [656.0, 12285.0], [658.0, 12256.0], [660.0, 12913.0], [662.0, 11440.0], [666.0, 12168.0], [672.0, 7101.5], [678.0, 11776.0], [676.0, 11765.0], [674.0, 11452.0], [696.0, 11393.0], [684.0, 7624.5], [682.0, 12528.0], [680.0, 11862.0], [686.0, 12605.0], [702.0, 11592.0], [688.0, 12628.0], [690.0, 11801.0], [692.0, 11910.0], [694.0, 11710.0], [700.0, 11781.0], [698.0, 12391.0], [704.0, 12363.5], [732.0, 12995.0], [708.0, 7087.5], [706.0, 11627.0], [710.0, 11632.0], [718.0, 12317.0], [716.0, 12396.0], [714.0, 11432.0], [712.0, 11683.0], [728.0, 7556.0], [720.0, 11398.0], [722.0, 9839.0], [724.0, 11592.0], [726.0, 11491.0], [734.0, 10884.0], [730.0, 11058.0], [762.0, 11250.0], [764.0, 12667.0], [766.0, 6941.0], [752.0, 11298.0], [754.0, 10260.0], [756.0, 11305.0], [760.0, 10716.0], [736.0, 10994.0], [738.0, 11441.0], [740.0, 12206.0], [742.0, 11924.0], [750.0, 12740.0], [748.0, 11373.0], [746.0, 12603.0], [744.0, 11388.0], [758.0, 11250.0], [784.0, 10557.0], [768.0, 6638.0], [782.0, 10370.0], [780.0, 10537.0], [778.0, 11052.0], [776.0, 11081.0], [790.0, 7385.0], [788.0, 10951.0], [786.0, 10856.0], [794.0, 6780.0], [792.0, 11516.0], [774.0, 12107.0], [772.0, 11117.0], [770.0, 10999.0], [798.0, 12351.0], [796.0, 10669.0], [802.0, 11356.0], [828.0, 10509.0], [800.0, 11730.0], [804.0, 11484.0], [806.0, 11994.0], [814.0, 10118.0], [812.0, 11574.0], [810.0, 10785.0], [808.0, 11880.0], [816.0, 10615.0], [818.0, 10667.0], [820.0, 11710.0], [822.0, 9542.0], [830.0, 10005.0], [826.0, 10036.0], [824.0, 10209.0], [832.0, 11392.0], [858.0, 10214.0], [862.0, 9987.0], [842.0, 9832.0], [840.0, 10328.0], [844.0, 10378.0], [834.0, 12104.0], [836.0, 10446.0], [846.0, 10353.0], [852.0, 10288.5], [854.0, 9755.0], [848.0, 10344.0], [850.0, 10317.0], [860.0, 10176.0], [856.0, 9873.0], [838.0, 11894.0], [894.0, 9907.0], [884.0, 6477.0], [882.0, 11405.0], [880.0, 9787.0], [886.0, 10669.0], [892.0, 6378.5], [890.0, 9954.0], [888.0, 10796.0], [870.0, 11544.0], [868.0, 10083.0], [866.0, 9615.0], [864.0, 9800.0], [878.0, 9616.0], [876.0, 10961.0], [874.0, 10006.0], [872.0, 9079.0], [898.0, 9884.0], [924.0, 10285.0], [908.0, 11215.0], [906.0, 11039.0], [904.0, 9683.0], [896.0, 9482.0], [900.0, 9886.0], [902.0, 9840.0], [910.0, 10599.0], [920.0, 6189.0], [912.0, 9743.0], [914.0, 9168.0], [916.0, 9507.0], [918.0, 9648.0], [926.0, 9611.0], [922.0, 9608.0], [930.0, 10583.0], [954.0, 6173.0], [934.0, 10479.0], [932.0, 10309.0], [928.0, 10975.0], [952.0, 10676.0], [940.0, 6672.0], [938.0, 9513.0], [936.0, 10378.0], [942.0, 10046.0], [944.0, 10020.0], [946.0, 10144.0], [948.0, 10444.0], [950.0, 10120.0], [958.0, 10647.0], [956.0, 10924.0], [990.0, 10092.0], [978.0, 9973.0], [976.0, 10296.0], [980.0, 10191.0], [982.0, 10089.0], [988.0, 9237.0], [986.0, 10706.0], [984.0, 10145.5], [966.0, 10447.0], [964.0, 9268.0], [962.0, 10574.0], [960.0, 10429.0], [974.0, 9237.0], [972.0, 10989.0], [970.0, 10180.0], [968.0, 10210.0], [994.0, 9224.0], [998.0, 5738.0], [1004.0, 9416.0], [1002.0, 10868.0], [1000.0, 9736.0], [992.0, 9803.0], [996.0, 9407.0], [1006.0, 9758.0], [1012.0, 6330.0], [1014.0, 9508.0], [1008.0, 8551.0], [1010.0, 8520.0], [1020.0, 10076.0], [1018.0, 9523.0], [1016.0, 9138.0], [1056.0, 5320.0], [1040.0, 8979.0], [1044.0, 8228.0], [1048.0, 6902.0], [1064.0, 8787.0], [1068.0, 8690.0], [1060.0, 5423.666666666666], [1076.0, 8803.0], [1072.0, 9368.0], [1036.0, 9708.0], [1032.0, 9755.0], [1028.0, 9767.0], [1024.0, 9216.0], [1080.0, 9074.0], [1084.0, 8966.0], [1052.0, 6164.5], [1088.0, 9176.0], [1140.0, 8837.0], [1112.0, 9130.0], [1108.0, 9639.0], [1104.0, 7619.0], [1116.0, 7986.0], [1092.0, 9445.0], [1096.0, 9536.0], [1100.0, 8606.0], [1136.0, 9270.0], [1120.0, 5776.0], [1124.0, 7370.0], [1128.0, 8250.0], [1132.0, 8370.0], [1148.0, 9112.0], [1200.0, 9962.0], [1184.0, 8775.0], [1176.0, 6048.5], [1172.0, 7780.0], [1168.0, 8554.0], [1180.0, 7930.0], [1196.0, 7348.0], [1192.0, 8238.0], [1188.0, 8538.0], [1204.0, 8283.0], [1152.0, 9357.0], [1156.0, 9016.0], [1160.0, 8126.0], [1164.0, 8796.0], [1208.0, 9939.0], [1212.0, 8664.0], [1216.0, 7502.0], [1220.0, 8595.0], [1244.0, 8244.0], [1240.0, 5838.0], [1236.0, 7297.0], [1232.0, 7341.0], [1228.0, 8670.0], [1224.0, 5912.0], [1248.0, 7400.0], [1252.0, 7622.0], [1276.0, 8035.0], [1272.0, 6985.0], [1256.0, 6954.0], [1260.0, 8464.0], [1264.0, 4635.0], [1268.0, 7317.0], [1284.0, 7791.0], [1280.0, 5176.333333333333], [1288.0, 7617.0], [1308.0, 7690.0], [1304.0, 6970.0], [1300.0, 6460.0], [1296.0, 7412.0], [1312.0, 7993.0], [1316.0, 7340.0], [1320.0, 7079.0], [1324.0, 7387.0], [1340.0, 7885.5], [1336.0, 7489.0], [1332.0, 7802.0], [1328.0, 7774.0], [1292.0, 7699.0], [1400.0, 7214.0], [1404.0, 6092.0], [1376.0, 6703.0], [1380.0, 7058.0], [1384.0, 6974.0], [1396.0, 7830.0], [1392.0, 8304.0], [1356.0, 7302.0], [1352.0, 6552.0], [1348.0, 7318.0], [1344.0, 7371.0], [1372.0, 7413.0], [1368.0, 7393.0], [1364.0, 7393.0], [1360.0, 6357.0], [1416.0, 6267.0], [1436.0, 6326.0], [1432.0, 6296.0], [1428.0, 6289.0], [1424.0, 6354.0], [1456.0, 6907.0], [1412.0, 7711.0], [1408.0, 6614.0], [1460.0, 7042.0], [1464.0, 5764.0], [1468.0, 6398.0], [1440.0, 6270.0], [1444.0, 5974.0], [1452.0, 4550.333333333334], [1448.0, 6501.0], [1520.0, 5717.0], [1476.0, 4883.6], [1480.0, 4816.5], [1484.0, 6666.0], [1528.0, 5306.0], [1532.0, 5043.6], [1504.0, 5293.25], [1508.0, 5202.0], [1512.0, 4844.0], [1516.0, 5249.5], [1472.0, 4755.8], [1500.0, 5115.666666666667], [1496.0, 4826.0], [1488.0, 5690.0], [1492.0, 5511.0], [1540.0, 4839.75], [1544.0, 4865.5], [1536.0, 4803.333333333333], [1564.0, 5621.5], [1560.0, 4991.25], [1556.0, 5081.0], [1584.0, 5180.0], [1588.0, 5076.75], [1596.0, 5727.0], [1592.0, 6142.0], [1572.0, 5259.0], [1580.0, 4983.5], [1576.0, 5112.0], [1568.0, 5066.666666666667], [1548.0, 5786.0], [1552.0, 5163.0], [1608.0, 4825.0], [1612.0, 5101.75], [1604.0, 5005.0], [1600.0, 4933.0], [1057.0, 6592.0], [1041.0, 8269.0], [1045.0, 5671.333333333333], [1049.0, 10140.0], [1065.0, 9532.0], [1069.0, 9046.0], [1061.0, 6039.0], [1077.0, 4858.0], [1073.0, 9890.0], [1037.0, 10051.0], [1033.0, 9482.0], [1029.0, 9927.0], [1025.0, 9058.0], [1081.0, 8933.0], [1085.0, 9000.0], [1053.0, 6793.0], [1093.0, 9274.0], [1149.0, 7721.0], [1113.0, 6061.5], [1109.0, 9034.0], [1105.0, 9347.0], [1089.0, 9636.0], [1097.0, 8614.0], [1101.0, 9298.0], [1117.0, 9218.0], [1137.0, 8256.0], [1141.0, 7834.0], [1121.0, 8060.0], [1125.0, 8782.0], [1129.0, 8534.0], [1133.0, 9049.0], [1145.0, 8202.0], [1181.0, 8610.0], [1185.0, 8893.0], [1173.0, 8777.0], [1169.0, 8665.0], [1177.0, 8918.0], [1197.0, 7865.0], [1193.0, 7575.0], [1189.0, 8491.0], [1205.0, 8620.0], [1201.0, 7302.0], [1153.0, 8735.0], [1157.0, 9224.0], [1161.0, 9033.0], [1165.0, 9037.0], [1209.0, 5890.5], [1213.0, 8469.0], [1217.0, 5739.5], [1221.0, 8405.0], [1245.0, 8107.0], [1241.0, 8584.0], [1237.0, 7517.0], [1233.0, 8258.0], [1225.0, 5374.333333333333], [1229.0, 8398.0], [1249.0, 7191.0], [1253.0, 8183.0], [1277.0, 7924.0], [1273.0, 8012.0], [1257.0, 6124.0], [1261.0, 4172.0], [1265.0, 7179.0], [1269.0, 7276.0], [1285.0, 7790.0], [1289.0, 5527.5], [1309.0, 7894.0], [1305.0, 6699.0], [1301.0, 6654.0], [1297.0, 7482.0], [1313.0, 7529.0], [1317.0, 7101.0], [1321.0, 7255.0], [1325.0, 7090.0], [1341.0, 7270.0], [1337.0, 7768.0], [1333.0, 7812.0], [1329.0, 7485.0], [1293.0, 4909.0], [1405.0, 7837.0], [1377.0, 7236.0], [1381.0, 7128.0], [1389.0, 7809.5], [1401.0, 6818.0], [1397.0, 7273.0], [1393.0, 7165.0], [1357.0, 6349.0], [1353.0, 7020.0], [1349.0, 7506.0], [1345.0, 7380.0], [1373.0, 6828.0], [1369.0, 7520.0], [1365.0, 7026.0], [1361.0, 7368.0], [1417.0, 7498.0], [1421.0, 6445.5], [1445.0, 5359.0], [1449.0, 5076.2], [1437.0, 5463.5], [1433.0, 7262.0], [1429.0, 6930.0], [1425.0, 6466.0], [1413.0, 5939.0], [1409.0, 7729.0], [1457.0, 5907.0], [1461.0, 5917.0], [1465.0, 4966.333333333333], [1469.0, 5713.0], [1441.0, 5848.5], [1453.0, 5090.75], [1521.0, 6016.0], [1481.0, 5372.0], [1473.0, 4794.5], [1477.0, 4561.125], [1485.0, 5472.0], [1525.0, 5098.0], [1529.0, 4732.0], [1533.0, 5013.0], [1505.0, 5689.5], [1509.0, 6615.0], [1517.0, 5097.0], [1513.0, 4792.0], [1501.0, 5165.333333333333], [1493.0, 6092.5], [1497.0, 4661.666666666667], [1489.0, 5837.0], [1541.0, 5671.0], [1565.0, 6195.0], [1561.0, 4823.5], [1557.0, 6224.0], [1537.0, 5196.0], [1545.0, 4893.0], [1597.0, 4986.0], [1593.0, 4899.0], [1589.0, 4900.0], [1585.0, 5870.0], [1569.0, 5287.25], [1573.0, 5532.666666666667], [1581.0, 4732.0], [1577.0, 4883.333333333333], [1549.0, 5253.0], [1553.0, 4635.0], [1613.0, 5737.75], [1609.0, 5289.0], [1605.0, 4703.0], [1601.0, 5487.0], [541.0, 12400.0], [531.0, 5745.333333333334], [529.0, 13232.0], [533.0, 13746.0], [535.0, 13460.0], [543.0, 12090.0], [539.0, 12610.0], [537.0, 13700.0], [519.0, 13367.0], [515.0, 13474.0], [513.0, 13905.0], [527.0, 12395.0], [525.0, 12715.0], [523.0, 13494.0], [521.0, 12855.0], [559.0, 12816.0], [553.0, 7074.5], [555.0, 12047.0], [557.0, 13129.0], [545.0, 14964.0], [547.0, 13514.0], [549.0, 14938.0], [551.0, 13154.0], [569.0, 12404.0], [567.0, 7253.0], [565.0, 13459.0], [575.0, 11971.0], [561.0, 13465.0], [563.0, 11857.0], [573.0, 13149.0], [571.0, 13295.0], [601.0, 6944.5], [585.0, 6925.5], [587.0, 12796.0], [589.0, 12164.0], [607.0, 11724.0], [593.0, 13117.0], [595.0, 13354.0], [597.0, 12790.0], [599.0, 13165.0], [605.0, 12819.0], [603.0, 14088.0], [583.0, 13428.0], [581.0, 13419.0], [579.0, 12890.0], [577.0, 11642.0], [591.0, 12966.0], [623.0, 7229.0], [635.0, 5500.0], [619.0, 7020.5], [617.0, 12689.0], [621.0, 12313.0], [639.0, 12328.0], [625.0, 12409.0], [627.0, 11578.0], [629.0, 12387.0], [631.0, 12432.0], [637.0, 10790.0], [633.0, 12474.0], [615.0, 13680.0], [613.0, 12740.0], [611.0, 12076.0], [609.0, 12732.0], [643.0, 11587.0], [641.0, 7839.5], [645.0, 12327.0], [647.0, 12182.0], [665.0, 12183.0], [649.0, 11287.0], [651.0, 12338.0], [653.0, 12331.0], [655.0, 12311.0], [663.0, 6612.5], [671.0, 12114.0], [657.0, 12258.0], [659.0, 12017.0], [661.0, 12206.0], [669.0, 11211.0], [667.0, 11774.0], [675.0, 12026.0], [699.0, 12342.0], [679.0, 7574.0], [677.0, 11690.0], [673.0, 11811.0], [683.0, 11535.0], [681.0, 13059.0], [685.0, 11568.0], [687.0, 11330.0], [689.0, 11474.0], [691.0, 11163.0], [693.0, 10876.0], [695.0, 11887.0], [701.0, 11780.0], [697.0, 11869.0], [707.0, 11199.0], [705.0, 11759.0], [709.0, 12332.0], [711.0, 11722.0], [719.0, 9947.0], [717.0, 11622.0], [715.0, 12882.0], [713.0, 11157.0], [733.0, 6905.0], [735.0, 11450.0], [721.0, 11304.0], [723.0, 11591.0], [725.0, 11499.0], [727.0, 11202.0], [731.0, 11518.0], [729.0, 10951.0], [765.0, 11979.0], [767.0, 10985.0], [753.0, 11243.0], [755.0, 10916.0], [757.0, 12355.0], [763.0, 11236.0], [761.0, 10656.0], [751.0, 11319.0], [737.0, 11144.0], [739.0, 11419.0], [741.0, 11406.0], [743.0, 12686.0], [749.0, 10964.0], [747.0, 12396.0], [745.0, 12043.0], [759.0, 10947.0], [797.0, 10880.0], [783.0, 6783.0], [781.0, 10913.0], [779.0, 11004.0], [777.0, 11824.0], [789.0, 10977.0], [787.0, 10495.0], [785.0, 11005.0], [791.0, 11501.0], [793.0, 10907.0], [775.0, 12205.0], [773.0, 11689.0], [771.0, 10563.0], [769.0, 11141.0], [799.0, 11450.0], [795.0, 11496.0], [803.0, 7139.5], [801.0, 10394.0], [805.0, 12261.0], [807.0, 10133.0], [815.0, 10652.0], [813.0, 10706.0], [811.0, 12188.0], [809.0, 10225.0], [831.0, 11164.0], [817.0, 11254.0], [819.0, 11415.0], [821.0, 11430.0], [823.0, 10602.0], [829.0, 10429.0], [827.0, 10324.0], [825.0, 10224.0], [847.0, 12266.0], [837.0, 7192.5], [843.0, 6761.5], [841.0, 10417.0], [845.0, 10361.0], [833.0, 10039.0], [835.0, 10461.0], [851.0, 2713.0], [853.0, 5060.0], [855.0, 11184.0], [863.0, 10164.0], [849.0, 11353.0], [861.0, 9881.0], [859.0, 9532.0], [857.0, 9727.0], [839.0, 10393.0], [893.0, 10877.0], [883.0, 10011.0], [881.0, 9744.0], [885.0, 11134.0], [887.0, 11130.0], [895.0, 10834.0], [891.0, 9705.0], [889.0, 10893.0], [871.0, 9597.0], [869.0, 10105.0], [867.0, 10117.0], [865.0, 11275.0], [879.0, 10048.0], [877.0, 9055.0], [875.0, 10687.0], [873.0, 9449.0], [911.0, 9731.0], [909.0, 6547.0], [907.0, 9750.0], [905.0, 9305.0], [897.0, 9909.0], [899.0, 9837.0], [901.0, 11303.0], [903.0, 10647.0], [923.0, 7235.5], [927.0, 10878.0], [913.0, 10584.0], [915.0, 9519.0], [917.0, 9663.0], [919.0, 10428.0], [925.0, 10999.0], [921.0, 10140.0], [929.0, 10171.0], [935.0, 6752.5], [933.0, 10112.0], [931.0, 10367.0], [953.0, 10250.0], [939.0, 10646.0], [937.0, 9465.0], [941.0, 10341.0], [943.0, 6841.5], [955.0, 6636.5], [959.0, 9784.0], [945.0, 10332.0], [947.0, 10142.0], [949.0, 9352.0], [951.0, 10213.0], [957.0, 9266.0], [989.0, 10838.0], [985.0, 9823.0], [979.0, 6065.0], [977.0, 10963.0], [981.0, 11197.0], [991.0, 11201.0], [987.0, 11242.0], [967.0, 10216.0], [965.0, 10432.0], [963.0, 10250.0], [961.0, 9994.0], [975.0, 9229.0], [973.0, 10457.0], [971.0, 9760.0], [969.0, 11121.0], [993.0, 10353.0], [1021.0, 10271.0], [1005.0, 6238.0], [1003.0, 10135.0], [1001.0, 9255.0], [1007.0, 10469.0], [995.0, 9929.0], [997.0, 9236.0], [1011.0, 6158.5], [1013.0, 10158.0], [1015.0, 10093.0], [1023.0, 9528.0], [1009.0, 10096.0], [1019.0, 9293.0], [1017.0, 10264.0], [999.0, 9238.0], [1074.0, 9371.0], [1050.0, 5375.25], [1042.0, 8247.0], [1046.0, 6608.0], [1062.0, 8102.0], [1066.0, 8712.0], [1070.0, 9384.0], [1058.0, 7030.0], [1038.0, 9540.0], [1034.0, 8840.0], [1030.0, 9700.0], [1026.0, 9221.0], [1054.0, 9859.0], [1078.0, 9341.0], [1082.0, 8540.0], [1086.0, 7817.0], [1090.0, 9745.0], [1110.0, 8135.0], [1106.0, 8711.0], [1114.0, 8746.0], [1094.0, 9808.0], [1098.0, 8510.0], [1102.0, 9463.0], [1138.0, 8006.0], [1142.0, 7926.0], [1122.0, 8988.0], [1126.0, 8599.0], [1130.0, 7919.0], [1134.0, 9392.0], [1150.0, 8797.0], [1146.0, 8319.0], [1202.0, 7638.0], [1210.0, 5651.5], [1174.0, 8230.0], [1170.0, 8083.0], [1178.0, 8292.0], [1182.0, 6244.0], [1198.0, 8274.0], [1194.0, 8045.0], [1190.0, 8851.0], [1186.0, 7538.0], [1206.0, 6272.5], [1154.0, 10314.0], [1158.0, 9051.0], [1162.0, 8779.0], [1166.0, 9083.0], [1214.0, 5001.0], [1226.0, 7883.0], [1222.0, 8829.0], [1218.0, 7435.0], [1242.0, 8027.0], [1238.0, 7230.0], [1234.0, 8041.0], [1230.0, 7698.0], [1250.0, 7149.0], [1254.0, 9522.0], [1278.0, 6861.0], [1274.0, 7033.0], [1258.0, 7522.0], [1262.0, 7685.0], [1266.0, 8174.0], [1270.0, 6954.0], [1282.0, 7201.5], [1290.0, 5277.666666666667], [1334.0, 6946.0], [1286.0, 8015.0], [1310.0, 7196.0], [1306.0, 7044.0], [1302.0, 7665.0], [1298.0, 7917.0], [1342.0, 7112.0], [1314.0, 7499.0], [1318.0, 6958.0], [1322.0, 7095.0], [1326.0, 7339.0], [1338.0, 7278.0], [1330.0, 7307.0], [1294.0, 7359.0], [1402.0, 6716.0], [1406.0, 6345.0], [1378.0, 7249.0], [1382.0, 7380.0], [1386.0, 7758.0], [1390.0, 6430.0], [1398.0, 8305.0], [1394.0, 6971.0], [1358.0, 6946.0], [1354.0, 7407.0], [1350.0, 7181.0], [1346.0, 6693.0], [1374.0, 6816.0], [1370.0, 8437.0], [1366.0, 7025.0], [1362.0, 7467.0], [1438.0, 6155.0], [1418.0, 5867.0], [1466.0, 4994.75], [1434.0, 7360.0], [1430.0, 6441.0], [1426.0, 6534.0], [1422.0, 6830.0], [1414.0, 6562.0], [1410.0, 6563.0], [1458.0, 7098.0], [1462.0, 6122.0], [1470.0, 4665.875], [1442.0, 5177.0], [1446.0, 6036.0], [1454.0, 4502.166666666666], [1450.0, 4990.5], [1522.0, 5326.0], [1478.0, 4493.636363636364], [1482.0, 5196.5], [1486.0, 4632.333333333333], [1526.0, 5701.0], [1530.0, 4879.5], [1534.0, 5159.0], [1510.0, 5530.0], [1514.0, 5505.0], [1518.0, 6516.0], [1506.0, 5657.0], [1474.0, 5370.666666666667], [1502.0, 5318.0], [1498.0, 4886.0], [1494.0, 6568.0], [1490.0, 6646.0], [1538.0, 5569.0], [1566.0, 5543.666666666667], [1562.0, 5240.5], [1558.0, 5113.0], [1554.0, 5165.0], [1542.0, 5407.0], [1546.0, 4953.333333333333], [1550.0, 5485.0], [1594.0, 5515.0], [1590.0, 4809.0], [1598.0, 4980.0], [1586.0, 4846.0], [1578.0, 5227.666666666667], [1582.0, 5017.0], [1574.0, 5383.0], [1570.0, 5363.0], [1610.0, 5718.0], [1606.0, 5398.0], [1079.0, 9533.0], [1039.0, 8837.0], [1087.0, 9096.0], [1043.0, 6624.0], [1047.0, 3903.0], [1063.0, 4679.0], [1067.0, 9148.0], [1071.0, 9930.0], [1059.0, 6016.0], [1075.0, 8711.0], [1035.0, 8840.0], [1031.0, 10143.0], [1027.0, 9014.0], [1055.0, 9644.0], [1083.0, 9912.0], [1051.0, 7088.5], [1119.0, 9046.5], [1091.0, 9110.0], [1111.0, 8033.0], [1107.0, 8968.0], [1115.0, 8666.0], [1095.0, 8937.0], [1099.0, 8367.0], [1103.0, 9012.0], [1139.0, 8458.0], [1143.0, 8725.0], [1123.0, 8445.0], [1127.0, 8602.0], [1131.0, 8803.0], [1135.0, 8949.0], [1151.0, 9225.0], [1147.0, 8433.0], [1187.0, 8524.0], [1175.0, 9166.0], [1171.0, 5968.0], [1179.0, 8627.0], [1199.0, 6260.5], [1195.0, 7398.0], [1191.0, 7905.0], [1203.0, 8652.0], [1183.0, 8822.0], [1155.0, 9124.0], [1159.0, 9166.0], [1163.0, 8219.0], [1167.0, 8793.0], [1207.0, 7371.0], [1215.0, 7578.0], [1211.0, 8221.0], [1219.0, 8602.0], [1231.0, 5099.333333333333], [1275.0, 7139.0], [1223.0, 8241.0], [1247.0, 7774.0], [1243.0, 8554.0], [1239.0, 9698.0], [1235.0, 8072.0], [1227.0, 8640.0], [1251.0, 5930.0], [1279.0, 6151.5], [1255.0, 5861.0], [1259.0, 7822.0], [1263.0, 7655.0], [1267.0, 7957.0], [1271.0, 5575.5], [1287.0, 7613.0], [1291.0, 5925.0], [1283.0, 7954.0], [1311.0, 7206.0], [1307.0, 6935.0], [1303.0, 7795.0], [1299.0, 7836.0], [1315.0, 7834.0], [1319.0, 7474.0], [1323.0, 6756.0], [1327.0, 7406.0], [1335.0, 6757.0], [1331.0, 7182.0], [1295.0, 7740.0], [1399.0, 7668.0], [1395.0, 7515.0], [1403.0, 7903.0], [1379.0, 7986.0], [1383.0, 6178.0], [1387.0, 6880.0], [1391.0, 6642.0], [1359.0, 6820.0], [1355.0, 6364.0], [1351.0, 7557.0], [1347.0, 7571.0], [1375.0, 7327.0], [1371.0, 8500.0], [1367.0, 6772.0], [1363.0, 7053.0], [1411.0, 7822.0], [1435.0, 6534.0], [1431.0, 7444.0], [1427.0, 6598.0], [1423.0, 7473.0], [1419.0, 6951.0], [1415.0, 7600.0], [1439.0, 6052.0], [1459.0, 5922.0], [1463.0, 5714.0], [1467.0, 4555.166666666666], [1471.0, 4529.714285714285], [1443.0, 5071.0], [1451.0, 4516.571428571428], [1455.0, 7101.0], [1447.0, 4508.5], [1487.0, 6626.0], [1479.0, 4854.25], [1475.0, 4828.0], [1483.0, 6562.0], [1523.0, 5026.0], [1527.0, 5843.0], [1531.0, 5475.0], [1535.0, 5401.0], [1507.0, 5017.666666666667], [1511.0, 5352.0], [1515.0, 5639.0], [1519.0, 6404.0], [1503.0, 5387.0], [1499.0, 4975.2], [1495.0, 6535.0], [1491.0, 5446.0], [1539.0, 6198.0], [1563.0, 5601.0], [1567.0, 5434.0], [1559.0, 5184.666666666667], [1555.0, 6003.0], [1543.0, 6235.0], [1551.0, 4946.5], [1595.0, 4654.0], [1591.0, 5443.0], [1599.0, 4675.0], [1587.0, 5409.5], [1571.0, 5279.25], [1579.0, 4987.0], [1583.0, 5187.0], [1575.0, 4965.0], [1547.0, 6200.0], [1611.0, 5278.0], [1607.0, 4999.0], [1603.0, 5798.5], [1.0, 14494.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[887.8370000000006, 9481.847000000003]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1613.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 12566.666666666666, "minX": 1.5495831E12, "maxY": 13964.283333333333, "series": [{"data": [[1.5495831E12, 13964.283333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495831E12, 12566.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 9481.847000000003, "minX": 1.5495831E12, "maxY": 9481.847000000003, "series": [{"data": [[1.5495831E12, 9481.847000000003]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 9481.839999999997, "minX": 1.5495831E12, "maxY": 9481.839999999997, "series": [{"data": [[1.5495831E12, 9481.839999999997]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 90.17499999999988, "minX": 1.5495831E12, "maxY": 90.17499999999988, "series": [{"data": [[1.5495831E12, 90.17499999999988]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 598.0, "minX": 1.5495831E12, "maxY": 15810.0, "series": [{"data": [[1.5495831E12, 15810.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495831E12, 598.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495831E12, 14520.900000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495831E12, 15605.94]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495831E12, 14926.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 9699.0, "minX": 33.0, "maxY": 9699.0, "series": [{"data": [[33.0, 9699.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 9699.0, "minX": 33.0, "maxY": 9699.0, "series": [{"data": [[33.0, 9699.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495831E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495831E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495831E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495831E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495831E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495831E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
