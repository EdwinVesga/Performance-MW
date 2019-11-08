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
        data: {"result": {"minY": 488.0, "minX": 0.0, "maxY": 17321.0, "series": [{"data": [[0.0, 488.0], [0.1, 617.0], [0.2, 683.0], [0.3, 696.0], [0.4, 708.0], [0.5, 712.0], [0.6, 745.0], [0.7, 749.0], [0.8, 795.0], [0.9, 805.0], [1.0, 848.0], [1.1, 874.0], [1.2, 918.0], [1.3, 950.0], [1.4, 983.0], [1.5, 1018.0], [1.6, 1047.0], [1.7, 1068.0], [1.8, 1112.0], [1.9, 1169.0], [2.0, 1198.0], [2.1, 1216.0], [2.2, 1269.0], [2.3, 1318.0], [2.4, 1398.0], [2.5, 1466.0], [2.6, 1477.0], [2.7, 1552.0], [2.8, 1800.0], [2.9, 2267.0], [3.0, 2276.0], [3.1, 2297.0], [3.2, 2341.0], [3.3, 2384.0], [3.4, 2438.0], [3.5, 2466.0], [3.6, 2512.0], [3.7, 2533.0], [3.8, 2582.0], [3.9, 2641.0], [4.0, 2663.0], [4.1, 2728.0], [4.2, 2764.0], [4.3, 2784.0], [4.4, 2821.0], [4.5, 2898.0], [4.6, 2951.0], [4.7, 2991.0], [4.8, 3027.0], [4.9, 3062.0], [5.0, 3081.0], [5.1, 3177.0], [5.2, 3194.0], [5.3, 3210.0], [5.4, 3223.0], [5.5, 3258.0], [5.6, 3343.0], [5.7, 3369.0], [5.8, 3401.0], [5.9, 3416.0], [6.0, 3441.0], [6.1, 3462.0], [6.2, 3465.0], [6.3, 3484.0], [6.4, 3512.0], [6.5, 3529.0], [6.6, 3561.0], [6.7, 3576.0], [6.8, 3578.0], [6.9, 3582.0], [7.0, 3591.0], [7.1, 3614.0], [7.2, 3636.0], [7.3, 3641.0], [7.4, 3644.0], [7.5, 3649.0], [7.6, 3660.0], [7.7, 3662.0], [7.8, 3674.0], [7.9, 3681.0], [8.0, 3685.0], [8.1, 3709.0], [8.2, 3727.0], [8.3, 3730.0], [8.4, 3748.0], [8.5, 3756.0], [8.6, 3769.0], [8.7, 3784.0], [8.8, 3796.0], [8.9, 3803.0], [9.0, 3821.0], [9.1, 3824.0], [9.2, 3854.0], [9.3, 3858.0], [9.4, 3865.0], [9.5, 3880.0], [9.6, 3884.0], [9.7, 3889.0], [9.8, 3920.0], [9.9, 3924.0], [10.0, 3937.0], [10.1, 3946.0], [10.2, 3992.0], [10.3, 3995.0], [10.4, 4016.0], [10.5, 4024.0], [10.6, 4028.0], [10.7, 4034.0], [10.8, 4045.0], [10.9, 4056.0], [11.0, 4064.0], [11.1, 4067.0], [11.2, 4071.0], [11.3, 4088.0], [11.4, 4095.0], [11.5, 4101.0], [11.6, 4108.0], [11.7, 4110.0], [11.8, 4114.0], [11.9, 4126.0], [12.0, 4139.0], [12.1, 4157.0], [12.2, 4177.0], [12.3, 4195.0], [12.4, 4212.0], [12.5, 4219.0], [12.6, 4231.0], [12.7, 4232.0], [12.8, 4241.0], [12.9, 4265.0], [13.0, 4279.0], [13.1, 4288.0], [13.2, 4302.0], [13.3, 4309.0], [13.4, 4339.0], [13.5, 4376.0], [13.6, 4384.0], [13.7, 4396.0], [13.8, 4418.0], [13.9, 4439.0], [14.0, 4455.0], [14.1, 4500.0], [14.2, 4507.0], [14.3, 4513.0], [14.4, 4560.0], [14.5, 4577.0], [14.6, 4578.0], [14.7, 4596.0], [14.8, 4600.0], [14.9, 4604.0], [15.0, 4608.0], [15.1, 4611.0], [15.2, 4627.0], [15.3, 4630.0], [15.4, 4641.0], [15.5, 4649.0], [15.6, 4661.0], [15.7, 4695.0], [15.8, 4704.0], [15.9, 4716.0], [16.0, 4720.0], [16.1, 4722.0], [16.2, 4733.0], [16.3, 4744.0], [16.4, 4750.0], [16.5, 4756.0], [16.6, 4769.0], [16.7, 4776.0], [16.8, 4781.0], [16.9, 4789.0], [17.0, 4795.0], [17.1, 4829.0], [17.2, 4835.0], [17.3, 4845.0], [17.4, 4861.0], [17.5, 4895.0], [17.6, 4910.0], [17.7, 4917.0], [17.8, 4921.0], [17.9, 4944.0], [18.0, 4956.0], [18.1, 4963.0], [18.2, 4986.0], [18.3, 5003.0], [18.4, 5028.0], [18.5, 5039.0], [18.6, 5049.0], [18.7, 5050.0], [18.8, 5064.0], [18.9, 5069.0], [19.0, 5074.0], [19.1, 5082.0], [19.2, 5093.0], [19.3, 5100.0], [19.4, 5109.0], [19.5, 5115.0], [19.6, 5125.0], [19.7, 5140.0], [19.8, 5149.0], [19.9, 5152.0], [20.0, 5157.0], [20.1, 5165.0], [20.2, 5172.0], [20.3, 5188.0], [20.4, 5191.0], [20.5, 5199.0], [20.6, 5218.0], [20.7, 5222.0], [20.8, 5232.0], [20.9, 5233.0], [21.0, 5245.0], [21.1, 5258.0], [21.2, 5260.0], [21.3, 5280.0], [21.4, 5292.0], [21.5, 5304.0], [21.6, 5306.0], [21.7, 5320.0], [21.8, 5345.0], [21.9, 5355.0], [22.0, 5384.0], [22.1, 5400.0], [22.2, 5407.0], [22.3, 5421.0], [22.4, 5455.0], [22.5, 5467.0], [22.6, 5474.0], [22.7, 5481.0], [22.8, 5486.0], [22.9, 5495.0], [23.0, 5509.0], [23.1, 5526.0], [23.2, 5541.0], [23.3, 5564.0], [23.4, 5575.0], [23.5, 5579.0], [23.6, 5586.0], [23.7, 5605.0], [23.8, 5608.0], [23.9, 5613.0], [24.0, 5640.0], [24.1, 5649.0], [24.2, 5657.0], [24.3, 5672.0], [24.4, 5673.0], [24.5, 5676.0], [24.6, 5717.0], [24.7, 5724.0], [24.8, 5731.0], [24.9, 5734.0], [25.0, 5755.0], [25.1, 5761.0], [25.2, 5775.0], [25.3, 5783.0], [25.4, 5784.0], [25.5, 5789.0], [25.6, 5831.0], [25.7, 5845.0], [25.8, 5864.0], [25.9, 5880.0], [26.0, 5890.0], [26.1, 5903.0], [26.2, 5912.0], [26.3, 5918.0], [26.4, 5920.0], [26.5, 5958.0], [26.6, 5962.0], [26.7, 5975.0], [26.8, 5992.0], [26.9, 5995.0], [27.0, 6004.0], [27.1, 6013.0], [27.2, 6033.0], [27.3, 6065.0], [27.4, 6067.0], [27.5, 6092.0], [27.6, 6108.0], [27.7, 6154.0], [27.8, 6175.0], [27.9, 6231.0], [28.0, 6235.0], [28.1, 6262.0], [28.2, 6276.0], [28.3, 6279.0], [28.4, 6286.0], [28.5, 6311.0], [28.6, 6330.0], [28.7, 6344.0], [28.8, 6366.0], [28.9, 6406.0], [29.0, 6430.0], [29.1, 6445.0], [29.2, 6451.0], [29.3, 6475.0], [29.4, 6485.0], [29.5, 6522.0], [29.6, 6523.0], [29.7, 6532.0], [29.8, 6547.0], [29.9, 6554.0], [30.0, 6566.0], [30.1, 6582.0], [30.2, 6588.0], [30.3, 6624.0], [30.4, 6639.0], [30.5, 6660.0], [30.6, 6665.0], [30.7, 6680.0], [30.8, 6696.0], [30.9, 6734.0], [31.0, 6752.0], [31.1, 6765.0], [31.2, 6778.0], [31.3, 6790.0], [31.4, 6793.0], [31.5, 6818.0], [31.6, 6828.0], [31.7, 6831.0], [31.8, 6838.0], [31.9, 6854.0], [32.0, 6868.0], [32.1, 6877.0], [32.2, 6922.0], [32.3, 6938.0], [32.4, 6947.0], [32.5, 6954.0], [32.6, 6967.0], [32.7, 7000.0], [32.8, 7020.0], [32.9, 7043.0], [33.0, 7072.0], [33.1, 7079.0], [33.2, 7101.0], [33.3, 7125.0], [33.4, 7139.0], [33.5, 7141.0], [33.6, 7153.0], [33.7, 7167.0], [33.8, 7177.0], [33.9, 7195.0], [34.0, 7223.0], [34.1, 7226.0], [34.2, 7231.0], [34.3, 7258.0], [34.4, 7267.0], [34.5, 7277.0], [34.6, 7285.0], [34.7, 7296.0], [34.8, 7322.0], [34.9, 7331.0], [35.0, 7354.0], [35.1, 7392.0], [35.2, 7394.0], [35.3, 7397.0], [35.4, 7409.0], [35.5, 7417.0], [35.6, 7426.0], [35.7, 7437.0], [35.8, 7442.0], [35.9, 7454.0], [36.0, 7463.0], [36.1, 7466.0], [36.2, 7491.0], [36.3, 7523.0], [36.4, 7528.0], [36.5, 7538.0], [36.6, 7558.0], [36.7, 7567.0], [36.8, 7590.0], [36.9, 7610.0], [37.0, 7618.0], [37.1, 7623.0], [37.2, 7624.0], [37.3, 7636.0], [37.4, 7664.0], [37.5, 7673.0], [37.6, 7700.0], [37.7, 7714.0], [37.8, 7722.0], [37.9, 7726.0], [38.0, 7732.0], [38.1, 7739.0], [38.2, 7751.0], [38.3, 7781.0], [38.4, 7783.0], [38.5, 7808.0], [38.6, 7812.0], [38.7, 7835.0], [38.8, 7856.0], [38.9, 7873.0], [39.0, 7901.0], [39.1, 7916.0], [39.2, 7920.0], [39.3, 7941.0], [39.4, 7969.0], [39.5, 7973.0], [39.6, 7994.0], [39.7, 7997.0], [39.8, 8005.0], [39.9, 8007.0], [40.0, 8020.0], [40.1, 8035.0], [40.2, 8045.0], [40.3, 8047.0], [40.4, 8073.0], [40.5, 8087.0], [40.6, 8100.0], [40.7, 8111.0], [40.8, 8115.0], [40.9, 8118.0], [41.0, 8123.0], [41.1, 8128.0], [41.2, 8154.0], [41.3, 8163.0], [41.4, 8165.0], [41.5, 8187.0], [41.6, 8210.0], [41.7, 8217.0], [41.8, 8251.0], [41.9, 8275.0], [42.0, 8284.0], [42.1, 8297.0], [42.2, 8299.0], [42.3, 8312.0], [42.4, 8313.0], [42.5, 8328.0], [42.6, 8342.0], [42.7, 8365.0], [42.8, 8377.0], [42.9, 8391.0], [43.0, 8400.0], [43.1, 8406.0], [43.2, 8411.0], [43.3, 8420.0], [43.4, 8421.0], [43.5, 8429.0], [43.6, 8430.0], [43.7, 8439.0], [43.8, 8458.0], [43.9, 8469.0], [44.0, 8477.0], [44.1, 8485.0], [44.2, 8493.0], [44.3, 8503.0], [44.4, 8510.0], [44.5, 8515.0], [44.6, 8523.0], [44.7, 8531.0], [44.8, 8553.0], [44.9, 8557.0], [45.0, 8580.0], [45.1, 8588.0], [45.2, 8592.0], [45.3, 8598.0], [45.4, 8612.0], [45.5, 8617.0], [45.6, 8645.0], [45.7, 8664.0], [45.8, 8679.0], [45.9, 8680.0], [46.0, 8684.0], [46.1, 8699.0], [46.2, 8702.0], [46.3, 8716.0], [46.4, 8727.0], [46.5, 8733.0], [46.6, 8748.0], [46.7, 8753.0], [46.8, 8766.0], [46.9, 8772.0], [47.0, 8777.0], [47.1, 8797.0], [47.2, 8818.0], [47.3, 8822.0], [47.4, 8843.0], [47.5, 8849.0], [47.6, 8854.0], [47.7, 8869.0], [47.8, 8896.0], [47.9, 8898.0], [48.0, 8904.0], [48.1, 8913.0], [48.2, 8924.0], [48.3, 8952.0], [48.4, 8961.0], [48.5, 8965.0], [48.6, 8983.0], [48.7, 8993.0], [48.8, 9008.0], [48.9, 9020.0], [49.0, 9032.0], [49.1, 9058.0], [49.2, 9065.0], [49.3, 9072.0], [49.4, 9076.0], [49.5, 9093.0], [49.6, 9109.0], [49.7, 9113.0], [49.8, 9121.0], [49.9, 9142.0], [50.0, 9192.0], [50.1, 9203.0], [50.2, 9204.0], [50.3, 9217.0], [50.4, 9220.0], [50.5, 9231.0], [50.6, 9245.0], [50.7, 9256.0], [50.8, 9259.0], [50.9, 9267.0], [51.0, 9277.0], [51.1, 9289.0], [51.2, 9322.0], [51.3, 9349.0], [51.4, 9351.0], [51.5, 9367.0], [51.6, 9399.0], [51.7, 9418.0], [51.8, 9456.0], [51.9, 9465.0], [52.0, 9474.0], [52.1, 9485.0], [52.2, 9506.0], [52.3, 9510.0], [52.4, 9523.0], [52.5, 9527.0], [52.6, 9529.0], [52.7, 9540.0], [52.8, 9554.0], [52.9, 9559.0], [53.0, 9571.0], [53.1, 9580.0], [53.2, 9590.0], [53.3, 9606.0], [53.4, 9612.0], [53.5, 9633.0], [53.6, 9644.0], [53.7, 9656.0], [53.8, 9687.0], [53.9, 9704.0], [54.0, 9718.0], [54.1, 9721.0], [54.2, 9726.0], [54.3, 9732.0], [54.4, 9751.0], [54.5, 9788.0], [54.6, 9815.0], [54.7, 9822.0], [54.8, 9829.0], [54.9, 9833.0], [55.0, 9843.0], [55.1, 9864.0], [55.2, 9894.0], [55.3, 9924.0], [55.4, 9929.0], [55.5, 9935.0], [55.6, 9952.0], [55.7, 9972.0], [55.8, 9979.0], [55.9, 9984.0], [56.0, 10018.0], [56.1, 10088.0], [56.2, 10099.0], [56.3, 10106.0], [56.4, 10162.0], [56.5, 10179.0], [56.6, 10223.0], [56.7, 10288.0], [56.8, 10315.0], [56.9, 10378.0], [57.0, 10413.0], [57.1, 10440.0], [57.2, 10460.0], [57.3, 10482.0], [57.4, 10511.0], [57.5, 10551.0], [57.6, 10566.0], [57.7, 10585.0], [57.8, 10597.0], [57.9, 10629.0], [58.0, 10648.0], [58.1, 10650.0], [58.2, 10658.0], [58.3, 10719.0], [58.4, 10739.0], [58.5, 10799.0], [58.6, 10819.0], [58.7, 10828.0], [58.8, 10841.0], [58.9, 10855.0], [59.0, 10870.0], [59.1, 10912.0], [59.2, 10923.0], [59.3, 10928.0], [59.4, 10946.0], [59.5, 10957.0], [59.6, 10971.0], [59.7, 11000.0], [59.8, 11020.0], [59.9, 11045.0], [60.0, 11050.0], [60.1, 11090.0], [60.2, 11100.0], [60.3, 11127.0], [60.4, 11135.0], [60.5, 11150.0], [60.6, 11155.0], [60.7, 11161.0], [60.8, 11191.0], [60.9, 11195.0], [61.0, 11221.0], [61.1, 11231.0], [61.2, 11232.0], [61.3, 11254.0], [61.4, 11281.0], [61.5, 11284.0], [61.6, 11320.0], [61.7, 11334.0], [61.8, 11356.0], [61.9, 11368.0], [62.0, 11374.0], [62.1, 11424.0], [62.2, 11427.0], [62.3, 11443.0], [62.4, 11467.0], [62.5, 11482.0], [62.6, 11515.0], [62.7, 11526.0], [62.8, 11530.0], [62.9, 11541.0], [63.0, 11550.0], [63.1, 11555.0], [63.2, 11583.0], [63.3, 11616.0], [63.4, 11619.0], [63.5, 11637.0], [63.6, 11682.0], [63.7, 11692.0], [63.8, 11712.0], [63.9, 11724.0], [64.0, 11730.0], [64.1, 11790.0], [64.2, 11808.0], [64.3, 11822.0], [64.4, 11832.0], [64.5, 11842.0], [64.6, 11853.0], [64.7, 11869.0], [64.8, 11875.0], [64.9, 11892.0], [65.0, 11899.0], [65.1, 11907.0], [65.2, 11929.0], [65.3, 11939.0], [65.4, 11945.0], [65.5, 11964.0], [65.6, 11971.0], [65.7, 11988.0], [65.8, 11993.0], [65.9, 12026.0], [66.0, 12027.0], [66.1, 12036.0], [66.2, 12048.0], [66.3, 12068.0], [66.4, 12091.0], [66.5, 12095.0], [66.6, 12107.0], [66.7, 12122.0], [66.8, 12125.0], [66.9, 12139.0], [67.0, 12146.0], [67.1, 12155.0], [67.2, 12177.0], [67.3, 12182.0], [67.4, 12190.0], [67.5, 12204.0], [67.6, 12215.0], [67.7, 12229.0], [67.8, 12238.0], [67.9, 12252.0], [68.0, 12263.0], [68.1, 12267.0], [68.2, 12310.0], [68.3, 12325.0], [68.4, 12330.0], [68.5, 12339.0], [68.6, 12340.0], [68.7, 12347.0], [68.8, 12395.0], [68.9, 12412.0], [69.0, 12427.0], [69.1, 12437.0], [69.2, 12474.0], [69.3, 12495.0], [69.4, 12496.0], [69.5, 12507.0], [69.6, 12513.0], [69.7, 12520.0], [69.8, 12528.0], [69.9, 12556.0], [70.0, 12591.0], [70.1, 12593.0], [70.2, 12604.0], [70.3, 12621.0], [70.4, 12627.0], [70.5, 12651.0], [70.6, 12660.0], [70.7, 12683.0], [70.8, 12706.0], [70.9, 12711.0], [71.0, 12711.0], [71.1, 12721.0], [71.2, 12724.0], [71.3, 12727.0], [71.4, 12743.0], [71.5, 12745.0], [71.6, 12753.0], [71.7, 12783.0], [71.8, 12787.0], [71.9, 12791.0], [72.0, 12815.0], [72.1, 12840.0], [72.2, 12845.0], [72.3, 12869.0], [72.4, 12870.0], [72.5, 12882.0], [72.6, 12895.0], [72.7, 12919.0], [72.8, 12923.0], [72.9, 12930.0], [73.0, 12936.0], [73.1, 12940.0], [73.2, 12965.0], [73.3, 12976.0], [73.4, 13001.0], [73.5, 13052.0], [73.6, 13054.0], [73.7, 13061.0], [73.8, 13065.0], [73.9, 13073.0], [74.0, 13082.0], [74.1, 13085.0], [74.2, 13096.0], [74.3, 13102.0], [74.4, 13118.0], [74.5, 13119.0], [74.6, 13138.0], [74.7, 13143.0], [74.8, 13146.0], [74.9, 13156.0], [75.0, 13159.0], [75.1, 13161.0], [75.2, 13175.0], [75.3, 13179.0], [75.4, 13193.0], [75.5, 13213.0], [75.6, 13226.0], [75.7, 13247.0], [75.8, 13275.0], [75.9, 13287.0], [76.0, 13298.0], [76.1, 13314.0], [76.2, 13316.0], [76.3, 13334.0], [76.4, 13345.0], [76.5, 13354.0], [76.6, 13360.0], [76.7, 13373.0], [76.8, 13386.0], [76.9, 13394.0], [77.0, 13399.0], [77.1, 13408.0], [77.2, 13413.0], [77.3, 13435.0], [77.4, 13436.0], [77.5, 13455.0], [77.6, 13460.0], [77.7, 13473.0], [77.8, 13476.0], [77.9, 13491.0], [78.0, 13502.0], [78.1, 13518.0], [78.2, 13526.0], [78.3, 13533.0], [78.4, 13537.0], [78.5, 13551.0], [78.6, 13555.0], [78.7, 13560.0], [78.8, 13568.0], [78.9, 13583.0], [79.0, 13595.0], [79.1, 13610.0], [79.2, 13623.0], [79.3, 13630.0], [79.4, 13654.0], [79.5, 13667.0], [79.6, 13669.0], [79.7, 13686.0], [79.8, 13694.0], [79.9, 13716.0], [80.0, 13729.0], [80.1, 13739.0], [80.2, 13758.0], [80.3, 13762.0], [80.4, 13767.0], [80.5, 13780.0], [80.6, 13792.0], [80.7, 13799.0], [80.8, 13808.0], [80.9, 13819.0], [81.0, 13836.0], [81.1, 13840.0], [81.2, 13840.0], [81.3, 13843.0], [81.4, 13854.0], [81.5, 13860.0], [81.6, 13865.0], [81.7, 13875.0], [81.8, 13878.0], [81.9, 13883.0], [82.0, 13887.0], [82.1, 13899.0], [82.2, 13912.0], [82.3, 13925.0], [82.4, 13940.0], [82.5, 13941.0], [82.6, 13944.0], [82.7, 13950.0], [82.8, 13954.0], [82.9, 13970.0], [83.0, 13972.0], [83.1, 13979.0], [83.2, 13997.0], [83.3, 14003.0], [83.4, 14014.0], [83.5, 14018.0], [83.6, 14023.0], [83.7, 14023.0], [83.8, 14031.0], [83.9, 14049.0], [84.0, 14055.0], [84.1, 14058.0], [84.2, 14071.0], [84.3, 14081.0], [84.4, 14103.0], [84.5, 14105.0], [84.6, 14114.0], [84.7, 14117.0], [84.8, 14121.0], [84.9, 14132.0], [85.0, 14143.0], [85.1, 14143.0], [85.2, 14149.0], [85.3, 14154.0], [85.4, 14168.0], [85.5, 14173.0], [85.6, 14179.0], [85.7, 14190.0], [85.8, 14194.0], [85.9, 14197.0], [86.0, 14205.0], [86.1, 14215.0], [86.2, 14225.0], [86.3, 14237.0], [86.4, 14243.0], [86.5, 14249.0], [86.6, 14250.0], [86.7, 14254.0], [86.8, 14264.0], [86.9, 14266.0], [87.0, 14271.0], [87.1, 14277.0], [87.2, 14283.0], [87.3, 14293.0], [87.4, 14298.0], [87.5, 14299.0], [87.6, 14309.0], [87.7, 14314.0], [87.8, 14314.0], [87.9, 14316.0], [88.0, 14319.0], [88.1, 14322.0], [88.2, 14326.0], [88.3, 14335.0], [88.4, 14338.0], [88.5, 14349.0], [88.6, 14366.0], [88.7, 14371.0], [88.8, 14376.0], [88.9, 14384.0], [89.0, 14390.0], [89.1, 14399.0], [89.2, 14404.0], [89.3, 14411.0], [89.4, 14420.0], [89.5, 14433.0], [89.6, 14445.0], [89.7, 14455.0], [89.8, 14470.0], [89.9, 14472.0], [90.0, 14473.0], [90.1, 14479.0], [90.2, 14494.0], [90.3, 14498.0], [90.4, 14502.0], [90.5, 14519.0], [90.6, 14525.0], [90.7, 14533.0], [90.8, 14547.0], [90.9, 14554.0], [91.0, 14558.0], [91.1, 14562.0], [91.2, 14577.0], [91.3, 14593.0], [91.4, 14597.0], [91.5, 14600.0], [91.6, 14605.0], [91.7, 14616.0], [91.8, 14627.0], [91.9, 14649.0], [92.0, 14660.0], [92.1, 14666.0], [92.2, 14678.0], [92.3, 14683.0], [92.4, 14693.0], [92.5, 14704.0], [92.6, 14729.0], [92.7, 14743.0], [92.8, 14760.0], [92.9, 14799.0], [93.0, 14804.0], [93.1, 14809.0], [93.2, 14819.0], [93.3, 14822.0], [93.4, 14852.0], [93.5, 14860.0], [93.6, 14864.0], [93.7, 14871.0], [93.8, 14875.0], [93.9, 14885.0], [94.0, 14890.0], [94.1, 14894.0], [94.2, 14927.0], [94.3, 14944.0], [94.4, 14948.0], [94.5, 14967.0], [94.6, 14982.0], [94.7, 14998.0], [94.8, 15008.0], [94.9, 15014.0], [95.0, 15027.0], [95.1, 15029.0], [95.2, 15037.0], [95.3, 15041.0], [95.4, 15046.0], [95.5, 15068.0], [95.6, 15093.0], [95.7, 15104.0], [95.8, 15108.0], [95.9, 15120.0], [96.0, 15131.0], [96.1, 15135.0], [96.2, 15158.0], [96.3, 15160.0], [96.4, 15162.0], [96.5, 15175.0], [96.6, 15195.0], [96.7, 15207.0], [96.8, 15220.0], [96.9, 15222.0], [97.0, 15226.0], [97.1, 15229.0], [97.2, 15250.0], [97.3, 15265.0], [97.4, 15299.0], [97.5, 15333.0], [97.6, 15350.0], [97.7, 15379.0], [97.8, 15389.0], [97.9, 15402.0], [98.0, 15414.0], [98.1, 15425.0], [98.2, 15442.0], [98.3, 15462.0], [98.4, 15472.0], [98.5, 15483.0], [98.6, 15509.0], [98.7, 15545.0], [98.8, 15575.0], [98.9, 15577.0], [99.0, 15637.0], [99.1, 15679.0], [99.2, 15809.0], [99.3, 15863.0], [99.4, 16063.0], [99.5, 16251.0], [99.6, 16336.0], [99.7, 16410.0], [99.8, 16648.0], [99.9, 17019.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 400.0, "maxY": 32.0, "series": [{"data": [[400.0, 1.0], [500.0, 1.0], [600.0, 5.0], [700.0, 9.0], [800.0, 7.0], [900.0, 5.0], [1000.0, 7.0], [1100.0, 5.0], [1200.0, 6.0], [1300.0, 3.0], [1400.0, 5.0], [1500.0, 1.0], [1700.0, 1.0], [1800.0, 2.0], [2200.0, 5.0], [2300.0, 4.0], [2400.0, 4.0], [2500.0, 6.0], [2600.0, 5.0], [2700.0, 5.0], [2800.0, 4.0], [2900.0, 4.0], [3000.0, 6.0], [3100.0, 5.0], [3200.0, 6.0], [3300.0, 4.0], [3400.0, 11.0], [3500.0, 14.0], [3600.0, 21.0], [3700.0, 16.0], [3800.0, 17.0], [3900.0, 11.0], [4000.0, 23.0], [4100.0, 17.0], [4300.0, 11.0], [4200.0, 17.0], [4600.0, 20.0], [4400.0, 7.0], [4500.0, 13.0], [4700.0, 27.0], [4800.0, 9.0], [4900.0, 15.0], [5000.0, 20.0], [5100.0, 25.0], [5200.0, 19.0], [5300.0, 12.0], [5400.0, 17.0], [5600.0, 18.0], [5500.0, 14.0], [5700.0, 20.0], [5800.0, 11.0], [5900.0, 18.0], [6000.0, 11.0], [6100.0, 6.0], [6300.0, 9.0], [6200.0, 12.0], [6600.0, 11.0], [6500.0, 17.0], [6400.0, 11.0], [6800.0, 14.0], [6700.0, 12.0], [6900.0, 11.0], [7100.0, 15.0], [7000.0, 10.0], [7400.0, 17.0], [7200.0, 16.0], [7300.0, 13.0], [7500.0, 13.0], [7600.0, 14.0], [7900.0, 16.0], [7700.0, 19.0], [7800.0, 10.0], [8100.0, 20.0], [8000.0, 15.0], [8300.0, 15.0], [8400.0, 26.0], [8700.0, 20.0], [8200.0, 14.0], [8500.0, 21.0], [8600.0, 16.0], [9000.0, 16.0], [8800.0, 16.0], [8900.0, 16.0], [9200.0, 21.0], [9100.0, 11.0], [9300.0, 10.0], [9600.0, 13.0], [9500.0, 22.0], [9700.0, 13.0], [9400.0, 10.0], [9800.0, 14.0], [9900.0, 14.0], [10000.0, 6.0], [10100.0, 6.0], [10200.0, 5.0], [10400.0, 7.0], [10500.0, 10.0], [10600.0, 9.0], [10300.0, 4.0], [10700.0, 5.0], [10800.0, 10.0], [10900.0, 13.0], [11100.0, 16.0], [11200.0, 12.0], [11000.0, 10.0], [11300.0, 9.0], [11400.0, 11.0], [11500.0, 13.0], [11600.0, 10.0], [11700.0, 9.0], [11800.0, 17.0], [11900.0, 16.0], [12200.0, 14.0], [12000.0, 14.0], [12100.0, 19.0], [12300.0, 13.0], [12600.0, 11.0], [12700.0, 24.0], [12400.0, 12.0], [12500.0, 15.0], [13000.0, 18.0], [13100.0, 24.0], [13300.0, 20.0], [12800.0, 14.0], [13200.0, 11.0], [12900.0, 15.0], [13400.0, 19.0], [13500.0, 22.0], [13700.0, 18.0], [13800.0, 28.0], [13600.0, 15.0], [14000.0, 22.0], [13900.0, 23.0], [14100.0, 31.0], [14200.0, 32.0], [14300.0, 32.0], [14600.0, 19.0], [14400.0, 24.0], [14700.0, 10.0], [14500.0, 23.0], [14800.0, 24.0], [15000.0, 19.0], [15200.0, 15.0], [15300.0, 9.0], [14900.0, 12.0], [15100.0, 20.0], [15400.0, 14.0], [15700.0, 1.0], [15500.0, 8.0], [15800.0, 4.0], [15600.0, 3.0], [16200.0, 1.0], [16000.0, 2.0], [16300.0, 3.0], [16400.0, 1.0], [16500.0, 1.0], [16600.0, 1.0], [16700.0, 1.0], [17000.0, 1.0], [17300.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 17300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1946.0, "series": [{"data": [[1.0, 53.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1946.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 542.0397045244705, "minX": 1.54958352E12, "maxY": 1240.6085059978209, "series": [{"data": [[1.54958352E12, 1240.6085059978209], [1.54958358E12, 542.0397045244705]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 488.0, "minX": 1.0, "maxY": 17321.0, "series": [{"data": [[2.0, 15405.0], [3.0, 14316.0], [4.0, 15476.0], [5.0, 15135.0], [6.0, 14625.0], [7.0, 14189.0], [9.0, 15627.0], [10.0, 15174.0], [11.0, 14675.0], [12.0, 15009.0], [13.0, 15221.0], [14.0, 14743.0], [15.0, 14143.0], [16.0, 15489.0], [18.0, 14428.5], [19.0, 14820.0], [20.0, 14852.0], [21.0, 14972.0], [22.0, 14894.0], [23.0, 14266.0], [24.0, 15046.0], [25.0, 14404.0], [26.0, 15265.0], [27.0, 15561.0], [28.0, 14605.0], [29.0, 15226.0], [30.0, 14042.0], [31.0, 14458.0], [33.0, 15392.0], [32.0, 14799.0], [35.0, 14341.0], [34.0, 14502.0], [37.0, 14299.0], [36.0, 15229.0], [39.0, 14049.0], [38.0, 14365.0], [41.0, 15577.0], [40.0, 13997.0], [43.0, 14944.0], [42.0, 14215.0], [45.0, 14121.0], [44.0, 14869.0], [47.0, 15024.0], [46.0, 14982.0], [49.0, 15670.0], [48.0, 15131.0], [51.0, 15389.0], [50.0, 15029.0], [53.0, 15162.0], [52.0, 15177.0], [55.0, 15350.0], [54.0, 15637.0], [57.0, 14801.0], [56.0, 14751.0], [59.0, 14596.0], [58.0, 14235.0], [61.0, 15575.0], [60.0, 14879.0], [63.0, 14264.0], [62.0, 13941.0], [67.0, 14455.0], [66.0, 14194.0], [65.0, 14071.0], [64.0, 14600.0], [71.0, 14873.0], [69.0, 14375.0], [68.0, 15106.0], [75.0, 14930.5], [73.0, 14708.0], [79.0, 13937.0], [78.0, 14666.0], [77.0, 15037.0], [76.0, 15226.0], [83.0, 14114.0], [82.0, 15059.0], [81.0, 15345.0], [80.0, 14402.0], [87.0, 14371.0], [86.0, 15386.0], [85.0, 15595.0], [84.0, 14577.0], [91.0, 13984.0], [90.0, 15208.0], [89.0, 15483.0], [88.0, 14054.0], [95.0, 15509.0], [94.0, 14366.5], [92.0, 15108.0], [99.0, 14806.0], [98.0, 14525.0], [97.0, 14951.0], [96.0, 14197.0], [103.0, 14152.0], [102.0, 14277.0], [101.0, 15136.5], [107.0, 14429.0], [106.0, 13947.0], [105.0, 15402.0], [104.0, 14554.0], [109.0, 488.0], [111.0, 14885.0], [110.0, 14248.5], [108.0, 14179.0], [115.0, 13840.0], [114.0, 14177.0], [113.0, 15207.0], [112.0, 13868.0], [119.0, 14871.0], [118.0, 15419.0], [117.0, 15462.0], [116.0, 14558.0], [123.0, 14969.5], [121.0, 15454.0], [120.0, 14627.0], [126.0, 14413.0], [124.0, 14366.0], [135.0, 14547.0], [134.0, 13925.0], [133.0, 15198.0], [132.0, 14860.0], [131.0, 13954.0], [130.0, 15268.0], [129.0, 14649.0], [128.0, 14449.5], [137.0, 7834.5], [140.0, 7543.5], [139.0, 7961.0], [143.0, 14822.0], [142.0, 14465.5], [138.0, 15195.0], [136.0, 14656.0], [151.0, 14864.0], [150.0, 14444.0], [148.0, 14903.0], [147.0, 14168.0], [146.0, 14996.0], [145.0, 15414.0], [144.0, 14274.0], [152.0, 7424.5], [155.0, 7405.5], [158.0, 7561.0], [159.0, 7847.0], [157.0, 14423.0], [154.0, 14314.0], [153.0, 14169.0], [160.0, 5596.333333333333], [163.0, 7623.5], [164.0, 8025.5], [167.0, 13759.0], [166.0, 14249.0], [165.0, 13972.0], [162.0, 14729.0], [161.0, 15014.0], [173.0, 7287.5], [175.0, 5333.333333333333], [174.0, 7354.5], [172.0, 14947.0], [171.0, 14197.0], [170.0, 15246.0], [169.0, 14146.0], [168.0, 15028.0], [179.0, 7576.0], [181.0, 7284.0], [183.0, 15120.0], [182.0, 14473.0], [180.0, 13789.0], [178.0, 14191.0], [177.0, 14612.0], [176.0, 14311.0], [188.0, 7439.5], [189.0, 7932.0], [191.0, 15175.0], [190.0, 13673.0], [187.0, 14530.0], [186.0, 15041.0], [185.0, 14548.0], [184.0, 15158.0], [196.0, 8017.0], [198.0, 7566.5], [199.0, 15299.0], [197.0, 14872.0], [195.0, 15080.0], [194.0, 13840.0], [193.0, 15133.0], [192.0, 14678.0], [202.0, 7930.0], [207.0, 14069.0], [206.0, 14309.0], [205.0, 15108.0], [204.0, 14455.0], [203.0, 14823.0], [201.0, 14003.0], [200.0, 14023.0], [209.0, 8101.5], [213.0, 7617.5], [215.0, 13843.0], [214.0, 17321.0], [212.0, 13792.0], [211.0, 14205.0], [210.0, 14664.0], [208.0, 14683.0], [216.0, 7995.0], [223.0, 14580.0], [222.0, 13865.0], [221.0, 13669.0], [220.0, 14854.0], [219.0, 15104.0], [218.0, 13912.0], [217.0, 14562.0], [225.0, 7356.0], [231.0, 13739.0], [230.0, 13842.0], [229.0, 14247.0], [228.0, 14515.0], [227.0, 14864.0], [226.0, 14472.0], [224.0, 13622.0], [234.0, 7804.0], [236.0, 7309.5], [239.0, 14187.0], [237.0, 14478.0], [235.0, 14250.0], [233.0, 13716.0], [232.0, 13834.0], [242.0, 7446.5], [247.0, 7428.0], [246.0, 13944.0], [245.0, 15044.0], [244.0, 13887.0], [243.0, 14599.0], [241.0, 14775.0], [240.0, 14319.0], [252.0, 7956.0], [255.0, 13373.0], [254.0, 14203.0], [253.0, 13518.0], [251.0, 14325.0], [250.0, 14002.0], [248.0, 13423.0], [268.0, 7740.5], [256.0, 7745.5], [259.0, 13410.0], [258.0, 14132.0], [257.0, 13836.0], [263.0, 13809.0], [261.0, 5466.0], [260.0, 14280.0], [262.0, 5278.333333333333], [271.0, 8087.5], [265.0, 13298.0], [264.0, 14547.0], [270.0, 14303.0], [269.0, 14445.0], [267.0, 14243.0], [266.0, 13900.0], [285.0, 13386.0], [287.0, 14704.0], [280.0, 4351.0], [286.0, 14285.0], [284.0, 14075.0], [275.0, 14804.0], [274.0, 14399.0], [273.0, 14376.0], [272.0, 13971.0], [283.0, 13488.0], [282.0, 13573.0], [279.0, 14411.0], [278.0, 13175.0], [277.0, 14237.0], [276.0, 13875.0], [302.0, 14390.0], [291.0, 7440.0], [290.0, 14334.0], [289.0, 13194.0], [288.0, 13394.0], [303.0, 13775.0], [301.0, 14519.0], [300.0, 13857.5], [298.0, 13647.0], [297.0, 13388.0], [296.0, 14255.0], [295.0, 14382.0], [294.0, 14571.0], [293.0, 13794.0], [292.0, 14335.0], [319.0, 12937.0], [314.0, 7187.5], [318.0, 13354.0], [317.0, 14114.0], [316.0, 13096.0], [307.0, 14007.0], [306.0, 13526.0], [305.0, 13979.0], [304.0, 13315.0], [315.0, 14209.0], [313.0, 13001.0], [312.0, 14494.0], [311.0, 13061.0], [310.0, 13686.0], [309.0, 13402.0], [308.0, 14433.0], [334.0, 7310.0], [335.0, 1122.0], [333.0, 13961.0], [332.0, 13346.0], [331.0, 13149.0], [330.0, 12923.0], [329.0, 14254.0], [328.0, 13272.5], [326.0, 13491.0], [321.0, 13854.0], [320.0, 14136.0], [323.0, 13314.0], [322.0, 14443.0], [325.0, 13899.0], [324.0, 13339.0], [349.0, 12919.0], [351.0, 13168.0], [345.0, 7250.0], [350.0, 13767.0], [348.0, 12849.0], [339.0, 14293.0], [338.0, 13371.0], [337.0, 14103.0], [336.0, 13442.0], [347.0, 14160.5], [344.0, 13562.0], [343.0, 13007.0], [342.0, 13667.0], [341.0, 14225.0], [340.0, 15472.0], [366.0, 13780.0], [360.0, 7352.0], [362.0, 8557.5], [367.0, 13061.0], [365.0, 12759.0], [364.0, 14103.0], [363.0, 14056.0], [361.0, 13189.0], [359.0, 13413.0], [353.0, 14143.0], [352.0, 13193.0], [355.0, 14314.0], [354.0, 13476.0], [358.0, 17019.0], [357.0, 13940.0], [356.0, 14890.0], [382.0, 13762.0], [368.0, 1318.0], [369.0, 13958.5], [371.0, 12724.0], [370.0, 12965.0], [375.0, 13887.0], [374.0, 13475.0], [373.0, 13942.0], [372.0, 13275.0], [383.0, 16091.0], [381.0, 12744.0], [380.0, 13395.0], [379.0, 12977.0], [378.0, 13729.0], [377.0, 15220.0], [376.0, 13654.0], [398.0, 12474.0], [386.0, 7735.5], [385.0, 14143.0], [384.0, 14149.0], [387.0, 13178.0], [390.0, 13700.0], [389.0, 12875.0], [388.0, 13521.0], [399.0, 14326.0], [397.0, 12706.0], [396.0, 13819.0], [395.0, 13065.0], [394.0, 13537.0], [393.0, 12748.0], [392.0, 13165.5], [414.0, 16781.0], [405.0, 7376.5], [404.0, 14948.0], [407.0, 12623.0], [401.0, 12627.0], [400.0, 13579.0], [403.0, 13693.0], [402.0, 12743.0], [406.0, 12894.0], [415.0, 13159.0], [413.0, 13878.0], [412.0, 13119.0], [411.0, 13560.0], [410.0, 13054.0], [409.0, 15863.0], [408.0, 14691.0], [430.0, 13133.0], [417.0, 7527.0], [416.0, 12900.0], [419.0, 13443.0], [418.0, 12788.0], [423.0, 13273.0], [422.0, 12238.0], [421.0, 13247.0], [420.0, 12207.0], [431.0, 14819.0], [429.0, 12805.0], [428.0, 13226.0], [427.0, 13460.0], [426.0, 12702.0], [425.0, 12340.0], [424.0, 13625.0], [446.0, 13119.0], [435.0, 6816.0], [434.0, 13597.0], [433.0, 13669.0], [432.0, 14055.0], [439.0, 12791.0], [438.0, 13970.0], [437.0, 12223.0], [436.0, 16648.0], [447.0, 16410.0], [445.0, 12095.0], [444.0, 16510.0], [443.0, 12158.0], [442.0, 12195.0], [441.0, 12252.0], [440.0, 11971.0], [462.0, 11939.0], [455.0, 7525.5], [449.0, 13118.0], [448.0, 12125.0], [451.0, 13531.0], [450.0, 11901.0], [454.0, 12036.0], [453.0, 12843.0], [452.0, 15333.0], [463.0, 12106.0], [461.0, 12204.0], [460.0, 13238.0], [459.0, 12929.0], [458.0, 11834.0], [457.0, 12591.0], [456.0, 14173.0], [478.0, 14496.5], [465.0, 1636.5], [464.0, 9068.0], [471.0, 12840.0], [470.0, 16399.0], [469.0, 12449.0], [468.0, 13884.0], [479.0, 16063.0], [476.0, 14368.0], [467.0, 12591.0], [466.0, 12783.0], [475.0, 12339.0], [474.0, 13555.0], [473.0, 12604.0], [472.0, 13360.0], [494.0, 12321.0], [495.0, 13854.0], [493.0, 13630.0], [492.0, 15837.0], [491.0, 11550.0], [490.0, 14190.0], [489.0, 12190.0], [488.0, 12055.0], [487.0, 13095.0], [481.0, 16251.0], [480.0, 15162.0], [483.0, 14269.0], [482.0, 13138.0], [486.0, 12513.0], [485.0, 14081.0], [484.0, 14314.0], [509.0, 11724.0], [511.0, 12014.5], [508.0, 11368.0], [499.0, 13161.0], [498.0, 13381.0], [497.0, 15809.0], [496.0, 13435.0], [507.0, 14943.0], [506.0, 12940.0], [505.0, 12347.0], [504.0, 13921.0], [503.0, 14088.0], [502.0, 12094.0], [501.0, 13456.0], [500.0, 13334.0], [540.0, 13111.0], [528.0, 11619.0], [532.0, 12787.0], [542.0, 15726.0], [538.0, 12395.0], [536.0, 13735.0], [512.0, 13623.0], [516.0, 13746.0], [518.0, 13883.0], [526.0, 12753.0], [524.0, 12711.0], [522.0, 14693.0], [520.0, 11466.0], [534.0, 12741.0], [572.0, 12336.0], [560.0, 12329.0], [562.0, 12922.0], [564.0, 12513.0], [574.0, 13213.0], [570.0, 15425.0], [568.0, 13096.0], [544.0, 12783.0], [546.0, 11231.0], [548.0, 12895.0], [550.0, 11583.0], [558.0, 11543.0], [556.0, 11045.0], [554.0, 14601.0], [552.0, 13345.0], [566.0, 12711.0], [604.0, 13156.0], [592.0, 12125.0], [594.0, 14211.5], [596.0, 14809.0], [606.0, 12722.0], [602.0, 12299.0], [600.0, 12514.0], [576.0, 12682.0], [578.0, 11988.0], [580.0, 14221.0], [582.0, 12177.0], [588.0, 12655.0], [586.0, 14015.0], [584.0, 11798.0], [598.0, 11946.0], [636.0, 12267.0], [624.0, 12380.0], [626.0, 12507.0], [628.0, 12950.0], [638.0, 12870.0], [634.0, 12141.0], [632.0, 11714.0], [608.0, 12403.0], [610.0, 12263.0], [612.0, 12325.0], [614.0, 13052.0], [620.0, 12869.0], [618.0, 12122.0], [616.0, 12178.5], [630.0, 12969.0], [642.0, 12068.0], [664.0, 5696.333333333334], [670.0, 11724.0], [666.0, 8284.0], [640.0, 12815.0], [644.0, 14733.0], [646.0, 10650.0], [654.0, 12784.0], [652.0, 14480.0], [650.0, 12560.0], [648.0, 12339.0], [656.0, 12727.0], [658.0, 11374.0], [660.0, 12182.0], [668.0, 12020.0], [662.0, 12717.0], [674.0, 11637.0], [698.0, 12266.0], [672.0, 6956.0], [678.0, 4215.0], [676.0, 13720.0], [696.0, 12421.0], [682.0, 7132.0], [680.0, 12525.0], [684.0, 7117.0], [700.0, 8415.5], [688.0, 13568.0], [690.0, 12139.0], [692.0, 12534.0], [694.0, 12229.0], [702.0, 11619.0], [706.0, 12086.0], [730.0, 11320.0], [734.0, 11907.0], [708.0, 7869.0], [704.0, 11050.0], [718.0, 11603.0], [710.0, 6981.5], [728.0, 14117.0], [732.0, 12107.0], [714.0, 11616.0], [712.0, 11790.0], [716.0, 11913.0], [726.0, 11347.0], [724.0, 11853.0], [720.0, 12882.0], [722.0, 11896.0], [766.0, 11048.0], [754.0, 11155.0], [752.0, 10924.0], [756.0, 6898.5], [758.0, 10923.0], [764.0, 11822.0], [762.0, 10957.0], [760.0, 11606.0], [742.0, 11191.0], [740.0, 12040.0], [738.0, 14018.0], [736.0, 12048.0], [750.0, 11865.0], [748.0, 11197.0], [746.0, 11989.0], [744.0, 12609.0], [770.0, 13535.0], [772.0, 13455.0], [768.0, 11482.0], [782.0, 12346.0], [792.0, 10629.0], [774.0, 11468.0], [794.0, 11195.0], [778.0, 11424.0], [776.0, 11037.0], [780.0, 10870.0], [786.0, 10946.0], [784.0, 10970.0], [788.0, 11537.0], [790.0, 10648.0], [798.0, 10855.0], [796.0, 11436.0], [804.0, 10597.0], [826.0, 10649.0], [830.0, 10629.0], [806.0, 7928.5], [802.0, 11146.0], [800.0, 11284.0], [814.0, 10551.0], [812.0, 10828.0], [810.0, 10791.0], [808.0, 10511.0], [818.0, 6907.5], [820.0, 11231.0], [822.0, 11254.0], [816.0, 10841.0], [828.0, 10445.0], [824.0, 10846.0], [832.0, 11228.0], [834.0, 7104.0], [846.0, 10396.0], [844.0, 10179.0], [842.0, 9888.0], [840.0, 10912.0], [856.0, 9788.0], [836.0, 10942.5], [854.0, 9929.0], [852.0, 9537.0], [850.0, 9972.0], [848.0, 9833.0], [862.0, 9351.0], [860.0, 9822.0], [858.0, 10315.0], [864.0, 9952.0], [888.0, 6161.0], [870.0, 6249.5], [866.0, 9864.0], [876.0, 6525.0], [874.0, 10096.0], [872.0, 9612.0], [878.0, 6434.0], [886.0, 6120.0], [892.0, 9258.0], [890.0, 9644.0], [880.0, 9606.0], [882.0, 10018.0], [884.0, 9823.0], [894.0, 9520.0], [898.0, 9256.0], [922.0, 9502.0], [926.0, 5526.666666666667], [896.0, 6464.0], [900.0, 9765.0], [902.0, 8821.0], [910.0, 9110.0], [920.0, 9529.0], [906.0, 9399.0], [904.0, 9217.0], [908.0, 6362.0], [914.0, 6276.5], [918.0, 6317.5], [916.0, 9407.0], [912.0, 9662.0], [924.0, 9510.0], [928.0, 9466.0], [956.0, 6420.0], [936.0, 6129.5], [938.0, 9367.0], [940.0, 9204.0], [930.0, 9527.0], [942.0, 11150.0], [934.0, 9456.0], [932.0, 9474.0], [952.0, 10799.0], [954.0, 9259.0], [944.0, 6130.5], [946.0, 9285.0], [948.0, 9101.0], [950.0, 9020.0], [958.0, 9955.0], [960.0, 8612.0], [972.0, 3459.0], [970.0, 9815.0], [968.0, 9113.0], [962.0, 9142.0], [964.0, 9065.0], [974.0, 8988.0], [978.0, 6738.5], [976.0, 8969.0], [982.0, 8924.0], [988.0, 6255.0], [990.0, 8822.0], [986.0, 8890.0], [984.0, 10378.0], [966.0, 9975.0], [992.0, 3636.0], [1018.0, 6126.0], [996.0, 8818.0], [994.0, 9894.0], [998.0, 9656.0], [1016.0, 8485.0], [1006.0, 6184.0], [1004.0, 10460.0], [1002.0, 8748.0], [1000.0, 8421.0], [1008.0, 8702.0], [1010.0, 9571.0], [1012.0, 10646.0], [1014.0, 10563.0], [1022.0, 8580.0], [1020.0, 8537.0], [1028.0, 9573.0], [1040.0, 5944.0], [1044.0, 8116.0], [1072.0, 9935.0], [1036.0, 6041.5], [1032.0, 8486.0], [1048.0, 6047.5], [1052.0, 10162.0], [1024.0, 8567.0], [1076.0, 8363.0], [1080.0, 8699.5], [1084.0, 6356.0], [1056.0, 8993.0], [1060.0, 8211.0], [1064.0, 8060.0], [1068.0, 8115.0], [1136.0, 6196.5], [1092.0, 8514.0], [1096.0, 7901.0], [1100.0, 9843.0], [1144.0, 7600.0], [1140.0, 8394.0], [1120.0, 8591.0], [1124.0, 7703.0], [1148.0, 8316.0], [1104.0, 5497.0], [1108.0, 9705.0], [1112.0, 8641.0], [1116.0, 7781.0], [1088.0, 7994.0], [1132.0, 6537.0], [1128.0, 9224.0], [1200.0, 5856.5], [1152.0, 8179.0], [1156.0, 5987.0], [1160.0, 8035.0], [1184.0, 8340.0], [1212.0, 7528.0], [1208.0, 7043.0], [1164.0, 8391.0], [1204.0, 7618.0], [1188.0, 6092.5], [1192.0, 8851.0], [1196.0, 8775.0], [1172.0, 8430.0], [1168.0, 8312.0], [1176.0, 7322.0], [1180.0, 8006.0], [1224.0, 8597.0], [1228.0, 7392.0], [1220.0, 7567.0], [1216.0, 6954.0], [1236.0, 5791.0], [1232.0, 8699.0], [1240.0, 8430.0], [1252.0, 7636.0], [1248.0, 7624.0], [1256.0, 8469.0], [1268.0, 4609.25], [1272.0, 7726.0], [1276.0, 7394.0], [1264.0, 7913.0], [1260.0, 8328.0], [1292.0, 5433.0], [1288.0, 5702.5], [1280.0, 7015.0], [1284.0, 7466.0], [1312.0, 5738.5], [1332.0, 7973.0], [1336.0, 6565.0], [1340.0, 7863.0], [1328.0, 7206.0], [1316.0, 6793.0], [1320.0, 7422.0], [1324.0, 7086.0], [1304.0, 7277.0], [1296.0, 7562.0], [1308.0, 6175.0], [1352.0, 6790.0], [1356.0, 4999.4], [1344.0, 6877.0], [1372.0, 5548.5], [1348.0, 5471.0], [1380.0, 5854.0], [1376.0, 7664.0], [1404.0, 6532.0], [1400.0, 4438.25], [1396.0, 7437.0], [1392.0, 5328.0], [1384.0, 6680.0], [1388.0, 5601.0], [1360.0, 5525.5], [1364.0, 6828.0], [1368.0, 6748.0], [1412.0, 5380.0], [1408.0, 6530.0], [1436.0, 4715.0], [1432.0, 4965.5], [1416.0, 6262.0], [1420.0, 6210.0], [1456.0, 6868.0], [1468.0, 5447.333333333333], [1464.0, 5855.0], [1460.0, 6173.0], [1448.0, 5285.333333333333], [1452.0, 6763.0], [1444.0, 5752.5], [1440.0, 5403.0], [1424.0, 5277.5], [1428.0, 6662.0], [1476.0, 4835.333333333333], [1472.0, 4699.8], [1500.0, 6067.0], [1496.0, 6265.0], [1492.0, 6386.0], [1488.0, 5539.5], [1480.0, 5070.0], [1484.0, 6485.0], [1504.0, 5992.0], [1508.0, 6838.0], [1528.0, 6660.0], [1532.0, 4148.0], [1524.0, 5487.0], [1520.0, 5256.0], [1512.0, 4720.0], [1516.0, 5361.0], [1548.0, 5396.0], [1540.0, 5409.333333333333], [1536.0, 5283.0], [1564.0, 5074.0], [1556.0, 5962.0], [1552.0, 5728.0], [1568.0, 5789.0], [1572.0, 5339.0], [1576.0, 5508.0], [1580.0, 5575.0], [1544.0, 5600.0], [1029.0, 7505.0], [1037.0, 3730.0], [1081.0, 4961.666666666667], [1025.0, 5899.666666666666], [1041.0, 8400.0], [1045.0, 8913.0], [1073.0, 8073.0], [1033.0, 8409.0], [1049.0, 6833.0], [1053.0, 9924.0], [1077.0, 8029.0], [1057.0, 8187.0], [1061.0, 8856.0], [1065.0, 8045.0], [1069.0, 8854.0], [1085.0, 8020.0], [1137.0, 8557.0], [1097.0, 9618.0], [1093.0, 7920.0], [1101.0, 9604.0], [1145.0, 4922.0], [1121.0, 8612.0], [1125.0, 9589.0], [1149.0, 9093.0], [1105.0, 9310.0], [1109.0, 9263.0], [1113.0, 6073.5], [1117.0, 6096.0], [1089.0, 8958.0], [1129.0, 8421.0], [1133.0, 7673.0], [1165.0, 9351.0], [1161.0, 9121.0], [1153.0, 6088.5], [1157.0, 8113.0], [1185.0, 8753.0], [1213.0, 8077.0], [1209.0, 8630.0], [1201.0, 8229.0], [1205.0, 6126.5], [1189.0, 6062.0], [1197.0, 8121.0], [1173.0, 9072.0], [1169.0, 9289.0], [1177.0, 9008.0], [1181.0, 7296.0], [1221.0, 8100.0], [1225.0, 7812.0], [1217.0, 8722.0], [1229.0, 6318.5], [1233.0, 7700.0], [1237.0, 7963.0], [1241.0, 5441.0], [1245.0, 8253.5], [1253.0, 5557.5], [1249.0, 8598.0], [1269.0, 7940.0], [1273.0, 7397.0], [1277.0, 8414.0], [1265.0, 5895.0], [1257.0, 6060.5], [1261.0, 7226.0], [1293.0, 6873.0], [1281.0, 8007.0], [1285.0, 7705.0], [1289.0, 7144.0], [1333.0, 5334.0], [1337.0, 6904.0], [1341.0, 6566.0], [1329.0, 7893.0], [1313.0, 4729.0], [1317.0, 7434.0], [1321.0, 7223.0], [1325.0, 7141.0], [1305.0, 7620.0], [1301.0, 7772.0], [1297.0, 7223.0], [1309.0, 7258.0], [1353.0, 7180.0], [1397.0, 6451.0], [1369.0, 5177.333333333333], [1345.0, 5343.0], [1373.0, 6582.0], [1349.0, 6956.0], [1377.0, 6420.0], [1405.0, 6145.0], [1401.0, 6257.0], [1357.0, 6779.0], [1393.0, 6481.0], [1381.0, 6229.5], [1385.0, 6575.0], [1389.0, 5366.25], [1361.0, 6967.0], [1365.0, 7811.0], [1413.0, 6434.0], [1429.0, 5515.666666666667], [1409.0, 5438.0], [1437.0, 4872.75], [1433.0, 5527.0], [1417.0, 5657.0], [1421.0, 6286.0], [1457.0, 6280.0], [1465.0, 5743.0], [1469.0, 4675.5], [1461.0, 6065.0], [1441.0, 5211.0], [1445.0, 5219.0], [1449.0, 4731.0], [1453.0, 4953.0], [1425.0, 4967.0], [1473.0, 4618.0], [1477.0, 4839.5], [1501.0, 5128.0], [1497.0, 5098.0], [1493.0, 5089.75], [1489.0, 4790.5], [1481.0, 4948.0], [1509.0, 5718.0], [1505.0, 5789.0], [1533.0, 4991.0], [1525.0, 6102.0], [1529.0, 5763.0], [1521.0, 5018.5], [1513.0, 5380.5], [1485.0, 5012.0], [1549.0, 5761.0], [1541.0, 5084.0], [1537.0, 5608.8], [1561.0, 5466.5], [1557.0, 5912.0], [1553.0, 5918.0], [1569.0, 5920.0], [1573.0, 5734.0], [1577.0, 5580.333333333333], [1581.0, 5215.5], [1545.0, 5374.0], [541.0, 12437.0], [543.0, 14819.0], [531.0, 13156.5], [529.0, 12556.0], [533.0, 13316.0], [539.0, 12483.0], [537.0, 11427.0], [527.0, 12708.0], [515.0, 12584.5], [513.0, 13533.0], [517.0, 13066.0], [519.0, 12528.0], [525.0, 11687.0], [523.0, 13875.0], [521.0, 15545.0], [535.0, 12660.0], [573.0, 14385.0], [575.0, 12437.0], [561.0, 15442.0], [563.0, 15379.0], [565.0, 13399.0], [571.0, 12930.0], [569.0, 14058.0], [559.0, 13595.0], [545.0, 13436.0], [547.0, 12520.0], [549.0, 12976.0], [551.0, 14533.0], [557.0, 12598.0], [555.0, 11526.0], [553.0, 12820.0], [567.0, 12190.0], [605.0, 14875.0], [607.0, 14760.0], [595.0, 13146.0], [597.0, 11090.0], [603.0, 13159.0], [601.0, 13764.0], [591.0, 13921.5], [577.0, 15027.0], [579.0, 15227.0], [581.0, 14502.0], [583.0, 12726.0], [589.0, 15031.0], [587.0, 12640.0], [585.0, 13408.0], [599.0, 12870.0], [637.0, 12936.0], [639.0, 11993.0], [625.0, 11555.0], [627.0, 14479.0], [629.0, 12122.0], [635.0, 10975.0], [633.0, 14519.0], [623.0, 11969.0], [609.0, 11467.0], [611.0, 13140.0], [613.0, 14616.0], [621.0, 12495.0], [619.0, 12091.0], [617.0, 11356.0], [631.0, 12936.0], [641.0, 14349.0], [655.0, 11945.0], [643.0, 12146.0], [645.0, 12845.0], [647.0, 11516.0], [653.0, 11892.0], [651.0, 12745.0], [649.0, 12243.0], [671.0, 12252.0], [657.0, 11832.0], [659.0, 14253.0], [661.0, 12651.0], [669.0, 11872.0], [667.0, 11730.0], [665.0, 14660.0], [663.0, 14678.0], [675.0, 11869.0], [673.0, 7832.0], [687.0, 12691.0], [685.0, 13549.0], [677.0, 14384.0], [679.0, 12593.0], [697.0, 11636.0], [699.0, 14117.0], [681.0, 12310.0], [683.0, 11986.0], [703.0, 12027.0], [689.0, 13436.0], [691.0, 14299.0], [693.0, 13552.0], [695.0, 12496.0], [701.0, 12032.0], [709.0, 11813.0], [705.0, 7296.5], [707.0, 11692.0], [719.0, 12147.0], [711.0, 11700.0], [729.0, 11530.0], [731.0, 12711.0], [733.0, 10585.0], [715.0, 7785.5], [713.0, 12427.0], [717.0, 7092.5], [723.0, 6974.5], [727.0, 7396.0], [725.0, 11290.0], [735.0, 13950.0], [721.0, 13300.0], [767.0, 11682.0], [763.0, 10912.0], [755.0, 6934.5], [753.0, 11936.0], [759.0, 2504.0], [757.0, 11002.0], [765.0, 13583.0], [761.0, 11334.0], [743.0, 11929.0], [741.0, 14023.0], [739.0, 11176.0], [737.0, 11135.0], [751.0, 11161.0], [749.0, 13473.0], [747.0, 11875.0], [745.0, 11964.0], [769.0, 13504.0], [797.0, 10510.0], [773.0, 7010.5], [783.0, 10724.0], [771.0, 11562.0], [775.0, 11712.0], [793.0, 10658.0], [779.0, 6975.0], [777.0, 10826.0], [781.0, 6873.0], [787.0, 6680.0], [785.0, 10680.0], [789.0, 11490.0], [791.0, 10566.0], [799.0, 10538.0], [795.0, 12234.0], [803.0, 11161.0], [805.0, 13157.0], [801.0, 10579.0], [815.0, 11939.0], [813.0, 10938.0], [811.0, 11127.0], [809.0, 10413.0], [807.0, 6937.5], [817.0, 6829.0], [819.0, 11282.0], [821.0, 13079.0], [823.0, 10739.0], [831.0, 10946.0], [829.0, 11128.0], [827.0, 10819.0], [825.0, 11192.0], [859.0, 9816.0], [861.0, 7440.0], [847.0, 9979.0], [833.0, 11100.0], [845.0, 10440.0], [843.0, 10082.0], [841.0, 10288.0], [839.0, 11047.0], [837.0, 11000.0], [855.0, 6204.0], [853.0, 9930.0], [851.0, 10088.0], [849.0, 10297.0], [863.0, 10129.0], [857.0, 9732.0], [865.0, 10200.0], [871.0, 9924.0], [879.0, 9736.0], [869.0, 9935.0], [867.0, 10106.0], [875.0, 11154.0], [873.0, 9564.0], [877.0, 10018.0], [887.0, 6568.5], [893.0, 6446.5], [891.0, 8963.0], [889.0, 9113.0], [895.0, 11541.0], [881.0, 9829.0], [883.0, 9859.0], [885.0, 9940.0], [899.0, 9506.0], [897.0, 11515.0], [901.0, 9721.0], [903.0, 9633.0], [911.0, 9637.0], [909.0, 11281.0], [921.0, 8804.0], [923.0, 10223.0], [907.0, 6150.0], [905.0, 9540.0], [917.0, 9556.0], [915.0, 9590.0], [919.0, 9192.0], [927.0, 9038.0], [913.0, 9126.0], [925.0, 9203.0], [943.0, 8869.0], [931.0, 7318.0], [937.0, 11323.0], [939.0, 8471.0], [941.0, 9349.0], [929.0, 9076.0], [935.0, 6739.5], [933.0, 9430.0], [953.0, 9270.0], [955.0, 8664.0], [947.0, 6390.0], [945.0, 8377.0], [949.0, 9083.0], [951.0, 6345.5], [959.0, 6060.0], [957.0, 9215.0], [975.0, 9017.0], [965.0, 6118.5], [989.0, 10806.0], [971.0, 8679.0], [969.0, 8950.0], [973.0, 9798.0], [961.0, 10928.0], [963.0, 8952.0], [977.0, 8900.0], [981.0, 9665.5], [979.0, 8904.0], [983.0, 9726.0], [991.0, 9478.0], [987.0, 10422.0], [985.0, 8827.0], [967.0, 9109.0], [995.0, 10340.0], [997.0, 6276.0], [993.0, 9239.0], [999.0, 8772.0], [1017.0, 8553.0], [1005.0, 8759.0], [1003.0, 9465.0], [1001.0, 8766.0], [1007.0, 8727.0], [1023.0, 6147.0], [1009.0, 8680.0], [1011.0, 10589.0], [1013.0, 8522.0], [1015.0, 9198.0], [1021.0, 8588.0], [1019.0, 8617.0], [1026.0, 8554.0], [1034.0, 8406.0], [1038.0, 6990.666666666667], [1042.0, 8402.0], [1046.0, 8165.0], [1030.0, 8458.0], [1050.0, 8251.0], [1054.0, 10099.0], [1074.0, 6228.0], [1078.0, 8896.0], [1082.0, 5699.5], [1058.0, 8918.0], [1062.0, 8157.0], [1066.0, 8123.0], [1070.0, 9074.0], [1086.0, 8010.0], [1098.0, 7916.0], [1094.0, 6672.0], [1114.0, 5132.333333333333], [1090.0, 6627.0], [1102.0, 8645.0], [1142.0, 7979.0], [1138.0, 9607.0], [1146.0, 6017.0], [1122.0, 7722.0], [1126.0, 7720.0], [1150.0, 8299.0], [1106.0, 8510.0], [1110.0, 4792.4], [1118.0, 7731.0], [1130.0, 9181.0], [1134.0, 4930.5], [1206.0, 5585.0], [1158.0, 5650.0], [1154.0, 5619.666666666667], [1162.0, 5188.0], [1186.0, 6519.0], [1214.0, 6361.5], [1210.0, 3731.0], [1166.0, 7997.0], [1202.0, 7969.0], [1190.0, 8965.0], [1194.0, 7642.5], [1198.0, 7733.0], [1174.0, 9256.0], [1170.0, 8217.0], [1178.0, 4730.666666666667], [1182.0, 9239.0], [1222.0, 7454.0], [1226.0, 6374.5], [1218.0, 8509.0], [1230.0, 6830.0], [1234.0, 7817.0], [1238.0, 7714.0], [1242.0, 6765.0], [1246.0, 8128.0], [1250.0, 8531.0], [1254.0, 8477.0], [1270.0, 7781.0], [1274.0, 7079.0], [1278.0, 7394.0], [1266.0, 5700.5], [1258.0, 7552.0], [1262.0, 7394.0], [1294.0, 7227.0], [1282.0, 6140.0], [1286.0, 4993.0], [1290.0, 5777.5], [1334.0, 7022.0], [1338.0, 6987.0], [1342.0, 7140.0], [1330.0, 6537.0], [1314.0, 7981.0], [1318.0, 7354.0], [1322.0, 6131.5], [1326.0, 8101.0], [1306.0, 6832.0], [1302.0, 7161.0], [1298.0, 7463.0], [1310.0, 6010.0], [1354.0, 6639.0], [1374.0, 5437.5], [1346.0, 6552.0], [1350.0, 6196.5], [1378.0, 7442.0], [1406.0, 7534.0], [1402.0, 5505.5], [1398.0, 5575.333333333333], [1358.0, 6304.0], [1394.0, 4913.333333333333], [1382.0, 6547.0], [1386.0, 6504.0], [1390.0, 5362.25], [1362.0, 5575.5], [1366.0, 6734.0], [1370.0, 4767.0], [1414.0, 7127.0], [1438.0, 4740.5], [1434.0, 5190.0], [1430.0, 6818.0], [1410.0, 5671.0], [1418.0, 6522.0], [1422.0, 5320.0], [1458.0, 5297.5], [1466.0, 5994.0], [1470.0, 5403.75], [1462.0, 5006.75], [1442.0, 5159.0], [1450.0, 5280.0], [1454.0, 4963.0], [1446.0, 5252.5], [1426.0, 4755.5], [1478.0, 5889.0], [1474.0, 5021.0], [1502.0, 5314.5], [1498.0, 5337.0], [1494.0, 5892.666666666667], [1490.0, 5672.0], [1486.0, 4971.666666666667], [1506.0, 5914.0], [1534.0, 5353.0], [1526.0, 6154.0], [1530.0, 5484.0], [1522.0, 5376.333333333333], [1510.0, 5463.5], [1514.0, 5321.0], [1518.0, 5320.0], [1482.0, 4910.666666666667], [1538.0, 5949.5], [1546.0, 4858.0], [1566.0, 5286.0], [1558.0, 5165.0], [1554.0, 5533.0], [1562.0, 5177.75], [1542.0, 4834.0], [1550.0, 5491.0], [1570.0, 5100.0], [1574.0, 4177.0], [1578.0, 6004.0], [1582.0, 4731.0], [1027.0, 9277.0], [1043.0, 9912.0], [1047.0, 9231.0], [1039.0, 6458.5], [1035.0, 8420.0], [1031.0, 9030.0], [1051.0, 8913.0], [1055.0, 8961.0], [1079.0, 3258.0], [1083.0, 9723.0], [1087.0, 5691.5], [1059.0, 9000.0], [1063.0, 8163.0], [1067.0, 8983.0], [1071.0, 8100.0], [1095.0, 9464.0], [1091.0, 7941.0], [1099.0, 7726.0], [1103.0, 8528.0], [1139.0, 7623.0], [1151.0, 9267.0], [1147.0, 8428.0], [1107.0, 8446.0], [1115.0, 5154.75], [1119.0, 9559.0], [1127.0, 4922.25], [1131.0, 8313.0], [1135.0, 6093.0], [1167.0, 7426.0], [1163.0, 6189.0], [1155.0, 7523.0], [1159.0, 9340.0], [1187.0, 8005.0], [1211.0, 8162.5], [1215.0, 7873.0], [1207.0, 8733.0], [1203.0, 9062.0], [1191.0, 8716.0], [1195.0, 6229.0], [1199.0, 7177.0], [1175.0, 6153.0], [1171.0, 8125.0], [1179.0, 6403.5], [1183.0, 8493.0], [1219.0, 7856.0], [1223.0, 8388.0], [1267.0, 5018.333333333333], [1227.0, 5448.0], [1231.0, 5824.5], [1235.0, 7739.0], [1239.0, 8523.0], [1243.0, 5702.0], [1247.0, 7307.0], [1251.0, 6674.0], [1255.0, 8713.0], [1271.0, 7331.0], [1275.0, 7587.0], [1279.0, 7285.0], [1259.0, 6021.0], [1263.0, 7732.0], [1295.0, 6141.5], [1283.0, 7176.0], [1287.0, 6171.0], [1291.0, 5589.5], [1335.0, 7000.0], [1339.0, 6949.0], [1343.0, 6931.0], [1331.0, 5158.0], [1315.0, 5810.0], [1319.0, 8730.0], [1323.0, 5050.5], [1327.0, 7558.0], [1307.0, 6296.0], [1303.0, 7231.0], [1299.0, 7101.0], [1311.0, 4989.333333333333], [1355.0, 7139.0], [1347.0, 6778.0], [1375.0, 5494.5], [1351.0, 7463.0], [1379.0, 6406.0], [1407.0, 7072.0], [1403.0, 4264.0], [1399.0, 4830.25], [1395.0, 7919.0], [1359.0, 6823.0], [1383.0, 6155.5], [1387.0, 7273.0], [1391.0, 5537.0], [1363.0, 5194.0], [1367.0, 6831.0], [1371.0, 5084.666666666667], [1415.0, 7071.0], [1439.0, 5149.0], [1435.0, 6366.0], [1431.0, 6690.0], [1411.0, 5486.0], [1419.0, 5608.0], [1423.0, 5619.5], [1463.0, 5289.666666666667], [1467.0, 5783.0], [1471.0, 4891.6], [1459.0, 5188.0], [1443.0, 6665.0], [1447.0, 4919.0], [1451.0, 6108.0], [1455.0, 5147.0], [1427.0, 4732.0], [1475.0, 5880.0], [1503.0, 5975.0], [1499.0, 5672.0], [1495.0, 6523.0], [1491.0, 5507.5], [1479.0, 5428.0], [1483.0, 5683.0], [1487.0, 4969.75], [1535.0, 5565.0], [1507.0, 5845.0], [1527.0, 5150.5], [1531.0, 5612.0], [1523.0, 5402.75], [1511.0, 5744.666666666667], [1515.0, 5287.0], [1519.0, 5594.5], [1543.0, 5076.5], [1539.0, 5613.0], [1563.0, 5508.333333333333], [1567.0, 4921.0], [1559.0, 5724.0], [1555.0, 5831.0], [1547.0, 5157.0], [1551.0, 5640.0], [1571.0, 5066.0], [1575.0, 5218.0], [1579.0, 5673.0], [1.0, 15068.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[862.3334999999994, 9315.49000000002]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1582.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 5761.816666666667, "minX": 1.54958352E12, "maxY": 7579.183333333333, "series": [{"data": [[1.54958352E12, 6417.683333333333], [1.54958358E12, 7579.183333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958352E12, 5761.816666666667], [1.54958358E12, 6804.85]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 5551.516902944382, "minX": 1.54958352E12, "maxY": 12502.52908587259, "series": [{"data": [[1.54958352E12, 5551.516902944382], [1.54958358E12, 12502.52908587259]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958358E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 5551.501635768814, "minX": 1.54958352E12, "maxY": 12502.520775623268, "series": [{"data": [[1.54958352E12, 5551.501635768814], [1.54958358E12, 12502.520775623268]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958358E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 76.85872576177285, "minX": 1.54958352E12, "maxY": 84.19520174482007, "series": [{"data": [[1.54958352E12, 84.19520174482007], [1.54958358E12, 76.85872576177285]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958358E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 488.0, "minX": 1.54958352E12, "maxY": 17321.0, "series": [{"data": [[1.54958352E12, 9843.0], [1.54958358E12, 17321.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958352E12, 488.0], [1.54958358E12, 7505.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958352E12, 8301.6], [1.54958358E12, 14473.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958352E12, 9601.3], [1.54958358E12, 15636.58]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958352E12, 8700.399999999998], [1.54958358E12, 15026.849999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 5508.0, "minX": 15.0, "maxY": 12930.0, "series": [{"data": [[18.0, 12930.0], [15.0, 5508.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 18.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 5508.0, "minX": 15.0, "maxY": 12930.0, "series": [{"data": [[18.0, 12930.0], [15.0, 5508.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 18.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958352E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958352E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 15.283333333333333, "minX": 1.54958352E12, "maxY": 18.05, "series": [{"data": [[1.54958352E12, 15.283333333333333], [1.54958358E12, 18.05]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 15.283333333333333, "minX": 1.54958352E12, "maxY": 18.05, "series": [{"data": [[1.54958352E12, 15.283333333333333], [1.54958358E12, 18.05]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958358E12, "title": "Transactions Per Second"}},
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
