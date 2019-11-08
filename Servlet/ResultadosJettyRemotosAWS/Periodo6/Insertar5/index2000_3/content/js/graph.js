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
        data: {"result": {"minY": 405.0, "minX": 0.0, "maxY": 15553.0, "series": [{"data": [[0.0, 405.0], [0.1, 565.0], [0.2, 583.0], [0.3, 612.0], [0.4, 672.0], [0.5, 711.0], [0.6, 742.0], [0.7, 748.0], [0.8, 814.0], [0.9, 833.0], [1.0, 847.0], [1.1, 877.0], [1.2, 957.0], [1.3, 975.0], [1.4, 1013.0], [1.5, 1038.0], [1.6, 1064.0], [1.7, 1121.0], [1.8, 1150.0], [1.9, 1168.0], [2.0, 1180.0], [2.1, 1204.0], [2.2, 1210.0], [2.3, 1251.0], [2.4, 1300.0], [2.5, 1306.0], [2.6, 1328.0], [2.7, 1395.0], [2.8, 1435.0], [2.9, 1523.0], [3.0, 1655.0], [3.1, 2194.0], [3.2, 2427.0], [3.3, 2451.0], [3.4, 2489.0], [3.5, 2548.0], [3.6, 2600.0], [3.7, 2619.0], [3.8, 2671.0], [3.9, 2785.0], [4.0, 2817.0], [4.1, 2856.0], [4.2, 2897.0], [4.3, 2934.0], [4.4, 2991.0], [4.5, 3061.0], [4.6, 3194.0], [4.7, 3231.0], [4.8, 3265.0], [4.9, 3397.0], [5.0, 3450.0], [5.1, 3453.0], [5.2, 3463.0], [5.3, 3479.0], [5.4, 3491.0], [5.5, 3508.0], [5.6, 3527.0], [5.7, 3545.0], [5.8, 3571.0], [5.9, 3585.0], [6.0, 3590.0], [6.1, 3601.0], [6.2, 3643.0], [6.3, 3653.0], [6.4, 3672.0], [6.5, 3694.0], [6.6, 3704.0], [6.7, 3732.0], [6.8, 3739.0], [6.9, 3742.0], [7.0, 3755.0], [7.1, 3791.0], [7.2, 3816.0], [7.3, 3832.0], [7.4, 3849.0], [7.5, 3869.0], [7.6, 3894.0], [7.7, 3910.0], [7.8, 3917.0], [7.9, 3929.0], [8.0, 3935.0], [8.1, 3938.0], [8.2, 3945.0], [8.3, 3949.0], [8.4, 3983.0], [8.5, 3986.0], [8.6, 4003.0], [8.7, 4016.0], [8.8, 4037.0], [8.9, 4053.0], [9.0, 4072.0], [9.1, 4079.0], [9.2, 4098.0], [9.3, 4106.0], [9.4, 4108.0], [9.5, 4116.0], [9.6, 4118.0], [9.7, 4147.0], [9.8, 4157.0], [9.9, 4169.0], [10.0, 4196.0], [10.1, 4205.0], [10.2, 4206.0], [10.3, 4214.0], [10.4, 4216.0], [10.5, 4224.0], [10.6, 4231.0], [10.7, 4242.0], [10.8, 4253.0], [10.9, 4259.0], [11.0, 4266.0], [11.1, 4276.0], [11.2, 4284.0], [11.3, 4301.0], [11.4, 4302.0], [11.5, 4312.0], [11.6, 4325.0], [11.7, 4346.0], [11.8, 4366.0], [11.9, 4372.0], [12.0, 4378.0], [12.1, 4404.0], [12.2, 4411.0], [12.3, 4414.0], [12.4, 4443.0], [12.5, 4451.0], [12.6, 4451.0], [12.7, 4457.0], [12.8, 4461.0], [12.9, 4466.0], [13.0, 4473.0], [13.1, 4499.0], [13.2, 4510.0], [13.3, 4529.0], [13.4, 4532.0], [13.5, 4554.0], [13.6, 4560.0], [13.7, 4567.0], [13.8, 4578.0], [13.9, 4579.0], [14.0, 4595.0], [14.1, 4597.0], [14.2, 4601.0], [14.3, 4609.0], [14.4, 4616.0], [14.5, 4641.0], [14.6, 4655.0], [14.7, 4661.0], [14.8, 4669.0], [14.9, 4698.0], [15.0, 4701.0], [15.1, 4710.0], [15.2, 4728.0], [15.3, 4748.0], [15.4, 4764.0], [15.5, 4777.0], [15.6, 4783.0], [15.7, 4791.0], [15.8, 4797.0], [15.9, 4802.0], [16.0, 4809.0], [16.1, 4817.0], [16.2, 4828.0], [16.3, 4834.0], [16.4, 4852.0], [16.5, 4855.0], [16.6, 4865.0], [16.7, 4867.0], [16.8, 4869.0], [16.9, 4877.0], [17.0, 4904.0], [17.1, 4919.0], [17.2, 4925.0], [17.3, 4930.0], [17.4, 4937.0], [17.5, 4946.0], [17.6, 4969.0], [17.7, 4975.0], [17.8, 4976.0], [17.9, 4987.0], [18.0, 5002.0], [18.1, 5002.0], [18.2, 5007.0], [18.3, 5013.0], [18.4, 5039.0], [18.5, 5044.0], [18.6, 5057.0], [18.7, 5060.0], [18.8, 5065.0], [18.9, 5076.0], [19.0, 5078.0], [19.1, 5079.0], [19.2, 5089.0], [19.3, 5093.0], [19.4, 5093.0], [19.5, 5103.0], [19.6, 5112.0], [19.7, 5124.0], [19.8, 5132.0], [19.9, 5136.0], [20.0, 5142.0], [20.1, 5153.0], [20.2, 5160.0], [20.3, 5164.0], [20.4, 5169.0], [20.5, 5177.0], [20.6, 5180.0], [20.7, 5183.0], [20.8, 5198.0], [20.9, 5217.0], [21.0, 5219.0], [21.1, 5220.0], [21.2, 5226.0], [21.3, 5228.0], [21.4, 5253.0], [21.5, 5273.0], [21.6, 5284.0], [21.7, 5291.0], [21.8, 5292.0], [21.9, 5302.0], [22.0, 5316.0], [22.1, 5324.0], [22.2, 5326.0], [22.3, 5337.0], [22.4, 5346.0], [22.5, 5351.0], [22.6, 5362.0], [22.7, 5364.0], [22.8, 5377.0], [22.9, 5380.0], [23.0, 5413.0], [23.1, 5431.0], [23.2, 5436.0], [23.3, 5451.0], [23.4, 5455.0], [23.5, 5464.0], [23.6, 5472.0], [23.7, 5479.0], [23.8, 5488.0], [23.9, 5495.0], [24.0, 5499.0], [24.1, 5518.0], [24.2, 5532.0], [24.3, 5543.0], [24.4, 5552.0], [24.5, 5578.0], [24.6, 5586.0], [24.7, 5600.0], [24.8, 5612.0], [24.9, 5648.0], [25.0, 5662.0], [25.1, 5676.0], [25.2, 5679.0], [25.3, 5693.0], [25.4, 5705.0], [25.5, 5716.0], [25.6, 5739.0], [25.7, 5765.0], [25.8, 5775.0], [25.9, 5804.0], [26.0, 5810.0], [26.1, 5820.0], [26.2, 5831.0], [26.3, 5890.0], [26.4, 5895.0], [26.5, 5936.0], [26.6, 5942.0], [26.7, 5957.0], [26.8, 5965.0], [26.9, 5992.0], [27.0, 6016.0], [27.1, 6034.0], [27.2, 6056.0], [27.3, 6065.0], [27.4, 6089.0], [27.5, 6130.0], [27.6, 6133.0], [27.7, 6138.0], [27.8, 6145.0], [27.9, 6164.0], [28.0, 6193.0], [28.1, 6209.0], [28.2, 6254.0], [28.3, 6256.0], [28.4, 6327.0], [28.5, 6352.0], [28.6, 6368.0], [28.7, 6426.0], [28.8, 6447.0], [28.9, 6477.0], [29.0, 6481.0], [29.1, 6498.0], [29.2, 6566.0], [29.3, 6589.0], [29.4, 6620.0], [29.5, 6631.0], [29.6, 6640.0], [29.7, 6645.0], [29.8, 6700.0], [29.9, 6725.0], [30.0, 6736.0], [30.1, 6747.0], [30.2, 6753.0], [30.3, 6764.0], [30.4, 6790.0], [30.5, 6793.0], [30.6, 6814.0], [30.7, 6821.0], [30.8, 6830.0], [30.9, 6842.0], [31.0, 6857.0], [31.1, 6897.0], [31.2, 6910.0], [31.3, 6916.0], [31.4, 6933.0], [31.5, 6949.0], [31.6, 6962.0], [31.7, 6985.0], [31.8, 7029.0], [31.9, 7040.0], [32.0, 7063.0], [32.1, 7072.0], [32.2, 7114.0], [32.3, 7149.0], [32.4, 7157.0], [32.5, 7166.0], [32.6, 7173.0], [32.7, 7224.0], [32.8, 7257.0], [32.9, 7275.0], [33.0, 7279.0], [33.1, 7284.0], [33.2, 7289.0], [33.3, 7297.0], [33.4, 7303.0], [33.5, 7322.0], [33.6, 7327.0], [33.7, 7345.0], [33.8, 7357.0], [33.9, 7380.0], [34.0, 7397.0], [34.1, 7423.0], [34.2, 7437.0], [34.3, 7442.0], [34.4, 7456.0], [34.5, 7472.0], [34.6, 7479.0], [34.7, 7492.0], [34.8, 7507.0], [34.9, 7530.0], [35.0, 7534.0], [35.1, 7549.0], [35.2, 7568.0], [35.3, 7576.0], [35.4, 7586.0], [35.5, 7607.0], [35.6, 7608.0], [35.7, 7615.0], [35.8, 7619.0], [35.9, 7626.0], [36.0, 7646.0], [36.1, 7656.0], [36.2, 7676.0], [36.3, 7700.0], [36.4, 7708.0], [36.5, 7726.0], [36.6, 7734.0], [36.7, 7745.0], [36.8, 7758.0], [36.9, 7762.0], [37.0, 7772.0], [37.1, 7777.0], [37.2, 7780.0], [37.3, 7786.0], [37.4, 7791.0], [37.5, 7800.0], [37.6, 7851.0], [37.7, 7877.0], [37.8, 7900.0], [37.9, 7908.0], [38.0, 7917.0], [38.1, 7925.0], [38.2, 7933.0], [38.3, 7940.0], [38.4, 7963.0], [38.5, 8017.0], [38.6, 8020.0], [38.7, 8031.0], [38.8, 8039.0], [38.9, 8053.0], [39.0, 8077.0], [39.1, 8114.0], [39.2, 8123.0], [39.3, 8124.0], [39.4, 8127.0], [39.5, 8135.0], [39.6, 8154.0], [39.7, 8155.0], [39.8, 8173.0], [39.9, 8176.0], [40.0, 8196.0], [40.1, 8198.0], [40.2, 8203.0], [40.3, 8213.0], [40.4, 8234.0], [40.5, 8250.0], [40.6, 8261.0], [40.7, 8289.0], [40.8, 8297.0], [40.9, 8308.0], [41.0, 8330.0], [41.1, 8335.0], [41.2, 8346.0], [41.3, 8361.0], [41.4, 8366.0], [41.5, 8388.0], [41.6, 8401.0], [41.7, 8410.0], [41.8, 8421.0], [41.9, 8425.0], [42.0, 8455.0], [42.1, 8461.0], [42.2, 8483.0], [42.3, 8486.0], [42.4, 8487.0], [42.5, 8492.0], [42.6, 8500.0], [42.7, 8503.0], [42.8, 8507.0], [42.9, 8519.0], [43.0, 8524.0], [43.1, 8529.0], [43.2, 8551.0], [43.3, 8560.0], [43.4, 8564.0], [43.5, 8589.0], [43.6, 8607.0], [43.7, 8616.0], [43.8, 8622.0], [43.9, 8624.0], [44.0, 8644.0], [44.1, 8650.0], [44.2, 8690.0], [44.3, 8707.0], [44.4, 8718.0], [44.5, 8729.0], [44.6, 8737.0], [44.7, 8746.0], [44.8, 8760.0], [44.9, 8774.0], [45.0, 8790.0], [45.1, 8802.0], [45.2, 8829.0], [45.3, 8840.0], [45.4, 8865.0], [45.5, 8888.0], [45.6, 8899.0], [45.7, 8931.0], [45.8, 8957.0], [45.9, 8961.0], [46.0, 8975.0], [46.1, 8988.0], [46.2, 9012.0], [46.3, 9036.0], [46.4, 9038.0], [46.5, 9068.0], [46.6, 9088.0], [46.7, 9116.0], [46.8, 9125.0], [46.9, 9146.0], [47.0, 9167.0], [47.1, 9176.0], [47.2, 9195.0], [47.3, 9199.0], [47.4, 9241.0], [47.5, 9260.0], [47.6, 9262.0], [47.7, 9292.0], [47.8, 9304.0], [47.9, 9312.0], [48.0, 9329.0], [48.1, 9340.0], [48.2, 9399.0], [48.3, 9415.0], [48.4, 9429.0], [48.5, 9455.0], [48.6, 9464.0], [48.7, 9477.0], [48.8, 9491.0], [48.9, 9503.0], [49.0, 9505.0], [49.1, 9509.0], [49.2, 9549.0], [49.3, 9554.0], [49.4, 9564.0], [49.5, 9573.0], [49.6, 9587.0], [49.7, 9592.0], [49.8, 9599.0], [49.9, 9615.0], [50.0, 9634.0], [50.1, 9641.0], [50.2, 9648.0], [50.3, 9659.0], [50.4, 9675.0], [50.5, 9696.0], [50.6, 9710.0], [50.7, 9734.0], [50.8, 9736.0], [50.9, 9737.0], [51.0, 9747.0], [51.1, 9766.0], [51.2, 9784.0], [51.3, 9789.0], [51.4, 9798.0], [51.5, 9804.0], [51.6, 9813.0], [51.7, 9833.0], [51.8, 9858.0], [51.9, 9873.0], [52.0, 9898.0], [52.1, 9929.0], [52.2, 9945.0], [52.3, 9953.0], [52.4, 9966.0], [52.5, 9974.0], [52.6, 9993.0], [52.7, 10001.0], [52.8, 10012.0], [52.9, 10022.0], [53.0, 10034.0], [53.1, 10063.0], [53.2, 10072.0], [53.3, 10079.0], [53.4, 10092.0], [53.5, 10098.0], [53.6, 10107.0], [53.7, 10113.0], [53.8, 10127.0], [53.9, 10149.0], [54.0, 10174.0], [54.1, 10189.0], [54.2, 10214.0], [54.3, 10219.0], [54.4, 10220.0], [54.5, 10247.0], [54.6, 10260.0], [54.7, 10273.0], [54.8, 10277.0], [54.9, 10301.0], [55.0, 10302.0], [55.1, 10323.0], [55.2, 10363.0], [55.3, 10372.0], [55.4, 10377.0], [55.5, 10398.0], [55.6, 10419.0], [55.7, 10425.0], [55.8, 10436.0], [55.9, 10447.0], [56.0, 10462.0], [56.1, 10467.0], [56.2, 10476.0], [56.3, 10495.0], [56.4, 10518.0], [56.5, 10549.0], [56.6, 10549.0], [56.7, 10565.0], [56.8, 10583.0], [56.9, 10626.0], [57.0, 10635.0], [57.1, 10652.0], [57.2, 10695.0], [57.3, 10696.0], [57.4, 10716.0], [57.5, 10724.0], [57.6, 10745.0], [57.7, 10770.0], [57.8, 10774.0], [57.9, 10814.0], [58.0, 10830.0], [58.1, 10848.0], [58.2, 10888.0], [58.3, 10898.0], [58.4, 10949.0], [58.5, 11015.0], [58.6, 11024.0], [58.7, 11084.0], [58.8, 11116.0], [58.9, 11151.0], [59.0, 11171.0], [59.1, 11231.0], [59.2, 11264.0], [59.3, 11286.0], [59.4, 11313.0], [59.5, 11324.0], [59.6, 11367.0], [59.7, 11377.0], [59.8, 11385.0], [59.9, 11395.0], [60.0, 11409.0], [60.1, 11418.0], [60.2, 11423.0], [60.3, 11431.0], [60.4, 11469.0], [60.5, 11494.0], [60.6, 11498.0], [60.7, 11524.0], [60.8, 11543.0], [60.9, 11553.0], [61.0, 11564.0], [61.1, 11592.0], [61.2, 11595.0], [61.3, 11596.0], [61.4, 11610.0], [61.5, 11618.0], [61.6, 11621.0], [61.7, 11624.0], [61.8, 11627.0], [61.9, 11633.0], [62.0, 11644.0], [62.1, 11650.0], [62.2, 11653.0], [62.3, 11658.0], [62.4, 11661.0], [62.5, 11667.0], [62.6, 11668.0], [62.7, 11670.0], [62.8, 11690.0], [62.9, 11697.0], [63.0, 11716.0], [63.1, 11743.0], [63.2, 11764.0], [63.3, 11770.0], [63.4, 11794.0], [63.5, 11806.0], [63.6, 11815.0], [63.7, 11820.0], [63.8, 11836.0], [63.9, 11850.0], [64.0, 11878.0], [64.1, 11890.0], [64.2, 11909.0], [64.3, 11925.0], [64.4, 11955.0], [64.5, 11973.0], [64.6, 11982.0], [64.7, 11986.0], [64.8, 11992.0], [64.9, 11994.0], [65.0, 12011.0], [65.1, 12022.0], [65.2, 12029.0], [65.3, 12029.0], [65.4, 12039.0], [65.5, 12044.0], [65.6, 12060.0], [65.7, 12081.0], [65.8, 12100.0], [65.9, 12109.0], [66.0, 12118.0], [66.1, 12137.0], [66.2, 12139.0], [66.3, 12151.0], [66.4, 12158.0], [66.5, 12169.0], [66.6, 12180.0], [66.7, 12211.0], [66.8, 12216.0], [66.9, 12219.0], [67.0, 12223.0], [67.1, 12251.0], [67.2, 12281.0], [67.3, 12286.0], [67.4, 12291.0], [67.5, 12299.0], [67.6, 12316.0], [67.7, 12325.0], [67.8, 12335.0], [67.9, 12344.0], [68.0, 12354.0], [68.1, 12366.0], [68.2, 12378.0], [68.3, 12394.0], [68.4, 12408.0], [68.5, 12412.0], [68.6, 12434.0], [68.7, 12438.0], [68.8, 12471.0], [68.9, 12480.0], [69.0, 12494.0], [69.1, 12502.0], [69.2, 12543.0], [69.3, 12559.0], [69.4, 12565.0], [69.5, 12568.0], [69.6, 12583.0], [69.7, 12588.0], [69.8, 12592.0], [69.9, 12607.0], [70.0, 12609.0], [70.1, 12620.0], [70.2, 12638.0], [70.3, 12645.0], [70.4, 12660.0], [70.5, 12671.0], [70.6, 12691.0], [70.7, 12704.0], [70.8, 12718.0], [70.9, 12723.0], [71.0, 12742.0], [71.1, 12748.0], [71.2, 12763.0], [71.3, 12781.0], [71.4, 12787.0], [71.5, 12803.0], [71.6, 12808.0], [71.7, 12816.0], [71.8, 12832.0], [71.9, 12850.0], [72.0, 12860.0], [72.1, 12864.0], [72.2, 12877.0], [72.3, 12894.0], [72.4, 12909.0], [72.5, 12911.0], [72.6, 12924.0], [72.7, 12934.0], [72.8, 12947.0], [72.9, 12958.0], [73.0, 12960.0], [73.1, 12965.0], [73.2, 12973.0], [73.3, 12978.0], [73.4, 13013.0], [73.5, 13030.0], [73.6, 13035.0], [73.7, 13041.0], [73.8, 13045.0], [73.9, 13057.0], [74.0, 13062.0], [74.1, 13083.0], [74.2, 13085.0], [74.3, 13090.0], [74.4, 13095.0], [74.5, 13109.0], [74.6, 13114.0], [74.7, 13118.0], [74.8, 13133.0], [74.9, 13140.0], [75.0, 13143.0], [75.1, 13146.0], [75.2, 13160.0], [75.3, 13164.0], [75.4, 13171.0], [75.5, 13193.0], [75.6, 13213.0], [75.7, 13219.0], [75.8, 13222.0], [75.9, 13234.0], [76.0, 13244.0], [76.1, 13249.0], [76.2, 13278.0], [76.3, 13309.0], [76.4, 13311.0], [76.5, 13345.0], [76.6, 13352.0], [76.7, 13360.0], [76.8, 13364.0], [76.9, 13368.0], [77.0, 13395.0], [77.1, 13401.0], [77.2, 13406.0], [77.3, 13413.0], [77.4, 13415.0], [77.5, 13420.0], [77.6, 13429.0], [77.7, 13431.0], [77.8, 13435.0], [77.9, 13443.0], [78.0, 13451.0], [78.1, 13453.0], [78.2, 13459.0], [78.3, 13465.0], [78.4, 13481.0], [78.5, 13484.0], [78.6, 13491.0], [78.7, 13498.0], [78.8, 13519.0], [78.9, 13524.0], [79.0, 13526.0], [79.1, 13534.0], [79.2, 13542.0], [79.3, 13542.0], [79.4, 13558.0], [79.5, 13571.0], [79.6, 13578.0], [79.7, 13589.0], [79.8, 13597.0], [79.9, 13600.0], [80.0, 13606.0], [80.1, 13618.0], [80.2, 13636.0], [80.3, 13642.0], [80.4, 13646.0], [80.5, 13667.0], [80.6, 13671.0], [80.7, 13675.0], [80.8, 13682.0], [80.9, 13692.0], [81.0, 13695.0], [81.1, 13705.0], [81.2, 13716.0], [81.3, 13734.0], [81.4, 13751.0], [81.5, 13766.0], [81.6, 13773.0], [81.7, 13779.0], [81.8, 13783.0], [81.9, 13786.0], [82.0, 13806.0], [82.1, 13808.0], [82.2, 13826.0], [82.3, 13834.0], [82.4, 13855.0], [82.5, 13870.0], [82.6, 13874.0], [82.7, 13880.0], [82.8, 13886.0], [82.9, 13893.0], [83.0, 13894.0], [83.1, 13897.0], [83.2, 13902.0], [83.3, 13904.0], [83.4, 13913.0], [83.5, 13928.0], [83.6, 13938.0], [83.7, 13943.0], [83.8, 13945.0], [83.9, 13956.0], [84.0, 13964.0], [84.1, 13967.0], [84.2, 13972.0], [84.3, 13985.0], [84.4, 13992.0], [84.5, 13993.0], [84.6, 14001.0], [84.7, 14010.0], [84.8, 14014.0], [84.9, 14023.0], [85.0, 14035.0], [85.1, 14041.0], [85.2, 14047.0], [85.3, 14054.0], [85.4, 14067.0], [85.5, 14073.0], [85.6, 14074.0], [85.7, 14088.0], [85.8, 14095.0], [85.9, 14101.0], [86.0, 14110.0], [86.1, 14120.0], [86.2, 14122.0], [86.3, 14147.0], [86.4, 14155.0], [86.5, 14175.0], [86.6, 14181.0], [86.7, 14193.0], [86.8, 14197.0], [86.9, 14205.0], [87.0, 14223.0], [87.1, 14235.0], [87.2, 14242.0], [87.3, 14248.0], [87.4, 14253.0], [87.5, 14260.0], [87.6, 14267.0], [87.7, 14277.0], [87.8, 14278.0], [87.9, 14281.0], [88.0, 14282.0], [88.1, 14289.0], [88.2, 14291.0], [88.3, 14297.0], [88.4, 14303.0], [88.5, 14305.0], [88.6, 14310.0], [88.7, 14310.0], [88.8, 14328.0], [88.9, 14331.0], [89.0, 14336.0], [89.1, 14341.0], [89.2, 14352.0], [89.3, 14359.0], [89.4, 14367.0], [89.5, 14379.0], [89.6, 14380.0], [89.7, 14390.0], [89.8, 14403.0], [89.9, 14405.0], [90.0, 14418.0], [90.1, 14426.0], [90.2, 14433.0], [90.3, 14436.0], [90.4, 14439.0], [90.5, 14444.0], [90.6, 14449.0], [90.7, 14457.0], [90.8, 14463.0], [90.9, 14475.0], [91.0, 14476.0], [91.1, 14481.0], [91.2, 14482.0], [91.3, 14488.0], [91.4, 14497.0], [91.5, 14512.0], [91.6, 14523.0], [91.7, 14533.0], [91.8, 14538.0], [91.9, 14544.0], [92.0, 14551.0], [92.1, 14565.0], [92.2, 14570.0], [92.3, 14578.0], [92.4, 14585.0], [92.5, 14591.0], [92.6, 14593.0], [92.7, 14612.0], [92.8, 14617.0], [92.9, 14619.0], [93.0, 14625.0], [93.1, 14639.0], [93.2, 14642.0], [93.3, 14643.0], [93.4, 14655.0], [93.5, 14658.0], [93.6, 14661.0], [93.7, 14672.0], [93.8, 14689.0], [93.9, 14700.0], [94.0, 14712.0], [94.1, 14732.0], [94.2, 14741.0], [94.3, 14746.0], [94.4, 14755.0], [94.5, 14756.0], [94.6, 14764.0], [94.7, 14772.0], [94.8, 14778.0], [94.9, 14789.0], [95.0, 14803.0], [95.1, 14818.0], [95.2, 14833.0], [95.3, 14838.0], [95.4, 14844.0], [95.5, 14864.0], [95.6, 14868.0], [95.7, 14876.0], [95.8, 14886.0], [95.9, 14889.0], [96.0, 14892.0], [96.1, 14905.0], [96.2, 14912.0], [96.3, 14940.0], [96.4, 14946.0], [96.5, 14950.0], [96.6, 14961.0], [96.7, 14975.0], [96.8, 15003.0], [96.9, 15009.0], [97.0, 15023.0], [97.1, 15035.0], [97.2, 15045.0], [97.3, 15058.0], [97.4, 15072.0], [97.5, 15095.0], [97.6, 15114.0], [97.7, 15122.0], [97.8, 15128.0], [97.9, 15138.0], [98.0, 15174.0], [98.1, 15198.0], [98.2, 15208.0], [98.3, 15213.0], [98.4, 15216.0], [98.5, 15253.0], [98.6, 15259.0], [98.7, 15265.0], [98.8, 15270.0], [98.9, 15311.0], [99.0, 15316.0], [99.1, 15340.0], [99.2, 15354.0], [99.3, 15364.0], [99.4, 15403.0], [99.5, 15435.0], [99.6, 15450.0], [99.7, 15476.0], [99.8, 15506.0], [99.9, 15526.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 400.0, "maxY": 34.0, "series": [{"data": [[400.0, 1.0], [500.0, 5.0], [600.0, 4.0], [700.0, 5.0], [800.0, 7.0], [900.0, 4.0], [1000.0, 6.0], [1100.0, 9.0], [1200.0, 7.0], [1300.0, 8.0], [1400.0, 2.0], [1500.0, 2.0], [1600.0, 2.0], [2100.0, 1.0], [2400.0, 6.0], [2500.0, 3.0], [2600.0, 6.0], [2800.0, 7.0], [2700.0, 1.0], [2900.0, 3.0], [3000.0, 2.0], [3100.0, 2.0], [3200.0, 4.0], [3300.0, 2.0], [3400.0, 10.0], [3500.0, 13.0], [3700.0, 12.0], [3600.0, 10.0], [3800.0, 9.0], [3900.0, 19.0], [4000.0, 13.0], [4100.0, 16.0], [4200.0, 24.0], [4300.0, 16.0], [4400.0, 22.0], [4500.0, 19.0], [4600.0, 16.0], [4800.0, 23.0], [4700.0, 18.0], [4900.0, 20.0], [5100.0, 27.0], [5000.0, 30.0], [5200.0, 21.0], [5300.0, 22.0], [5400.0, 21.0], [5500.0, 13.0], [5600.0, 14.0], [5800.0, 11.0], [5700.0, 10.0], [5900.0, 10.0], [6100.0, 12.0], [6000.0, 10.0], [6200.0, 7.0], [6300.0, 5.0], [6600.0, 8.0], [6400.0, 10.0], [6500.0, 5.0], [6700.0, 15.0], [6800.0, 12.0], [6900.0, 12.0], [7000.0, 9.0], [7100.0, 10.0], [7300.0, 14.0], [7200.0, 13.0], [7400.0, 14.0], [7500.0, 15.0], [7600.0, 16.0], [7900.0, 14.0], [7800.0, 7.0], [7700.0, 24.0], [8100.0, 23.0], [8000.0, 11.0], [8300.0, 15.0], [8200.0, 13.0], [8600.0, 14.0], [8400.0, 20.0], [8500.0, 19.0], [8700.0, 16.0], [8800.0, 12.0], [8900.0, 10.0], [9000.0, 10.0], [9100.0, 14.0], [9200.0, 9.0], [9300.0, 10.0], [9400.0, 12.0], [9500.0, 19.0], [9700.0, 19.0], [9600.0, 14.0], [9800.0, 11.0], [9900.0, 13.0], [10000.0, 18.0], [10100.0, 11.0], [10200.0, 15.0], [10400.0, 16.0], [10300.0, 13.0], [10700.0, 10.0], [10500.0, 10.0], [10600.0, 10.0], [10800.0, 10.0], [11100.0, 6.0], [11000.0, 6.0], [10900.0, 3.0], [11200.0, 6.0], [11500.0, 15.0], [11300.0, 12.0], [11600.0, 32.0], [11400.0, 13.0], [11700.0, 10.0], [12100.0, 18.0], [11800.0, 13.0], [11900.0, 16.0], [12000.0, 17.0], [12200.0, 17.0], [12700.0, 17.0], [12300.0, 17.0], [12500.0, 17.0], [12400.0, 13.0], [12600.0, 15.0], [13100.0, 21.0], [12900.0, 20.0], [12800.0, 18.0], [13000.0, 22.0], [13300.0, 16.0], [13200.0, 14.0], [13400.0, 34.0], [13500.0, 22.0], [13800.0, 25.0], [13600.0, 25.0], [13700.0, 17.0], [13900.0, 28.0], [14000.0, 26.0], [14300.0, 29.0], [14100.0, 20.0], [14200.0, 29.0], [14400.0, 33.0], [14500.0, 24.0], [14700.0, 22.0], [14800.0, 22.0], [14600.0, 25.0], [14900.0, 14.0], [15100.0, 12.0], [15000.0, 16.0], [15200.0, 14.0], [15300.0, 10.0], [15400.0, 8.0], [15500.0, 4.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 15500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1942.0, "series": [{"data": [[1.0, 57.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1942.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 870.021999999997, "minX": 1.5495837E12, "maxY": 870.021999999997, "series": [{"data": [[1.5495837E12, 870.021999999997]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495837E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 612.0, "minX": 1.0, "maxY": 15553.0, "series": [{"data": [[2.0, 14565.0], [3.0, 14378.0], [4.0, 14643.0], [6.0, 15345.0], [7.0, 14390.0], [8.0, 14964.5], [9.0, 14276.0], [10.0, 14482.0], [11.0, 15340.0], [12.0, 14335.0], [13.0, 14403.0], [14.0, 15208.0], [15.0, 14439.0], [16.0, 14943.0], [17.0, 14663.0], [18.0, 14476.0], [19.0, 14277.0], [20.0, 15506.0], [21.0, 14926.0], [22.0, 15213.0], [23.0, 14444.0], [24.0, 14242.0], [25.0, 15114.0], [26.0, 14548.0], [27.0, 14741.0], [28.0, 15259.0], [29.0, 15395.0], [30.0, 15403.0], [31.0, 15553.0], [33.0, 15209.0], [32.0, 14661.0], [35.0, 14612.0], [34.0, 14732.0], [37.0, 14497.0], [36.0, 14864.0], [39.0, 15441.0], [38.0, 14592.0], [41.0, 14379.0], [40.0, 15311.0], [42.0, 15259.0], [45.0, 14591.0], [44.0, 14930.0], [47.0, 14304.0], [46.0, 14481.0], [49.0, 15051.0], [48.0, 14756.0], [51.0, 14246.0], [50.0, 14617.0], [53.0, 14555.0], [52.0, 15327.0], [55.0, 14484.0], [54.0, 14940.0], [57.0, 15193.5], [59.0, 15253.0], [58.0, 14248.0], [61.0, 15450.0], [60.0, 15193.0], [63.0, 14746.0], [62.0, 14908.0], [67.0, 15364.0], [66.0, 14712.0], [65.0, 14431.0], [64.0, 14875.0], [71.0, 15140.5], [69.0, 14514.0], [68.0, 14658.0], [75.0, 14912.0], [74.0, 14405.0], [73.0, 15316.0], [72.0, 15199.0], [79.0, 14625.0], [78.0, 14433.0], [77.0, 15128.0], [76.0, 14220.0], [83.0, 14833.0], [82.0, 15492.0], [81.0, 14787.0], [80.0, 14739.0], [87.0, 14181.0], [86.0, 15265.0], [85.0, 14310.0], [84.0, 14291.0], [91.0, 14949.0], [90.0, 14418.0], [89.0, 14260.0], [88.0, 14328.0], [95.0, 14110.0], [94.0, 15122.0], [93.0, 15009.0], [92.0, 14154.0], [99.0, 15127.0], [98.0, 15089.0], [97.0, 14108.0], [96.0, 14436.0], [103.0, 15359.0], [102.0, 15020.0], [101.0, 14289.0], [100.0, 14844.0], [107.0, 15297.0], [106.0, 14689.0], [105.0, 14714.0], [104.0, 14865.0], [111.0, 15011.0], [109.0, 14223.0], [108.0, 15008.0], [115.0, 7629.0], [114.0, 14577.0], [113.0, 15003.0], [112.0, 15265.0], [119.0, 7733.5], [118.0, 14641.0], [117.0, 15419.0], [116.0, 15354.0], [123.0, 14282.0], [122.0, 14773.0], [121.0, 14773.5], [127.0, 14700.0], [126.0, 15064.0], [125.0, 14649.0], [124.0, 14580.0], [128.0, 7947.5], [132.0, 9837.666666666666], [131.0, 612.0], [135.0, 14790.0], [134.0, 14570.0], [133.0, 14889.0], [130.0, 14803.0], [129.0, 14457.0], [138.0, 5322.666666666667], [143.0, 14381.0], [142.0, 14828.0], [141.0, 15095.0], [140.0, 14434.0], [139.0, 14054.0], [137.0, 14639.0], [136.0, 14463.0], [144.0, 7559.0], [151.0, 15143.0], [150.0, 13993.0], [149.0, 14047.0], [148.0, 14672.0], [147.0, 15137.0], [146.0, 15267.0], [145.0, 14586.0], [152.0, 7952.5], [156.0, 7816.5], [159.0, 14593.0], [158.0, 14438.0], [157.0, 14173.0], [155.0, 14755.0], [154.0, 15035.0], [153.0, 14691.0], [161.0, 8109.0], [167.0, 14578.0], [166.0, 14352.0], [165.0, 14512.0], [164.0, 13985.0], [163.0, 14013.0], [162.0, 14349.0], [160.0, 15058.0], [175.0, 7772.0], [174.0, 15035.0], [173.0, 14232.0], [172.0, 14659.0], [171.0, 13992.0], [170.0, 14445.0], [169.0, 14585.0], [168.0, 14891.0], [183.0, 13886.0], [182.0, 15099.0], [181.0, 14310.0], [180.0, 14961.0], [179.0, 14022.0], [178.0, 15038.0], [177.0, 14789.0], [176.0, 14041.0], [187.0, 5589.333333333333], [190.0, 7507.0], [191.0, 14892.0], [189.0, 13880.0], [188.0, 15045.0], [186.0, 14818.0], [185.0, 14455.0], [184.0, 14120.0], [198.0, 7748.0], [197.0, 9622.666666666666], [199.0, 13897.0], [195.0, 14642.0], [194.0, 13893.0], [193.0, 13953.0], [192.0, 15174.0], [202.0, 7690.0], [207.0, 15215.0], [206.0, 14122.0], [205.0, 14367.0], [204.0, 14014.0], [203.0, 14708.0], [201.0, 14068.0], [200.0, 13956.0], [213.0, 5185.0], [215.0, 13778.0], [214.0, 14464.0], [212.0, 14501.0], [211.0, 14969.0], [210.0, 13827.0], [209.0, 14656.0], [208.0, 14074.0], [222.0, 5563.333333333333], [223.0, 14476.0], [221.0, 13894.0], [220.0, 14310.0], [219.0, 13917.0], [218.0, 13897.0], [217.0, 14267.0], [216.0, 15198.0], [224.0, 7704.0], [231.0, 7503.0], [230.0, 14074.0], [229.0, 14523.0], [228.0, 14147.0], [227.0, 14613.0], [226.0, 13766.0], [225.0, 14175.0], [236.0, 7966.0], [238.0, 7902.0], [239.0, 14023.0], [237.0, 14887.0], [235.0, 14687.5], [233.0, 13957.0], [232.0, 14742.0], [246.0, 5228.0], [247.0, 14088.0], [245.0, 14685.0], [244.0, 13672.0], [243.0, 14379.0], [242.0, 13966.0], [241.0, 14604.0], [240.0, 14282.0], [249.0, 9689.666666666666], [255.0, 5331.666666666667], [254.0, 14205.0], [253.0, 14475.0], [252.0, 13773.0], [251.0, 13608.0], [250.0, 14886.0], [271.0, 14426.0], [256.0, 7357.0], [258.0, 7486.5], [257.0, 14197.0], [259.0, 14073.0], [261.0, 7600.0], [260.0, 13783.0], [263.0, 13737.0], [262.0, 13855.0], [266.0, 8001.0], [270.0, 13904.0], [269.0, 14043.0], [267.0, 14111.0], [265.0, 14993.0], [264.0, 13751.0], [286.0, 13996.0], [278.0, 7743.0], [277.0, 14544.0], [276.0, 14280.0], [279.0, 13938.0], [273.0, 13696.0], [272.0, 14444.0], [275.0, 14354.0], [274.0, 13678.0], [287.0, 14538.0], [285.0, 13435.0], [284.0, 14257.0], [283.0, 15023.0], [282.0, 13964.0], [281.0, 14365.0], [280.0, 14842.0], [300.0, 7370.0], [290.0, 5477.666666666667], [291.0, 14764.0], [289.0, 7817.5], [292.0, 7764.0], [293.0, 14297.0], [295.0, 7424.5], [288.0, 14041.0], [294.0, 14289.0], [299.0, 7627.5], [298.0, 13826.0], [297.0, 14339.0], [296.0, 14155.0], [303.0, 14341.0], [302.0, 13636.0], [301.0, 13902.0], [318.0, 14238.0], [305.0, 5631.0], [309.0, 7548.0], [308.0, 14636.0], [311.0, 15138.0], [304.0, 13967.0], [310.0, 13597.0], [317.0, 7516.5], [319.0, 13821.0], [316.0, 14328.0], [307.0, 13671.0], [306.0, 14772.0], [315.0, 13734.0], [314.0, 14778.0], [313.0, 13406.0], [312.0, 13779.0], [334.0, 13541.0], [320.0, 5653.0], [321.0, 13413.0], [323.0, 13936.0], [322.0, 13571.0], [327.0, 13542.0], [326.0, 13645.0], [325.0, 13497.0], [324.0, 13692.0], [335.0, 7269.0], [333.0, 14535.0], [332.0, 14006.0], [331.0, 14132.0], [330.0, 13542.0], [329.0, 13834.0], [328.0, 13430.0], [350.0, 13090.0], [337.0, 7819.0], [340.0, 7893.5], [341.0, 13301.0], [343.0, 13118.0], [336.0, 14265.0], [342.0, 14624.0], [351.0, 14248.0], [349.0, 13109.0], [348.0, 14061.0], [339.0, 14198.0], [338.0, 14551.0], [347.0, 14309.0], [346.0, 13972.0], [345.0, 13444.0], [344.0, 14876.0], [367.0, 13671.0], [362.0, 8118.0], [366.0, 13600.0], [365.0, 13352.0], [364.0, 13401.0], [355.0, 14905.0], [354.0, 13574.0], [353.0, 13893.0], [352.0, 14293.0], [363.0, 13222.0], [361.0, 13429.0], [360.0, 14655.0], [359.0, 13122.0], [358.0, 13630.0], [357.0, 14044.0], [356.0, 14035.0], [382.0, 12978.0], [377.0, 7369.0], [371.0, 7856.5], [370.0, 12986.0], [369.0, 14488.0], [368.0, 13716.0], [375.0, 13164.0], [374.0, 14495.0], [373.0, 14090.0], [372.0, 14180.0], [378.0, 7606.5], [383.0, 13061.0], [381.0, 14755.0], [380.0, 13928.0], [379.0, 13856.0], [376.0, 14278.0], [398.0, 14359.0], [385.0, 7419.0], [384.0, 13395.0], [387.0, 13052.0], [386.0, 14301.0], [391.0, 13249.0], [390.0, 13484.0], [389.0, 13501.0], [388.0, 13524.0], [399.0, 7891.5], [397.0, 12743.0], [396.0, 13649.0], [395.0, 14001.0], [394.0, 13785.0], [393.0, 14024.0], [392.0, 14101.0], [413.0, 13360.0], [415.0, 13853.0], [409.0, 9548.666666666666], [414.0, 13013.0], [412.0, 14120.0], [403.0, 13945.0], [402.0, 14235.0], [401.0, 14253.0], [400.0, 14380.0], [411.0, 13806.0], [410.0, 13667.0], [407.0, 13403.0], [406.0, 13887.0], [405.0, 14193.0], [404.0, 13768.0], [431.0, 14095.0], [419.0, 7731.5], [423.0, 13483.0], [416.0, 12959.0], [418.0, 14305.0], [417.0, 13709.0], [422.0, 13705.0], [421.0, 13695.0], [420.0, 13217.0], [427.0, 7780.0], [430.0, 13311.0], [429.0, 13062.0], [428.0, 13171.0], [426.0, 13498.0], [425.0, 13451.0], [424.0, 13213.0], [447.0, 13382.5], [441.0, 7665.0], [445.0, 12608.0], [444.0, 14570.0], [443.0, 13085.0], [442.0, 13717.0], [440.0, 13692.0], [439.0, 13606.0], [433.0, 13145.0], [432.0, 14082.0], [435.0, 12860.0], [434.0, 12808.0], [438.0, 12573.0], [437.0, 13481.0], [436.0, 13519.0], [462.0, 13758.0], [463.0, 13236.0], [461.0, 12723.0], [460.0, 13682.0], [459.0, 12436.0], [458.0, 13486.0], [457.0, 13453.0], [456.0, 12781.0], [455.0, 13020.0], [451.0, 13510.5], [449.0, 13589.0], [454.0, 13099.0], [453.0, 13693.0], [452.0, 13462.0], [478.0, 12412.0], [479.0, 12748.0], [477.0, 13368.0], [476.0, 13455.0], [475.0, 12543.0], [474.0, 13310.0], [473.0, 13527.0], [472.0, 12949.0], [471.0, 13413.0], [465.0, 13451.0], [464.0, 13095.0], [467.0, 13152.0], [466.0, 13582.0], [470.0, 13415.0], [469.0, 13420.0], [468.0, 13038.0], [494.0, 13780.0], [495.0, 12921.0], [493.0, 13139.0], [492.0, 14010.0], [491.0, 13491.0], [490.0, 14421.0], [489.0, 13389.0], [488.0, 12316.0], [487.0, 13526.0], [481.0, 12852.0], [480.0, 12973.0], [483.0, 13309.0], [482.0, 13366.0], [486.0, 13534.0], [485.0, 13219.0], [484.0, 13639.0], [510.0, 13227.0], [511.0, 12977.0], [509.0, 13808.0], [508.0, 13031.0], [507.0, 13604.0], [506.0, 12947.0], [505.0, 12763.0], [504.0, 13193.0], [503.0, 13443.0], [496.0, 13109.0], [499.0, 13607.5], [497.0, 13420.0], [502.0, 13249.0], [501.0, 12638.0], [500.0, 12931.0], [540.0, 12568.0], [528.0, 12299.0], [530.0, 13525.0], [532.0, 12786.0], [542.0, 13143.0], [538.0, 12965.0], [536.0, 12739.0], [512.0, 13401.0], [514.0, 13361.0], [516.0, 13044.0], [518.0, 13117.0], [526.0, 13786.0], [524.0, 12787.0], [522.0, 12909.0], [520.0, 12891.0], [534.0, 12722.0], [572.0, 13234.0], [560.0, 12958.0], [562.0, 13642.0], [564.0, 12877.0], [574.0, 12718.0], [570.0, 13035.0], [568.0, 12806.0], [544.0, 13542.0], [546.0, 12470.0], [548.0, 12434.0], [550.0, 12643.0], [558.0, 13045.0], [556.0, 12803.0], [554.0, 13164.0], [552.0, 12799.0], [566.0, 13278.0], [604.0, 12412.0], [592.0, 12909.0], [594.0, 13349.0], [596.0, 12219.0], [606.0, 12934.0], [602.0, 12659.0], [600.0, 12394.0], [576.0, 12588.0], [578.0, 12816.0], [580.0, 13410.0], [582.0, 12592.0], [590.0, 12378.0], [588.0, 13207.0], [586.0, 12592.0], [584.0, 12781.0], [598.0, 13041.0], [610.0, 12223.0], [638.0, 12365.0], [624.0, 12251.0], [634.0, 12112.0], [608.0, 12344.0], [612.0, 12286.0], [614.0, 13086.0], [622.0, 11980.0], [620.0, 12559.0], [618.0, 12503.0], [616.0, 12610.0], [630.0, 12376.0], [628.0, 12781.0], [668.0, 12471.0], [670.0, 12323.5], [656.0, 11992.0], [658.0, 11850.0], [660.0, 12289.0], [666.0, 11993.0], [664.0, 12118.0], [646.0, 12681.0], [644.0, 12660.0], [642.0, 12335.0], [640.0, 12939.0], [654.0, 11878.0], [652.0, 12645.0], [650.0, 12118.0], [648.0, 12040.0], [662.0, 11822.0], [700.0, 11875.0], [688.0, 12502.0], [690.0, 12012.0], [692.0, 12024.0], [702.0, 11794.0], [698.0, 12310.0], [696.0, 11377.0], [672.0, 12354.0], [674.0, 12060.0], [676.0, 12471.0], [678.0, 12101.0], [686.0, 11696.0], [682.0, 12173.0], [680.0, 12169.0], [694.0, 12044.0], [706.0, 7083.0], [732.0, 11667.0], [704.0, 12180.0], [708.0, 12009.0], [710.0, 12100.0], [716.0, 6895.5], [714.0, 11836.0], [712.0, 11925.0], [718.0, 11795.0], [720.0, 11619.0], [722.0, 11592.0], [724.0, 12160.0], [726.0, 11760.0], [734.0, 11421.0], [730.0, 11986.0], [728.0, 11890.0], [738.0, 7072.0], [760.0, 11383.0], [764.0, 7074.5], [736.0, 11806.0], [740.0, 13545.0], [742.0, 12139.0], [750.0, 11986.0], [748.0, 11313.0], [746.0, 11367.0], [744.0, 11973.0], [758.0, 7068.5], [766.0, 7135.0], [756.0, 11431.0], [754.0, 11627.0], [752.0, 12011.0], [762.0, 11764.0], [768.0, 11498.0], [796.0, 11660.0], [778.0, 7030.5], [776.0, 11543.0], [780.0, 11024.0], [770.0, 11555.0], [772.0, 11159.0], [774.0, 11531.0], [782.0, 11332.0], [784.0, 7315.5], [786.0, 11716.0], [788.0, 11658.0], [790.0, 11480.0], [792.0, 7076.5], [794.0, 11653.0], [828.0, 10696.0], [816.0, 11621.0], [818.0, 10832.0], [820.0, 10814.0], [830.0, 10716.0], [826.0, 10652.0], [824.0, 10323.0], [800.0, 11670.0], [802.0, 11564.0], [804.0, 11385.0], [806.0, 10676.0], [812.0, 11151.0], [810.0, 13431.0], [808.0, 11425.0], [822.0, 10774.0], [832.0, 11297.0], [860.0, 11018.0], [842.0, 6786.5], [840.0, 10022.0], [844.0, 11171.0], [834.0, 10629.0], [836.0, 10442.0], [846.0, 10493.0], [862.0, 6677.0], [848.0, 9506.0], [850.0, 10476.0], [852.0, 10419.0], [854.0, 10425.0], [858.0, 10359.0], [856.0, 10012.0], [838.0, 10549.0], [870.0, 10288.0], [878.0, 6594.5], [876.0, 10127.0], [874.0, 10248.0], [872.0, 10260.0], [888.0, 11590.0], [868.0, 10302.0], [864.0, 9995.0], [880.0, 9549.0], [882.0, 10188.0], [884.0, 9826.0], [886.0, 11646.0], [894.0, 10034.0], [892.0, 10089.0], [890.0, 10068.0], [898.0, 9929.0], [922.0, 9399.0], [926.0, 10436.0], [896.0, 6445.0], [900.0, 9966.0], [902.0, 11524.0], [920.0, 9423.0], [910.0, 6257.5], [908.0, 9484.0], [906.0, 10745.0], [904.0, 9737.0], [914.0, 6311.0], [916.0, 8801.0], [918.0, 9736.0], [912.0, 9799.0], [924.0, 11186.0], [928.0, 9683.0], [936.0, 6667.0], [938.0, 9583.0], [940.0, 9516.0], [930.0, 9639.0], [932.0, 9634.0], [934.0, 8619.0], [942.0, 9554.0], [950.0, 5827.5], [948.0, 9477.0], [946.0, 10888.0], [944.0, 9340.0], [958.0, 10773.0], [956.0, 9415.0], [954.0, 10909.0], [952.0, 10898.0], [960.0, 10027.0], [970.0, 7302.5], [968.0, 8330.0], [974.0, 7394.0], [962.0, 10724.0], [978.0, 5985.333333333334], [980.0, 10583.0], [982.0, 9675.0], [976.0, 6391.5], [990.0, 10001.0], [988.0, 9055.0], [986.0, 9088.0], [984.0, 9648.0], [966.0, 10727.0], [964.0, 10138.0], [994.0, 6978.5], [1020.0, 9656.0], [992.0, 9037.0], [996.0, 10626.0], [998.0, 10467.0], [1006.0, 10508.0], [1016.0, 10247.0], [1004.0, 6178.5], [1002.0, 8888.0], [1000.0, 10405.0], [1008.0, 10447.0], [1010.0, 9499.0], [1012.0, 9573.0], [1014.0, 10189.0], [1022.0, 8616.0], [1018.0, 10450.0], [1032.0, 8551.0], [1028.0, 6728.5], [1036.0, 9741.0], [1072.0, 9764.0], [1076.0, 9673.0], [1080.0, 9146.0], [1048.0, 5968.5], [1040.0, 9199.0], [1052.0, 9244.0], [1024.0, 8589.0], [1084.0, 5302.333333333333], [1056.0, 9966.0], [1060.0, 5964.0], [1064.0, 8198.0], [1068.0, 9726.0], [1100.0, 8523.0], [1096.0, 8771.0], [1092.0, 8961.0], [1088.0, 9587.0], [1136.0, 9390.0], [1140.0, 8507.0], [1144.0, 7507.0], [1120.0, 9589.0], [1148.0, 8502.0], [1104.0, 5878.5], [1108.0, 8703.0], [1112.0, 8650.0], [1116.0, 9329.0], [1124.0, 9784.0], [1128.0, 5390.333333333334], [1132.0, 6482.0], [1164.0, 5913.5], [1156.0, 8261.0], [1152.0, 8487.0], [1160.0, 8020.0], [1180.0, 5943.0], [1184.0, 8311.0], [1188.0, 7826.0], [1212.0, 8234.0], [1208.0, 8707.0], [1200.0, 8373.0], [1204.0, 6172.5], [1192.0, 8742.0], [1196.0, 8505.0], [1168.0, 8388.0], [1176.0, 5687.0], [1172.0, 8335.0], [1220.0, 8114.0], [1216.0, 5181.666666666667], [1224.0, 6303.5], [1228.0, 8450.0], [1232.0, 8425.0], [1240.0, 5918.5], [1236.0, 7758.0], [1244.0, 5938.5], [1260.0, 7649.0], [1256.0, 7334.0], [1248.0, 7708.0], [1252.0, 8529.0], [1276.0, 6247.5], [1272.0, 5116.333333333333], [1268.0, 7656.0], [1264.0, 5934.5], [1336.0, 7917.0], [1288.0, 6042.0], [1284.0, 5499.5], [1280.0, 7791.0], [1308.0, 5928.5], [1316.0, 7324.5], [1312.0, 7287.0], [1340.0, 5757.0], [1328.0, 7327.0], [1292.0, 6916.0], [1332.0, 6174.5], [1320.0, 5659.0], [1324.0, 7029.0], [1300.0, 5637.0], [1296.0, 7530.0], [1304.0, 6100.5], [1348.0, 6539.333333333333], [1352.0, 6759.0], [1344.0, 6725.0], [1372.0, 6793.0], [1368.0, 5636.5], [1364.0, 6828.0], [1356.0, 5929.0], [1360.0, 4897.8], [1376.0, 6769.0], [1396.0, 6279.0], [1392.0, 6640.0], [1400.0, 7544.0], [1404.0, 5428.333333333333], [1388.0, 4631.0], [1384.0, 6949.0], [1380.0, 5858.0], [1456.0, 5992.0], [1420.0, 5011.5], [1416.0, 6433.0], [1412.0, 6589.0], [1408.0, 8155.0], [1436.0, 5403.0], [1464.0, 6498.0], [1440.0, 5324.0], [1468.0, 5324.5], [1460.0, 4881.666666666667], [1448.0, 5965.0], [1452.0, 6084.0], [1444.0, 5318.5], [1424.0, 4604.5], [1428.0, 5066.666666666667], [1432.0, 5348.5], [1476.0, 5780.0], [1472.0, 5877.5], [1500.0, 5135.0], [1496.0, 5434.0], [1480.0, 5038.0], [1484.0, 6145.0], [1504.0, 5289.0], [1532.0, 5057.0], [1528.0, 4904.833333333334], [1524.0, 5248.0], [1520.0, 5342.0], [1512.0, 4760.333333333333], [1516.0, 6155.0], [1508.0, 5034.5], [1488.0, 5350.0], [1492.0, 5496.0], [1544.0, 5053.0], [1540.0, 4364.666666666667], [1536.0, 5789.5], [1564.0, 4949.666666666667], [1560.0, 5223.0], [1556.0, 5705.0], [1548.0, 5336.0], [1568.0, 5299.0], [1572.0, 5079.25], [1576.0, 4922.0], [1580.0, 5374.75], [1552.0, 5102.0], [1033.0, 9111.0], [1029.0, 10427.0], [1037.0, 8470.0], [1073.0, 8123.0], [1077.0, 9038.0], [1081.0, 8861.0], [1045.0, 9111.5], [1049.0, 9491.0], [1053.0, 7367.0], [1025.0, 10462.0], [1057.0, 10054.0], [1061.0, 9737.0], [1065.0, 8982.0], [1069.0, 8162.0], [1085.0, 8840.0], [1101.0, 8563.0], [1097.0, 6489.0], [1093.0, 9116.0], [1089.0, 9292.0], [1137.0, 9298.0], [1141.0, 8622.0], [1145.0, 8196.0], [1121.0, 9659.0], [1149.0, 8031.0], [1105.0, 6706.5], [1109.0, 5134.0], [1113.0, 7760.0], [1117.0, 8484.0], [1125.0, 8624.0], [1129.0, 3643.0], [1133.0, 7586.0], [1165.0, 8058.0], [1161.0, 5872.0], [1157.0, 8297.0], [1153.0, 8205.0], [1181.0, 4224.0], [1185.0, 5509.333333333333], [1213.0, 8487.0], [1209.0, 8495.0], [1205.0, 8746.0], [1201.0, 6571.0], [1189.0, 6644.5], [1193.0, 7925.0], [1197.0, 8352.0], [1169.0, 6056.5], [1173.0, 8503.0], [1177.0, 8831.0], [1221.0, 7743.0], [1217.0, 7877.0], [1225.0, 7862.0], [1229.0, 8725.0], [1233.0, 5833.5], [1237.0, 8519.0], [1241.0, 7313.0], [1245.0, 7608.0], [1253.0, 6362.5], [1261.0, 8622.0], [1257.0, 7442.0], [1249.0, 8248.0], [1277.0, 4209.0], [1273.0, 5786.0], [1269.0, 5910.0], [1265.0, 7708.0], [1333.0, 4825.5], [1305.0, 5381.0], [1281.0, 7276.0], [1285.0, 7749.0], [1309.0, 7411.0], [1317.0, 5266.0], [1313.0, 7063.0], [1341.0, 7094.0], [1337.0, 5475.0], [1329.0, 5526.5], [1293.0, 7349.0], [1289.0, 7072.0], [1321.0, 7040.0], [1325.0, 5294.5], [1297.0, 6974.0], [1301.0, 6437.0], [1349.0, 5577.5], [1353.0, 7734.0], [1345.0, 7508.0], [1373.0, 6962.0], [1365.0, 7479.0], [1369.0, 6790.0], [1357.0, 5087.5], [1377.0, 5834.5], [1405.0, 6061.0], [1397.0, 7257.0], [1393.0, 6566.0], [1401.0, 7800.0], [1381.0, 5848.0], [1385.0, 7472.0], [1389.0, 5204.0], [1361.0, 5286.333333333333], [1457.0, 5719.0], [1421.0, 5765.0], [1417.0, 7157.0], [1413.0, 6364.0], [1409.0, 7501.0], [1437.0, 5651.5], [1461.0, 4845.333333333333], [1465.0, 5297.5], [1469.0, 4801.5], [1441.0, 4997.0], [1445.0, 4839.5], [1449.0, 5324.5], [1453.0, 6222.0], [1425.0, 6883.0], [1429.0, 5567.333333333333], [1433.0, 4790.666666666667], [1481.0, 5138.5], [1473.0, 5110.5], [1497.0, 5893.0], [1501.0, 4559.0], [1477.0, 5600.0], [1485.0, 6630.0], [1505.0, 5774.0], [1533.0, 6138.0], [1529.0, 5035.833333333333], [1525.0, 5298.5], [1509.0, 5155.0], [1513.0, 5124.0], [1517.0, 6046.0], [1489.0, 5820.0], [1493.0, 4986.0], [1541.0, 5332.0], [1537.0, 5273.0], [1565.0, 4951.4], [1561.0, 4072.0], [1557.0, 4970.0], [1545.0, 5606.0], [1549.0, 5284.0], [1569.0, 5448.0], [1573.0, 5957.0], [1577.0, 5518.0], [1581.0, 5350.0], [1553.0, 5411.0], [541.0, 12704.0], [543.0, 12637.0], [529.0, 12895.0], [531.0, 12894.0], [533.0, 12868.0], [539.0, 12972.0], [537.0, 13167.0], [527.0, 13364.0], [513.0, 13522.0], [515.0, 13133.0], [517.0, 13222.0], [519.0, 13479.0], [525.0, 13114.0], [523.0, 12609.0], [521.0, 13030.0], [535.0, 12811.0], [573.0, 13345.0], [575.0, 12488.0], [561.0, 13459.0], [563.0, 13418.0], [565.0, 13244.0], [571.0, 12754.0], [569.0, 12924.0], [559.0, 12598.0], [545.0, 12691.0], [547.0, 12480.0], [549.0, 12832.0], [551.0, 12494.0], [557.0, 13558.0], [555.0, 12037.0], [553.0, 13143.0], [567.0, 12214.0], [605.0, 12607.0], [607.0, 12216.0], [593.0, 13355.0], [595.0, 13083.0], [597.0, 12565.0], [603.0, 13057.0], [601.0, 12138.0], [591.0, 12862.0], [577.0, 12850.0], [579.0, 13160.0], [581.0, 12583.0], [589.0, 12960.0], [587.0, 12671.0], [585.0, 13465.0], [599.0, 12500.0], [635.0, 12567.0], [633.0, 12598.5], [639.0, 12081.0], [627.0, 11906.0], [625.0, 12264.0], [637.0, 12321.5], [623.0, 12559.0], [609.0, 12844.0], [611.0, 12354.0], [613.0, 13146.0], [615.0, 12620.0], [621.0, 12217.0], [619.0, 12864.0], [617.0, 13076.0], [631.0, 12660.0], [629.0, 11982.0], [665.0, 11912.0], [671.0, 11887.0], [657.0, 12291.0], [659.0, 12329.0], [661.0, 11845.0], [667.0, 12152.0], [647.0, 12079.0], [645.0, 12325.0], [643.0, 12408.0], [641.0, 12960.0], [655.0, 12438.0], [653.0, 12150.0], [651.0, 12158.0], [649.0, 12587.0], [663.0, 11650.0], [699.0, 12183.0], [697.0, 8164.5], [703.0, 7407.0], [689.0, 11994.0], [691.0, 11458.0], [693.0, 12029.0], [701.0, 12395.0], [687.0, 11972.0], [673.0, 12109.0], [675.0, 12701.0], [677.0, 12045.0], [679.0, 12022.0], [685.0, 12224.0], [683.0, 12087.0], [681.0, 11815.0], [695.0, 12552.0], [705.0, 5621.333333333334], [711.0, 7402.5], [709.0, 7058.0], [707.0, 11955.0], [715.0, 13800.0], [713.0, 11633.0], [717.0, 12338.0], [719.0, 11903.0], [735.0, 11644.0], [721.0, 11743.0], [723.0, 11418.0], [725.0, 12236.0], [727.0, 12222.0], [733.0, 11769.0], [731.0, 11697.0], [729.0, 11498.0], [739.0, 11368.0], [737.0, 11423.0], [741.0, 11813.0], [743.0, 11666.0], [751.0, 12039.0], [749.0, 11909.0], [747.0, 11735.0], [745.0, 11690.0], [759.0, 11983.0], [757.0, 7122.5], [767.0, 11654.0], [755.0, 12029.0], [753.0, 11668.0], [763.0, 11469.0], [761.0, 11505.0], [783.0, 11684.0], [777.0, 11770.0], [779.0, 11594.0], [781.0, 11409.0], [769.0, 11280.0], [771.0, 11616.0], [773.0, 11820.0], [775.0, 11815.0], [785.0, 11595.0], [787.0, 11661.0], [789.0, 11395.0], [791.0, 11399.0], [795.0, 7018.5], [799.0, 12419.5], [797.0, 11669.0], [793.0, 12707.0], [829.0, 10696.0], [831.0, 10635.0], [817.0, 10830.0], [819.0, 10820.0], [821.0, 10762.0], [827.0, 10695.0], [825.0, 10537.0], [815.0, 11474.0], [801.0, 11264.0], [803.0, 10996.0], [805.0, 11652.0], [807.0, 11418.0], [813.0, 10648.0], [811.0, 11084.0], [809.0, 11627.0], [823.0, 10098.0], [847.0, 10077.0], [837.0, 6731.0], [841.0, 9953.0], [843.0, 10557.0], [845.0, 10518.0], [833.0, 12137.0], [835.0, 10616.0], [863.0, 10063.0], [849.0, 10474.0], [851.0, 10464.0], [853.0, 10425.0], [855.0, 11286.0], [861.0, 10364.0], [859.0, 10376.0], [857.0, 10398.0], [839.0, 10549.0], [867.0, 10184.5], [893.0, 10012.0], [877.0, 10219.0], [875.0, 10079.0], [873.0, 10273.0], [871.0, 10113.0], [869.0, 10301.0], [865.0, 10277.0], [879.0, 10209.0], [881.0, 6556.0], [883.0, 10174.0], [885.0, 11548.0], [887.0, 10097.0], [889.0, 6455.0], [895.0, 6546.5], [891.0, 10098.0], [899.0, 9937.0], [901.0, 6503.0], [897.0, 11391.0], [903.0, 9873.0], [921.0, 9736.0], [923.0, 9734.0], [909.0, 9813.0], [907.0, 9858.0], [905.0, 9866.0], [911.0, 9804.0], [915.0, 6514.5], [917.0, 10301.0], [919.0, 9710.0], [927.0, 9696.0], [913.0, 9787.0], [925.0, 9596.0], [943.0, 11130.0], [957.0, 9399.0], [937.0, 9564.0], [939.0, 9564.0], [941.0, 11096.0], [929.0, 10233.0], [931.0, 9641.0], [933.0, 9455.0], [935.0, 6553.0], [949.0, 10949.0], [947.0, 10393.0], [945.0, 11231.0], [951.0, 9439.0], [959.0, 11025.0], [955.0, 9429.0], [953.0, 10309.0], [963.0, 6393.0], [987.0, 10898.0], [971.0, 6462.5], [969.0, 9304.0], [973.0, 10491.5], [975.0, 9176.0], [961.0, 9898.0], [979.0, 10848.0], [981.0, 10770.0], [983.0, 9144.0], [977.0, 4669.5], [991.0, 10723.0], [989.0, 10173.0], [985.0, 9068.0], [967.0, 9309.0], [965.0, 9312.0], [995.0, 9010.0], [993.0, 9551.0], [997.0, 8956.0], [999.0, 8959.0], [1007.0, 9641.0], [1017.0, 10276.0], [1003.0, 8865.0], [1001.0, 10495.0], [1005.0, 6661.0], [1023.0, 7661.0], [1009.0, 10713.0], [1011.0, 10219.0], [1013.0, 10273.0], [1015.0, 10377.0], [1021.0, 8607.0], [1019.0, 10006.0], [1034.0, 8492.0], [1074.0, 8737.0], [1082.0, 5601.0], [1030.0, 10072.0], [1038.0, 10108.0], [1078.0, 9917.0], [1046.0, 8388.0], [1042.0, 9646.5], [1050.0, 8975.0], [1054.0, 6649.0], [1026.0, 9599.0], [1058.0, 9969.0], [1062.0, 8213.0], [1066.0, 9241.0], [1070.0, 9012.0], [1086.0, 8829.0], [1102.0, 8899.0], [1094.0, 6383.5], [1090.0, 9503.0], [1098.0, 6048.0], [1138.0, 6585.0], [1142.0, 4770.0], [1146.0, 8123.0], [1150.0, 8346.0], [1106.0, 8486.0], [1110.0, 7776.0], [1114.0, 9167.0], [1118.0, 8564.0], [1122.0, 5912.5], [1126.0, 9556.0], [1130.0, 8486.5], [1134.0, 8252.0], [1162.0, 8017.0], [1158.0, 6397.0], [1154.0, 9036.0], [1182.0, 8394.0], [1166.0, 5964.5], [1186.0, 8892.0], [1214.0, 8690.0], [1210.0, 7851.0], [1206.0, 7726.0], [1202.0, 8760.0], [1190.0, 8250.0], [1194.0, 8957.0], [1198.0, 8650.0], [1170.0, 6614.0], [1174.0, 8364.0], [1178.0, 9120.0], [1222.0, 8488.0], [1218.0, 7963.0], [1226.0, 7643.0], [1230.0, 8401.0], [1234.0, 5894.5], [1238.0, 8560.0], [1242.0, 7780.0], [1246.0, 5957.0], [1262.0, 7925.0], [1258.0, 7615.0], [1254.0, 8342.0], [1250.0, 8110.0], [1278.0, 6586.333333333333], [1274.0, 7913.0], [1270.0, 5988.5], [1266.0, 5526.0], [1334.0, 6847.0], [1286.0, 5711.5], [1282.0, 7257.0], [1310.0, 8135.0], [1306.0, 4229.0], [1314.0, 7149.0], [1342.0, 7279.0], [1338.0, 7608.0], [1294.0, 8203.0], [1290.0, 8281.0], [1330.0, 7940.0], [1318.0, 5103.0], [1322.0, 6640.0], [1326.0, 7290.0], [1298.0, 7423.0], [1302.0, 5682.0], [1350.0, 7646.0], [1346.0, 7173.0], [1374.0, 5664.0], [1366.0, 7065.0], [1362.0, 6913.0], [1370.0, 5023.0], [1354.0, 5595.0], [1358.0, 6271.0], [1378.0, 6747.0], [1406.0, 5593.0], [1398.0, 7303.0], [1394.0, 6800.0], [1402.0, 7533.0], [1382.0, 5449.5], [1386.0, 6746.0], [1390.0, 6589.0], [1422.0, 5673.0], [1410.0, 5566.5], [1418.0, 6821.0], [1414.0, 7357.0], [1438.0, 5242.0], [1458.0, 5429.0], [1462.0, 4451.0], [1466.0, 5688.5], [1470.0, 5890.0], [1442.0, 5538.5], [1446.0, 6426.0], [1450.0, 5310.0], [1454.0, 5002.0], [1426.0, 6256.0], [1430.0, 6645.0], [1434.0, 5296.333333333333], [1482.0, 6115.0], [1486.0, 5553.5], [1498.0, 5380.0], [1494.0, 6254.0], [1502.0, 5262.0], [1474.0, 6089.0], [1534.0, 5360.0], [1530.0, 5097.000000000001], [1522.0, 5317.0], [1526.0, 5129.75], [1506.0, 5229.25], [1510.0, 5421.5], [1514.0, 5495.0], [1518.0, 5362.0], [1490.0, 5527.0], [1542.0, 5472.0], [1538.0, 5021.0], [1566.0, 5101.6], [1562.0, 4977.75], [1554.0, 6136.0], [1558.0, 5187.0], [1546.0, 5227.0], [1550.0, 6016.0], [1570.0, 5274.0], [1578.0, 5352.75], [1574.0, 5271.5], [1031.0, 9216.0], [1027.0, 6107.5], [1035.0, 9980.0], [1039.0, 9195.0], [1075.0, 8729.0], [1079.0, 8117.0], [1047.0, 9125.0], [1043.0, 8966.0], [1051.0, 10125.0], [1055.0, 9808.0], [1083.0, 6667.5], [1087.0, 9169.0], [1059.0, 9888.0], [1063.0, 9952.0], [1067.0, 8174.0], [1071.0, 8154.0], [1103.0, 8822.0], [1147.0, 6115.5], [1091.0, 8024.0], [1095.0, 8039.0], [1099.0, 8790.0], [1139.0, 8300.0], [1143.0, 8198.0], [1151.0, 9088.0], [1107.0, 9329.0], [1111.0, 8421.0], [1115.0, 9615.0], [1119.0, 8715.0], [1123.0, 6001.0], [1127.0, 9455.0], [1131.0, 9471.0], [1135.0, 5950.0], [1167.0, 6220.5], [1155.0, 8125.0], [1159.0, 8526.0], [1183.0, 8124.0], [1163.0, 6598.0], [1187.0, 7935.0], [1215.0, 8644.0], [1211.0, 8929.0], [1207.0, 8718.0], [1203.0, 8053.0], [1191.0, 5420.0], [1195.0, 6443.0], [1199.0, 8410.0], [1175.0, 8173.0], [1171.0, 8931.0], [1179.0, 5309.333333333333], [1223.0, 8802.0], [1231.0, 7576.0], [1267.0, 5662.5], [1219.0, 7568.0], [1227.0, 7779.0], [1239.0, 7534.0], [1235.0, 8507.0], [1243.0, 8538.0], [1247.0, 7549.0], [1263.0, 7456.0], [1255.0, 8483.0], [1279.0, 7700.0], [1251.0, 8455.0], [1275.0, 6180.5], [1271.0, 5793.0], [1295.0, 7625.0], [1283.0, 8198.0], [1311.0, 7030.0], [1307.0, 7495.5], [1287.0, 6341.0], [1343.0, 6814.0], [1339.0, 5765.5], [1335.0, 7169.0], [1291.0, 7793.0], [1331.0, 5197.0], [1319.0, 7324.0], [1323.0, 7900.0], [1327.0, 6026.5], [1303.0, 6910.0], [1355.0, 6832.0], [1359.0, 5350.5], [1375.0, 6930.0], [1371.0, 6106.0], [1367.0, 7489.0], [1363.0, 6749.0], [1351.0, 7569.0], [1379.0, 7656.0], [1407.0, 6163.5], [1399.0, 4884.333333333333], [1395.0, 6467.0], [1403.0, 8366.0], [1387.0, 6481.0], [1383.0, 7609.0], [1391.0, 6736.0], [1423.0, 5464.0], [1419.0, 4588.666666666667], [1435.0, 5339.333333333333], [1415.0, 6489.0], [1411.0, 7275.0], [1439.0, 6477.0], [1463.0, 5252.5], [1467.0, 4939.5], [1471.0, 5763.0], [1459.0, 6327.0], [1443.0, 6144.0], [1447.0, 4822.0], [1451.0, 5182.0], [1455.0, 6209.0], [1427.0, 6368.0], [1431.0, 5337.0], [1475.0, 5147.0], [1479.0, 5530.333333333333], [1499.0, 6716.0], [1495.0, 5543.0], [1503.0, 4847.0], [1483.0, 4977.0], [1531.0, 5332.5], [1535.0, 4983.714285714286], [1527.0, 5193.1], [1523.0, 5810.0], [1487.0, 5431.0], [1507.0, 4685.2], [1511.0, 5150.0], [1515.0, 5532.0], [1519.0, 5482.5], [1491.0, 5488.0], [1543.0, 4937.0], [1539.0, 5524.333333333333], [1567.0, 5223.2], [1563.0, 5289.75], [1559.0, 5002.0], [1555.0, 5429.0], [1547.0, 4852.0], [1551.0, 5009.0], [1571.0, 5660.0], [1575.0, 4842.0], [1579.0, 4968.5], [1.0, 15216.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[870.0214999999971, 9400.414999999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1581.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12566.666666666666, "minX": 1.5495837E12, "maxY": 13997.266666666666, "series": [{"data": [[1.5495837E12, 13997.266666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495837E12, 12566.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495837E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 9400.414999999999, "minX": 1.5495837E12, "maxY": 9400.414999999999, "series": [{"data": [[1.5495837E12, 9400.414999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495837E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 9400.405000000004, "minX": 1.5495837E12, "maxY": 9400.405000000004, "series": [{"data": [[1.5495837E12, 9400.405000000004]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495837E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 97.3029999999999, "minX": 1.5495837E12, "maxY": 97.3029999999999, "series": [{"data": [[1.5495837E12, 97.3029999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495837E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 405.0, "minX": 1.5495837E12, "maxY": 15553.0, "series": [{"data": [[1.5495837E12, 15553.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495837E12, 405.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495837E12, 14417.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495837E12, 15315.96]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495837E12, 14802.349999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495837E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 9628.5, "minX": 33.0, "maxY": 9628.5, "series": [{"data": [[33.0, 9628.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 9628.5, "minX": 33.0, "maxY": 9628.5, "series": [{"data": [[33.0, 9628.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495837E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495837E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495837E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495837E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495837E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495837E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495837E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495837E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495837E12, "title": "Transactions Per Second"}},
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
