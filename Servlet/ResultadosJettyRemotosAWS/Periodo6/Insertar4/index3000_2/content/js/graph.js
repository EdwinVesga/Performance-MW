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
        data: {"result": {"minY": 165.0, "minX": 0.0, "maxY": 11503.0, "series": [{"data": [[0.0, 165.0], [0.1, 220.0], [0.2, 263.0], [0.3, 276.0], [0.4, 287.0], [0.5, 297.0], [0.6, 326.0], [0.7, 349.0], [0.8, 352.0], [0.9, 369.0], [1.0, 375.0], [1.1, 398.0], [1.2, 407.0], [1.3, 421.0], [1.4, 425.0], [1.5, 428.0], [1.6, 442.0], [1.7, 452.0], [1.8, 492.0], [1.9, 503.0], [2.0, 519.0], [2.1, 523.0], [2.2, 550.0], [2.3, 587.0], [2.4, 640.0], [2.5, 657.0], [2.6, 857.0], [2.7, 899.0], [2.8, 981.0], [2.9, 989.0], [3.0, 1017.0], [3.1, 1057.0], [3.2, 1074.0], [3.3, 1096.0], [3.4, 1106.0], [3.5, 1124.0], [3.6, 1133.0], [3.7, 1147.0], [3.8, 1201.0], [3.9, 1222.0], [4.0, 1257.0], [4.1, 1281.0], [4.2, 1290.0], [4.3, 1304.0], [4.4, 1319.0], [4.5, 1346.0], [4.6, 1358.0], [4.7, 1370.0], [4.8, 1379.0], [4.9, 1394.0], [5.0, 1415.0], [5.1, 1425.0], [5.2, 1433.0], [5.3, 1440.0], [5.4, 1451.0], [5.5, 1463.0], [5.6, 1480.0], [5.7, 1492.0], [5.8, 1518.0], [5.9, 1542.0], [6.0, 1566.0], [6.1, 1577.0], [6.2, 1588.0], [6.3, 1608.0], [6.4, 1621.0], [6.5, 1639.0], [6.6, 1649.0], [6.7, 1654.0], [6.8, 1667.0], [6.9, 1671.0], [7.0, 1676.0], [7.1, 1699.0], [7.2, 1714.0], [7.3, 1715.0], [7.4, 1718.0], [7.5, 1720.0], [7.6, 1729.0], [7.7, 1745.0], [7.8, 1751.0], [7.9, 1764.0], [8.0, 1776.0], [8.1, 1787.0], [8.2, 1788.0], [8.3, 1801.0], [8.4, 1822.0], [8.5, 1825.0], [8.6, 1847.0], [8.7, 1855.0], [8.8, 1870.0], [8.9, 1883.0], [9.0, 1893.0], [9.1, 1902.0], [9.2, 1911.0], [9.3, 1917.0], [9.4, 1925.0], [9.5, 1946.0], [9.6, 1956.0], [9.7, 1960.0], [9.8, 1966.0], [9.9, 1976.0], [10.0, 1977.0], [10.1, 1982.0], [10.2, 1999.0], [10.3, 2014.0], [10.4, 2022.0], [10.5, 2036.0], [10.6, 2049.0], [10.7, 2061.0], [10.8, 2082.0], [10.9, 2095.0], [11.0, 2118.0], [11.1, 2131.0], [11.2, 2161.0], [11.3, 2176.0], [11.4, 2188.0], [11.5, 2204.0], [11.6, 2208.0], [11.7, 2221.0], [11.8, 2223.0], [11.9, 2234.0], [12.0, 2248.0], [12.1, 2253.0], [12.2, 2264.0], [12.3, 2286.0], [12.4, 2292.0], [12.5, 2305.0], [12.6, 2323.0], [12.7, 2341.0], [12.8, 2348.0], [12.9, 2363.0], [13.0, 2376.0], [13.1, 2391.0], [13.2, 2408.0], [13.3, 2410.0], [13.4, 2428.0], [13.5, 2431.0], [13.6, 2431.0], [13.7, 2434.0], [13.8, 2443.0], [13.9, 2449.0], [14.0, 2456.0], [14.1, 2462.0], [14.2, 2470.0], [14.3, 2478.0], [14.4, 2482.0], [14.5, 2504.0], [14.6, 2510.0], [14.7, 2515.0], [14.8, 2526.0], [14.9, 2534.0], [15.0, 2539.0], [15.1, 2553.0], [15.2, 2559.0], [15.3, 2567.0], [15.4, 2580.0], [15.5, 2593.0], [15.6, 2598.0], [15.7, 2601.0], [15.8, 2605.0], [15.9, 2621.0], [16.0, 2624.0], [16.1, 2630.0], [16.2, 2636.0], [16.3, 2641.0], [16.4, 2647.0], [16.5, 2653.0], [16.6, 2657.0], [16.7, 2661.0], [16.8, 2666.0], [16.9, 2669.0], [17.0, 2671.0], [17.1, 2675.0], [17.2, 2676.0], [17.3, 2681.0], [17.4, 2687.0], [17.5, 2692.0], [17.6, 2697.0], [17.7, 2703.0], [17.8, 2717.0], [17.9, 2720.0], [18.0, 2726.0], [18.1, 2731.0], [18.2, 2734.0], [18.3, 2741.0], [18.4, 2747.0], [18.5, 2750.0], [18.6, 2761.0], [18.7, 2773.0], [18.8, 2777.0], [18.9, 2781.0], [19.0, 2790.0], [19.1, 2791.0], [19.2, 2800.0], [19.3, 2804.0], [19.4, 2812.0], [19.5, 2823.0], [19.6, 2839.0], [19.7, 2847.0], [19.8, 2862.0], [19.9, 2870.0], [20.0, 2883.0], [20.1, 2886.0], [20.2, 2898.0], [20.3, 2909.0], [20.4, 2927.0], [20.5, 2929.0], [20.6, 2939.0], [20.7, 2944.0], [20.8, 2953.0], [20.9, 2960.0], [21.0, 2965.0], [21.1, 2968.0], [21.2, 2970.0], [21.3, 2974.0], [21.4, 2981.0], [21.5, 2993.0], [21.6, 2999.0], [21.7, 3015.0], [21.8, 3020.0], [21.9, 3027.0], [22.0, 3038.0], [22.1, 3060.0], [22.2, 3065.0], [22.3, 3081.0], [22.4, 3082.0], [22.5, 3089.0], [22.6, 3098.0], [22.7, 3106.0], [22.8, 3108.0], [22.9, 3110.0], [23.0, 3116.0], [23.1, 3119.0], [23.2, 3123.0], [23.3, 3127.0], [23.4, 3136.0], [23.5, 3145.0], [23.6, 3150.0], [23.7, 3166.0], [23.8, 3171.0], [23.9, 3177.0], [24.0, 3181.0], [24.1, 3198.0], [24.2, 3206.0], [24.3, 3219.0], [24.4, 3228.0], [24.5, 3232.0], [24.6, 3235.0], [24.7, 3246.0], [24.8, 3260.0], [24.9, 3268.0], [25.0, 3273.0], [25.1, 3283.0], [25.2, 3291.0], [25.3, 3297.0], [25.4, 3299.0], [25.5, 3313.0], [25.6, 3325.0], [25.7, 3335.0], [25.8, 3339.0], [25.9, 3356.0], [26.0, 3368.0], [26.1, 3383.0], [26.2, 3385.0], [26.3, 3390.0], [26.4, 3393.0], [26.5, 3407.0], [26.6, 3428.0], [26.7, 3434.0], [26.8, 3445.0], [26.9, 3452.0], [27.0, 3469.0], [27.1, 3483.0], [27.2, 3493.0], [27.3, 3515.0], [27.4, 3536.0], [27.5, 3545.0], [27.6, 3551.0], [27.7, 3558.0], [27.8, 3566.0], [27.9, 3578.0], [28.0, 3591.0], [28.1, 3610.0], [28.2, 3630.0], [28.3, 3657.0], [28.4, 3667.0], [28.5, 3680.0], [28.6, 3687.0], [28.7, 3701.0], [28.8, 3711.0], [28.9, 3722.0], [29.0, 3733.0], [29.1, 3744.0], [29.2, 3747.0], [29.3, 3757.0], [29.4, 3768.0], [29.5, 3784.0], [29.6, 3799.0], [29.7, 3817.0], [29.8, 3828.0], [29.9, 3834.0], [30.0, 3846.0], [30.1, 3860.0], [30.2, 3871.0], [30.3, 3882.0], [30.4, 3887.0], [30.5, 3899.0], [30.6, 3917.0], [30.7, 3921.0], [30.8, 3928.0], [30.9, 3941.0], [31.0, 3963.0], [31.1, 3976.0], [31.2, 3993.0], [31.3, 3999.0], [31.4, 4002.0], [31.5, 4023.0], [31.6, 4026.0], [31.7, 4032.0], [31.8, 4035.0], [31.9, 4042.0], [32.0, 4053.0], [32.1, 4064.0], [32.2, 4074.0], [32.3, 4083.0], [32.4, 4088.0], [32.5, 4099.0], [32.6, 4107.0], [32.7, 4133.0], [32.8, 4134.0], [32.9, 4137.0], [33.0, 4141.0], [33.1, 4144.0], [33.2, 4156.0], [33.3, 4165.0], [33.4, 4168.0], [33.5, 4170.0], [33.6, 4176.0], [33.7, 4178.0], [33.8, 4188.0], [33.9, 4191.0], [34.0, 4196.0], [34.1, 4200.0], [34.2, 4204.0], [34.3, 4209.0], [34.4, 4211.0], [34.5, 4221.0], [34.6, 4226.0], [34.7, 4229.0], [34.8, 4234.0], [34.9, 4249.0], [35.0, 4255.0], [35.1, 4262.0], [35.2, 4265.0], [35.3, 4270.0], [35.4, 4276.0], [35.5, 4280.0], [35.6, 4286.0], [35.7, 4290.0], [35.8, 4293.0], [35.9, 4300.0], [36.0, 4311.0], [36.1, 4316.0], [36.2, 4320.0], [36.3, 4329.0], [36.4, 4336.0], [36.5, 4342.0], [36.6, 4350.0], [36.7, 4356.0], [36.8, 4359.0], [36.9, 4370.0], [37.0, 4376.0], [37.1, 4390.0], [37.2, 4398.0], [37.3, 4404.0], [37.4, 4411.0], [37.5, 4431.0], [37.6, 4438.0], [37.7, 4439.0], [37.8, 4444.0], [37.9, 4457.0], [38.0, 4463.0], [38.1, 4469.0], [38.2, 4471.0], [38.3, 4480.0], [38.4, 4484.0], [38.5, 4487.0], [38.6, 4492.0], [38.7, 4506.0], [38.8, 4516.0], [38.9, 4523.0], [39.0, 4533.0], [39.1, 4550.0], [39.2, 4553.0], [39.3, 4555.0], [39.4, 4563.0], [39.5, 4568.0], [39.6, 4582.0], [39.7, 4589.0], [39.8, 4601.0], [39.9, 4617.0], [40.0, 4634.0], [40.1, 4642.0], [40.2, 4648.0], [40.3, 4655.0], [40.4, 4663.0], [40.5, 4674.0], [40.6, 4676.0], [40.7, 4699.0], [40.8, 4709.0], [40.9, 4725.0], [41.0, 4730.0], [41.1, 4735.0], [41.2, 4758.0], [41.3, 4771.0], [41.4, 4776.0], [41.5, 4784.0], [41.6, 4795.0], [41.7, 4801.0], [41.8, 4819.0], [41.9, 4824.0], [42.0, 4833.0], [42.1, 4859.0], [42.2, 4865.0], [42.3, 4873.0], [42.4, 4892.0], [42.5, 4901.0], [42.6, 4903.0], [42.7, 4910.0], [42.8, 4913.0], [42.9, 4924.0], [43.0, 4942.0], [43.1, 4945.0], [43.2, 4962.0], [43.3, 4969.0], [43.4, 4976.0], [43.5, 4994.0], [43.6, 5005.0], [43.7, 5027.0], [43.8, 5030.0], [43.9, 5036.0], [44.0, 5041.0], [44.1, 5061.0], [44.2, 5073.0], [44.3, 5082.0], [44.4, 5098.0], [44.5, 5112.0], [44.6, 5119.0], [44.7, 5138.0], [44.8, 5153.0], [44.9, 5158.0], [45.0, 5169.0], [45.1, 5184.0], [45.2, 5196.0], [45.3, 5203.0], [45.4, 5205.0], [45.5, 5214.0], [45.6, 5216.0], [45.7, 5223.0], [45.8, 5242.0], [45.9, 5244.0], [46.0, 5258.0], [46.1, 5263.0], [46.2, 5269.0], [46.3, 5283.0], [46.4, 5295.0], [46.5, 5324.0], [46.6, 5326.0], [46.7, 5333.0], [46.8, 5342.0], [46.9, 5346.0], [47.0, 5353.0], [47.1, 5359.0], [47.2, 5368.0], [47.3, 5382.0], [47.4, 5385.0], [47.5, 5390.0], [47.6, 5402.0], [47.7, 5407.0], [47.8, 5421.0], [47.9, 5435.0], [48.0, 5446.0], [48.1, 5460.0], [48.2, 5470.0], [48.3, 5479.0], [48.4, 5487.0], [48.5, 5507.0], [48.6, 5512.0], [48.7, 5525.0], [48.8, 5529.0], [48.9, 5540.0], [49.0, 5546.0], [49.1, 5551.0], [49.2, 5559.0], [49.3, 5576.0], [49.4, 5592.0], [49.5, 5604.0], [49.6, 5611.0], [49.7, 5615.0], [49.8, 5627.0], [49.9, 5642.0], [50.0, 5650.0], [50.1, 5655.0], [50.2, 5657.0], [50.3, 5667.0], [50.4, 5672.0], [50.5, 5689.0], [50.6, 5704.0], [50.7, 5711.0], [50.8, 5711.0], [50.9, 5724.0], [51.0, 5732.0], [51.1, 5743.0], [51.2, 5745.0], [51.3, 5752.0], [51.4, 5766.0], [51.5, 5777.0], [51.6, 5798.0], [51.7, 5804.0], [51.8, 5811.0], [51.9, 5814.0], [52.0, 5820.0], [52.1, 5824.0], [52.2, 5827.0], [52.3, 5834.0], [52.4, 5837.0], [52.5, 5844.0], [52.6, 5854.0], [52.7, 5855.0], [52.8, 5861.0], [52.9, 5879.0], [53.0, 5889.0], [53.1, 5893.0], [53.2, 5910.0], [53.3, 5925.0], [53.4, 5934.0], [53.5, 5948.0], [53.6, 5958.0], [53.7, 5962.0], [53.8, 5979.0], [53.9, 6010.0], [54.0, 6020.0], [54.1, 6029.0], [54.2, 6032.0], [54.3, 6034.0], [54.4, 6041.0], [54.5, 6046.0], [54.6, 6067.0], [54.7, 6079.0], [54.8, 6086.0], [54.9, 6097.0], [55.0, 6114.0], [55.1, 6116.0], [55.2, 6124.0], [55.3, 6135.0], [55.4, 6141.0], [55.5, 6150.0], [55.6, 6154.0], [55.7, 6159.0], [55.8, 6175.0], [55.9, 6181.0], [56.0, 6183.0], [56.1, 6196.0], [56.2, 6203.0], [56.3, 6215.0], [56.4, 6218.0], [56.5, 6224.0], [56.6, 6235.0], [56.7, 6238.0], [56.8, 6244.0], [56.9, 6248.0], [57.0, 6256.0], [57.1, 6276.0], [57.2, 6279.0], [57.3, 6287.0], [57.4, 6291.0], [57.5, 6298.0], [57.6, 6304.0], [57.7, 6317.0], [57.8, 6324.0], [57.9, 6331.0], [58.0, 6337.0], [58.1, 6339.0], [58.2, 6353.0], [58.3, 6357.0], [58.4, 6359.0], [58.5, 6375.0], [58.6, 6391.0], [58.7, 6395.0], [58.8, 6400.0], [58.9, 6407.0], [59.0, 6414.0], [59.1, 6420.0], [59.2, 6421.0], [59.3, 6428.0], [59.4, 6441.0], [59.5, 6446.0], [59.6, 6451.0], [59.7, 6460.0], [59.8, 6467.0], [59.9, 6470.0], [60.0, 6475.0], [60.1, 6478.0], [60.2, 6485.0], [60.3, 6492.0], [60.4, 6493.0], [60.5, 6499.0], [60.6, 6509.0], [60.7, 6520.0], [60.8, 6530.0], [60.9, 6536.0], [61.0, 6540.0], [61.1, 6552.0], [61.2, 6561.0], [61.3, 6570.0], [61.4, 6572.0], [61.5, 6577.0], [61.6, 6599.0], [61.7, 6607.0], [61.8, 6612.0], [61.9, 6615.0], [62.0, 6628.0], [62.1, 6634.0], [62.2, 6654.0], [62.3, 6666.0], [62.4, 6678.0], [62.5, 6684.0], [62.6, 6687.0], [62.7, 6704.0], [62.8, 6710.0], [62.9, 6730.0], [63.0, 6737.0], [63.1, 6742.0], [63.2, 6757.0], [63.3, 6764.0], [63.4, 6768.0], [63.5, 6771.0], [63.6, 6784.0], [63.7, 6789.0], [63.8, 6792.0], [63.9, 6796.0], [64.0, 6799.0], [64.1, 6804.0], [64.2, 6822.0], [64.3, 6825.0], [64.4, 6838.0], [64.5, 6848.0], [64.6, 6864.0], [64.7, 6882.0], [64.8, 6888.0], [64.9, 6900.0], [65.0, 6908.0], [65.1, 6916.0], [65.2, 6919.0], [65.3, 6928.0], [65.4, 6932.0], [65.5, 6938.0], [65.6, 6948.0], [65.7, 6954.0], [65.8, 6959.0], [65.9, 6961.0], [66.0, 6973.0], [66.1, 6989.0], [66.2, 6994.0], [66.3, 7002.0], [66.4, 7011.0], [66.5, 7023.0], [66.6, 7030.0], [66.7, 7036.0], [66.8, 7045.0], [66.9, 7051.0], [67.0, 7057.0], [67.1, 7061.0], [67.2, 7066.0], [67.3, 7072.0], [67.4, 7077.0], [67.5, 7085.0], [67.6, 7088.0], [67.7, 7096.0], [67.8, 7109.0], [67.9, 7118.0], [68.0, 7130.0], [68.1, 7139.0], [68.2, 7150.0], [68.3, 7176.0], [68.4, 7194.0], [68.5, 7201.0], [68.6, 7214.0], [68.7, 7227.0], [68.8, 7235.0], [68.9, 7244.0], [69.0, 7252.0], [69.1, 7269.0], [69.2, 7282.0], [69.3, 7284.0], [69.4, 7288.0], [69.5, 7296.0], [69.6, 7302.0], [69.7, 7307.0], [69.8, 7311.0], [69.9, 7319.0], [70.0, 7331.0], [70.1, 7361.0], [70.2, 7364.0], [70.3, 7421.0], [70.4, 7453.0], [70.5, 7470.0], [70.6, 7474.0], [70.7, 7490.0], [70.8, 7510.0], [70.9, 7536.0], [71.0, 7568.0], [71.1, 7576.0], [71.2, 7601.0], [71.3, 7627.0], [71.4, 7638.0], [71.5, 7658.0], [71.6, 7678.0], [71.7, 7712.0], [71.8, 7719.0], [71.9, 7749.0], [72.0, 7763.0], [72.1, 7770.0], [72.2, 7786.0], [72.3, 7803.0], [72.4, 7809.0], [72.5, 7821.0], [72.6, 7828.0], [72.7, 7841.0], [72.8, 7854.0], [72.9, 7864.0], [73.0, 7879.0], [73.1, 7892.0], [73.2, 7901.0], [73.3, 7910.0], [73.4, 7913.0], [73.5, 7936.0], [73.6, 7946.0], [73.7, 7954.0], [73.8, 7956.0], [73.9, 7973.0], [74.0, 7984.0], [74.1, 7992.0], [74.2, 7994.0], [74.3, 8009.0], [74.4, 8027.0], [74.5, 8035.0], [74.6, 8044.0], [74.7, 8048.0], [74.8, 8051.0], [74.9, 8063.0], [75.0, 8070.0], [75.1, 8081.0], [75.2, 8092.0], [75.3, 8095.0], [75.4, 8107.0], [75.5, 8113.0], [75.6, 8118.0], [75.7, 8129.0], [75.8, 8132.0], [75.9, 8143.0], [76.0, 8150.0], [76.1, 8167.0], [76.2, 8173.0], [76.3, 8180.0], [76.4, 8190.0], [76.5, 8203.0], [76.6, 8216.0], [76.7, 8243.0], [76.8, 8252.0], [76.9, 8260.0], [77.0, 8272.0], [77.1, 8276.0], [77.2, 8286.0], [77.3, 8293.0], [77.4, 8306.0], [77.5, 8320.0], [77.6, 8341.0], [77.7, 8350.0], [77.8, 8372.0], [77.9, 8374.0], [78.0, 8381.0], [78.1, 8389.0], [78.2, 8402.0], [78.3, 8419.0], [78.4, 8424.0], [78.5, 8428.0], [78.6, 8438.0], [78.7, 8446.0], [78.8, 8453.0], [78.9, 8465.0], [79.0, 8484.0], [79.1, 8491.0], [79.2, 8497.0], [79.3, 8514.0], [79.4, 8517.0], [79.5, 8531.0], [79.6, 8560.0], [79.7, 8571.0], [79.8, 8590.0], [79.9, 8604.0], [80.0, 8613.0], [80.1, 8631.0], [80.2, 8639.0], [80.3, 8650.0], [80.4, 8664.0], [80.5, 8671.0], [80.6, 8674.0], [80.7, 8682.0], [80.8, 8693.0], [80.9, 8705.0], [81.0, 8723.0], [81.1, 8729.0], [81.2, 8731.0], [81.3, 8736.0], [81.4, 8743.0], [81.5, 8752.0], [81.6, 8758.0], [81.7, 8764.0], [81.8, 8773.0], [81.9, 8788.0], [82.0, 8803.0], [82.1, 8808.0], [82.2, 8820.0], [82.3, 8830.0], [82.4, 8849.0], [82.5, 8855.0], [82.6, 8865.0], [82.7, 8881.0], [82.8, 8885.0], [82.9, 8890.0], [83.0, 8896.0], [83.1, 8899.0], [83.2, 8912.0], [83.3, 8928.0], [83.4, 8933.0], [83.5, 8941.0], [83.6, 8946.0], [83.7, 8961.0], [83.8, 8962.0], [83.9, 8973.0], [84.0, 8979.0], [84.1, 8984.0], [84.2, 8994.0], [84.3, 8998.0], [84.4, 9005.0], [84.5, 9007.0], [84.6, 9014.0], [84.7, 9018.0], [84.8, 9024.0], [84.9, 9028.0], [85.0, 9034.0], [85.1, 9039.0], [85.2, 9042.0], [85.3, 9043.0], [85.4, 9045.0], [85.5, 9049.0], [85.6, 9051.0], [85.7, 9058.0], [85.8, 9071.0], [85.9, 9084.0], [86.0, 9089.0], [86.1, 9099.0], [86.2, 9103.0], [86.3, 9106.0], [86.4, 9110.0], [86.5, 9112.0], [86.6, 9119.0], [86.7, 9122.0], [86.8, 9132.0], [86.9, 9138.0], [87.0, 9145.0], [87.1, 9147.0], [87.2, 9151.0], [87.3, 9158.0], [87.4, 9160.0], [87.5, 9165.0], [87.6, 9173.0], [87.7, 9178.0], [87.8, 9183.0], [87.9, 9188.0], [88.0, 9191.0], [88.1, 9199.0], [88.2, 9201.0], [88.3, 9206.0], [88.4, 9210.0], [88.5, 9216.0], [88.6, 9223.0], [88.7, 9228.0], [88.8, 9232.0], [88.9, 9242.0], [89.0, 9250.0], [89.1, 9252.0], [89.2, 9256.0], [89.3, 9258.0], [89.4, 9266.0], [89.5, 9273.0], [89.6, 9279.0], [89.7, 9283.0], [89.8, 9287.0], [89.9, 9292.0], [90.0, 9294.0], [90.1, 9297.0], [90.2, 9305.0], [90.3, 9308.0], [90.4, 9313.0], [90.5, 9317.0], [90.6, 9328.0], [90.7, 9332.0], [90.8, 9334.0], [90.9, 9341.0], [91.0, 9347.0], [91.1, 9347.0], [91.2, 9351.0], [91.3, 9366.0], [91.4, 9369.0], [91.5, 9382.0], [91.6, 9385.0], [91.7, 9392.0], [91.8, 9397.0], [91.9, 9406.0], [92.0, 9408.0], [92.1, 9416.0], [92.2, 9417.0], [92.3, 9420.0], [92.4, 9426.0], [92.5, 9429.0], [92.6, 9443.0], [92.7, 9449.0], [92.8, 9452.0], [92.9, 9465.0], [93.0, 9471.0], [93.1, 9478.0], [93.2, 9488.0], [93.3, 9504.0], [93.4, 9510.0], [93.5, 9511.0], [93.6, 9515.0], [93.7, 9532.0], [93.8, 9538.0], [93.9, 9541.0], [94.0, 9551.0], [94.1, 9561.0], [94.2, 9570.0], [94.3, 9579.0], [94.4, 9591.0], [94.5, 9599.0], [94.6, 9602.0], [94.7, 9607.0], [94.8, 9614.0], [94.9, 9625.0], [95.0, 9629.0], [95.1, 9638.0], [95.2, 9651.0], [95.3, 9655.0], [95.4, 9657.0], [95.5, 9669.0], [95.6, 9683.0], [95.7, 9685.0], [95.8, 9689.0], [95.9, 9705.0], [96.0, 9712.0], [96.1, 9721.0], [96.2, 9726.0], [96.3, 9747.0], [96.4, 9756.0], [96.5, 9775.0], [96.6, 9785.0], [96.7, 9791.0], [96.8, 9796.0], [96.9, 9824.0], [97.0, 9830.0], [97.1, 9834.0], [97.2, 9844.0], [97.3, 9848.0], [97.4, 9852.0], [97.5, 9856.0], [97.6, 9874.0], [97.7, 9882.0], [97.8, 9903.0], [97.9, 9907.0], [98.0, 9913.0], [98.1, 9923.0], [98.2, 9964.0], [98.3, 9981.0], [98.4, 9992.0], [98.5, 10003.0], [98.6, 10025.0], [98.7, 10042.0], [98.8, 10123.0], [98.9, 10135.0], [99.0, 10162.0], [99.1, 10192.0], [99.2, 10211.0], [99.3, 10246.0], [99.4, 10315.0], [99.5, 10384.0], [99.6, 10471.0], [99.7, 10639.0], [99.8, 10765.0], [99.9, 10906.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 61.0, "series": [{"data": [[100.0, 2.0], [200.0, 14.0], [300.0, 18.0], [400.0, 22.0], [500.0, 13.0], [600.0, 8.0], [700.0, 1.0], [800.0, 4.0], [900.0, 6.0], [1000.0, 13.0], [1100.0, 12.0], [1200.0, 16.0], [1300.0, 19.0], [1400.0, 25.0], [1500.0, 15.0], [1600.0, 26.0], [1700.0, 35.0], [1800.0, 24.0], [1900.0, 34.0], [2000.0, 21.0], [2100.0, 15.0], [2200.0, 32.0], [2300.0, 20.0], [2400.0, 40.0], [2500.0, 36.0], [2600.0, 59.0], [2700.0, 45.0], [2800.0, 32.0], [2900.0, 41.0], [3000.0, 30.0], [3100.0, 45.0], [3200.0, 39.0], [3300.0, 30.0], [3400.0, 24.0], [3500.0, 24.0], [3700.0, 28.0], [3600.0, 20.0], [3800.0, 27.0], [3900.0, 25.0], [4000.0, 35.0], [4100.0, 45.0], [4200.0, 56.0], [4300.0, 41.0], [4500.0, 34.0], [4400.0, 42.0], [4600.0, 28.0], [4700.0, 29.0], [4800.0, 23.0], [4900.0, 32.0], [5000.0, 27.0], [5100.0, 25.0], [5200.0, 35.0], [5300.0, 34.0], [5400.0, 26.0], [5500.0, 31.0], [5600.0, 33.0], [5700.0, 35.0], [5800.0, 44.0], [5900.0, 22.0], [6000.0, 31.0], [6100.0, 36.0], [6300.0, 37.0], [6200.0, 43.0], [6400.0, 52.0], [6500.0, 33.0], [6600.0, 31.0], [6800.0, 26.0], [6700.0, 41.0], [6900.0, 41.0], [7000.0, 44.0], [7100.0, 23.0], [7300.0, 21.0], [7200.0, 32.0], [7400.0, 15.0], [7500.0, 13.0], [7600.0, 15.0], [7700.0, 18.0], [7800.0, 27.0], [7900.0, 33.0], [8000.0, 31.0], [8100.0, 34.0], [8200.0, 27.0], [8300.0, 24.0], [8400.0, 32.0], [8700.0, 33.0], [8600.0, 30.0], [8500.0, 20.0], [9200.0, 61.0], [9000.0, 55.0], [9100.0, 59.0], [8800.0, 34.0], [8900.0, 36.0], [9300.0, 50.0], [9400.0, 44.0], [9700.0, 28.0], [9500.0, 38.0], [9600.0, 40.0], [9800.0, 29.0], [9900.0, 19.0], [10100.0, 11.0], [10000.0, 10.0], [10200.0, 7.0], [10300.0, 5.0], [10700.0, 4.0], [10400.0, 3.0], [10600.0, 2.0], [10500.0, 1.0], [10800.0, 1.0], [11100.0, 1.0], [10900.0, 1.0], [11500.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 11500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 56.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2827.0, "series": [{"data": [[1.0, 117.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 56.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2827.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1035.336999999999, "minX": 1.54958358E12, "maxY": 1035.336999999999, "series": [{"data": [[1.54958358E12, 1035.336999999999]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 410.0, "minX": 1.0, "maxY": 11503.0, "series": [{"data": [[2.0, 9707.0], [4.0, 9254.5], [5.0, 9869.0], [6.0, 9504.0], [7.0, 9473.0], [8.0, 9266.0], [10.0, 9555.0], [11.0, 10130.0], [12.0, 10246.0], [13.0, 10162.0], [14.0, 9903.0], [15.0, 9591.0], [16.0, 9964.0], [17.0, 11503.0], [18.0, 9570.0], [19.0, 9488.0], [20.0, 9413.0], [21.0, 9332.0], [22.0, 9726.0], [23.0, 10225.0], [24.0, 9913.0], [25.0, 9776.0], [26.0, 9837.0], [27.0, 9258.0], [28.0, 9591.0], [29.0, 9686.0], [30.0, 9497.0], [31.0, 9850.0], [33.0, 9265.0], [32.0, 9310.0], [35.0, 9904.0], [34.0, 9127.0], [37.0, 10009.0], [36.0, 9970.0], [38.0, 9982.0], [41.0, 9111.0], [40.0, 9445.0], [43.0, 9677.0], [44.0, 9847.0], [47.0, 9330.0], [46.0, 9760.5], [49.0, 9319.5], [51.0, 9317.0], [50.0, 9347.0], [53.0, 9256.0], [52.0, 9904.0], [55.0, 9809.0], [57.0, 9837.0], [56.0, 9981.0], [59.0, 9420.0], [58.0, 9496.0], [61.0, 9221.0], [60.0, 10003.0], [63.0, 9718.0], [62.0, 9107.0], [67.0, 9199.0], [66.0, 9252.0], [65.0, 9475.0], [71.0, 9147.0], [70.0, 9303.0], [68.0, 9257.0], [75.0, 10106.0], [74.0, 9172.0], [73.0, 9770.0], [72.0, 9793.0], [79.0, 9709.0], [78.0, 9450.0], [77.0, 9693.0], [76.0, 9471.0], [83.0, 9511.0], [82.0, 9151.0], [81.0, 9537.5], [86.0, 2159.8], [87.0, 2633.0], [85.0, 9146.0], [84.0, 9604.0], [89.0, 1846.8333333333333], [88.0, 2639.25], [90.0, 4965.5], [91.0, 3395.6666666666665], [94.0, 4083.4], [95.0, 1638.0], [93.0, 410.0], [92.0, 9504.0], [96.0, 1998.0], [98.0, 2770.75], [97.0, 3322.3333333333335], [99.0, 3478.3333333333335], [100.0, 2799.0], [102.0, 4205.4], [101.0, 536.6666666666666], [103.0, 5108.0], [107.0, 9084.0], [106.0, 9033.0], [105.0, 10039.0], [104.0, 9912.0], [110.0, 5050.0], [111.0, 9050.0], [109.0, 9671.0], [108.0, 9510.0], [112.0, 5065.0], [113.0, 5216.0], [115.0, 9099.0], [114.0, 9333.0], [118.0, 3398.0], [119.0, 5005.0], [117.0, 9305.0], [116.0, 9416.0], [120.0, 3355.0], [123.0, 4915.0], [122.0, 9579.0], [121.0, 9046.0], [124.0, 611.0], [127.0, 3466.0], [126.0, 5310.5], [125.0, 9694.5], [128.0, 3560.3333333333335], [132.0, 546.0], [131.0, 4887.0], [133.0, 6542.333333333333], [135.0, 9138.0], [134.0, 9181.0], [130.0, 9051.0], [129.0, 9128.0], [136.0, 423.0], [137.0, 3404.1666666666665], [143.0, 9343.0], [141.0, 9597.0], [140.0, 9896.0], [139.0, 10002.0], [138.0, 9228.0], [151.0, 8994.0], [150.0, 9294.0], [149.0, 9535.0], [148.0, 9691.5], [146.0, 9636.0], [145.0, 9784.0], [144.0, 9420.0], [159.0, 9382.0], [158.0, 9043.0], [157.0, 9057.0], [156.0, 10071.0], [155.0, 9653.0], [154.0, 9747.0], [153.0, 9231.0], [152.0, 9449.0], [167.0, 9084.0], [166.0, 9060.0], [165.0, 9823.0], [164.0, 9416.0], [163.0, 9407.0], [162.0, 9349.0], [161.0, 9550.0], [160.0, 9792.0], [175.0, 9303.0], [174.0, 9691.0], [173.0, 9791.0], [172.0, 9093.0], [171.0, 8970.0], [170.0, 9115.0], [169.0, 9614.0], [168.0, 9089.0], [183.0, 8922.0], [182.0, 9377.0], [181.0, 9430.0], [180.0, 9018.0], [179.0, 9120.0], [178.0, 9171.0], [176.0, 9480.0], [191.0, 9039.0], [190.0, 8976.0], [189.0, 9170.0], [188.0, 9335.0], [187.0, 9334.0], [186.0, 9638.0], [185.0, 9133.0], [184.0, 9257.0], [199.0, 8962.0], [198.0, 9347.0], [197.0, 8979.0], [196.0, 9252.0], [195.0, 9298.0], [194.0, 10154.0], [193.0, 9206.0], [192.0, 9712.0], [207.0, 9219.0], [206.0, 10001.0], [205.0, 9874.0], [204.0, 9042.0], [203.0, 9655.0], [202.0, 9175.0], [201.0, 8993.0], [200.0, 9034.0], [215.0, 10025.0], [214.0, 9350.0], [213.0, 9844.0], [212.0, 9155.0], [210.0, 9517.0], [209.0, 9603.0], [208.0, 9013.0], [223.0, 10192.0], [222.0, 9726.0], [221.0, 9639.0], [220.0, 9751.0], [219.0, 9683.0], [218.0, 9103.0], [217.0, 8939.0], [216.0, 9756.0], [231.0, 9277.0], [230.0, 9397.0], [229.0, 9292.0], [228.0, 9607.0], [227.0, 9226.0], [226.0, 9354.0], [225.0, 9448.0], [224.0, 9418.0], [239.0, 9909.0], [238.0, 9391.0], [236.0, 9120.0], [235.0, 9027.0], [234.0, 8852.0], [233.0, 10005.0], [232.0, 9813.0], [247.0, 8806.0], [246.0, 9160.0], [245.0, 9281.0], [244.0, 8941.0], [243.0, 8899.0], [242.0, 8973.0], [241.0, 9593.0], [240.0, 9178.0], [255.0, 9272.0], [254.0, 9351.0], [253.0, 9512.0], [252.0, 9920.0], [251.0, 8962.0], [250.0, 9917.0], [249.0, 9834.0], [248.0, 9201.0], [270.0, 9474.0], [271.0, 9212.0], [269.0, 9599.0], [268.0, 8830.0], [267.0, 9524.5], [265.0, 9653.0], [264.0, 8743.0], [263.0, 9024.0], [257.0, 9412.0], [256.0, 9071.0], [259.0, 8885.0], [258.0, 8849.0], [262.0, 9105.0], [261.0, 9499.0], [286.0, 9466.0], [287.0, 9039.0], [285.0, 9004.0], [284.0, 9279.0], [283.0, 9408.0], [282.0, 8890.0], [281.0, 10906.0], [280.0, 9045.0], [279.0, 9318.0], [273.0, 10604.0], [272.0, 8758.0], [275.0, 9956.0], [274.0, 9630.0], [278.0, 9907.0], [277.0, 8821.0], [276.0, 8890.0], [302.0, 9685.0], [303.0, 9854.0], [301.0, 9345.0], [300.0, 9610.0], [299.0, 9749.0], [298.0, 8661.0], [297.0, 8949.0], [296.0, 8672.0], [295.0, 9191.0], [289.0, 8734.0], [288.0, 9296.0], [291.0, 9519.0], [290.0, 9485.0], [294.0, 9714.0], [293.0, 8881.0], [292.0, 8897.0], [318.0, 9775.0], [319.0, 9426.0], [317.0, 8803.0], [316.0, 9513.0], [315.0, 9316.0], [314.0, 9684.0], [313.0, 9044.0], [312.0, 8719.0], [311.0, 9149.0], [305.0, 8764.0], [304.0, 9861.0], [307.0, 8808.0], [306.0, 10591.0], [310.0, 9137.0], [309.0, 8804.0], [308.0, 9406.0], [334.0, 10092.5], [335.0, 9396.0], [332.0, 9515.0], [323.0, 9164.0], [322.0, 9081.0], [321.0, 8614.0], [320.0, 9785.0], [331.0, 8943.0], [330.0, 8705.0], [329.0, 9116.0], [328.0, 9366.0], [327.0, 8837.0], [326.0, 9824.0], [325.0, 8890.0], [324.0, 9254.0], [350.0, 9005.0], [351.0, 8758.0], [349.0, 9657.0], [348.0, 8896.0], [347.0, 9242.0], [346.0, 9105.0], [345.0, 9297.0], [344.0, 9545.0], [343.0, 9561.0], [337.0, 9467.0], [336.0, 8596.0], [339.0, 9216.0], [338.0, 8827.0], [342.0, 9629.0], [341.0, 9283.0], [340.0, 9387.0], [366.0, 4890.5], [367.0, 3826.6666666666665], [365.0, 9705.0], [364.0, 9689.0], [363.0, 8998.0], [362.0, 8933.0], [361.0, 9406.0], [360.0, 8855.0], [359.0, 9443.0], [353.0, 9216.0], [352.0, 8697.0], [355.0, 9200.0], [354.0, 10639.0], [358.0, 8671.0], [357.0, 8928.0], [356.0, 9157.0], [382.0, 4957.0], [368.0, 2687.8], [377.0, 2254.3333333333335], [376.0, 4708.5], [374.0, 5066.5], [373.0, 8797.0], [372.0, 9206.0], [375.0, 8780.0], [378.0, 5050.5], [379.0, 9188.0], [383.0, 9173.0], [381.0, 9386.0], [380.0, 8731.0], [371.0, 8865.0], [370.0, 9589.0], [369.0, 9958.0], [398.0, 10242.0], [387.0, 5413.5], [388.0, 5170.0], [389.0, 9028.0], [391.0, 9417.0], [384.0, 8426.0], [386.0, 9058.0], [385.0, 8691.0], [390.0, 8733.0], [399.0, 8708.0], [397.0, 9347.0], [396.0, 8857.0], [395.0, 8984.0], [394.0, 8961.0], [393.0, 8773.0], [392.0, 8933.0], [414.0, 10471.0], [407.0, 4830.5], [400.0, 8492.0], [402.0, 10367.0], [401.0, 8759.0], [410.0, 1136.0], [413.0, 9043.0], [412.0, 8737.0], [411.0, 8912.5], [409.0, 9112.0], [408.0, 9158.0], [406.0, 8961.0], [405.0, 9340.0], [404.0, 9335.0], [430.0, 9035.0], [421.0, 4691.0], [420.0, 8882.0], [431.0, 5060.5], [429.0, 8419.0], [428.0, 8580.0], [426.0, 8349.0], [425.0, 8400.0], [424.0, 10765.0], [423.0, 9138.0], [417.0, 9043.0], [416.0, 9117.0], [419.0, 8286.0], [418.0, 9031.0], [422.0, 9210.0], [446.0, 9283.0], [447.0, 8689.0], [445.0, 10812.0], [444.0, 8788.0], [443.0, 9122.0], [442.0, 8155.0], [441.0, 9279.0], [440.0, 9110.0], [439.0, 8459.0], [433.0, 9165.0], [432.0, 9416.0], [435.0, 9347.0], [434.0, 9287.0], [438.0, 8783.0], [437.0, 10757.0], [436.0, 8402.0], [462.0, 9065.0], [463.0, 4868.0], [461.0, 9296.0], [460.0, 8877.0], [459.0, 8753.0], [458.0, 9510.0], [457.0, 8497.0], [456.0, 8995.0], [455.0, 9223.0], [449.0, 9629.0], [448.0, 8379.0], [451.0, 9190.0], [450.0, 9341.0], [454.0, 8175.0], [453.0, 9967.5], [477.0, 4386.0], [464.0, 5088.0], [465.0, 9042.0], [471.0, 8420.0], [470.0, 8396.0], [469.0, 8990.0], [468.0, 9007.0], [466.0, 3768.6666666666665], [467.0, 5061.0], [473.0, 6385.333333333333], [474.0, 3592.3333333333335], [479.0, 10323.0], [478.0, 10200.0], [476.0, 9009.0], [494.0, 10314.0], [480.0, 5414.0], [481.0, 10206.0], [483.0, 10432.0], [482.0, 9619.0], [484.0, 4820.0], [486.0, 8094.0], [485.0, 9311.0], [487.0, 5148.5], [489.0, 3117.25], [488.0, 4858.0], [490.0, 4929.0], [491.0, 8958.0], [495.0, 10172.0], [493.0, 10770.0], [492.0, 10440.0], [511.0, 8816.0], [498.0, 4867.0], [503.0, 5502.5], [497.0, 9541.0], [496.0, 9149.0], [502.0, 8373.0], [501.0, 7884.0], [500.0, 8044.0], [504.0, 5137.5], [505.0, 9273.0], [509.0, 4865.5], [510.0, 9158.0], [508.0, 8671.0], [499.0, 9478.0], [507.0, 9828.0], [506.0, 9013.0], [514.0, 8122.0], [512.0, 9450.0], [516.0, 9616.0], [518.0, 3643.6666666666665], [538.0, 8569.0], [540.0, 8730.0], [522.0, 5515.0], [524.0, 8009.0], [526.0, 10211.0], [530.0, 5028.0], [532.0, 8517.0], [534.0, 8069.0], [542.0, 1440.5], [528.0, 9191.0], [546.0, 8665.0], [550.0, 5495.0], [568.0, 8484.0], [570.0, 8074.0], [558.0, 5379.0], [556.0, 9156.0], [554.0, 9110.0], [552.0, 8491.0], [544.0, 8604.0], [548.0, 8440.0], [564.0, 8882.0], [562.0, 9023.0], [560.0, 7954.0], [566.0, 7868.0], [574.0, 8282.0], [572.0, 8402.0], [578.0, 5048.0], [580.0, 5162.5], [582.0, 8743.0], [600.0, 7902.0], [602.0, 8012.0], [604.0, 9242.0], [576.0, 8292.0], [590.0, 9721.0], [584.0, 9725.0], [586.0, 7954.0], [588.0, 4145.0], [592.0, 4545.0], [594.0, 8560.0], [596.0, 7678.0], [598.0, 8339.0], [606.0, 8389.0], [610.0, 7601.0], [634.0, 8304.0], [638.0, 4884.0], [608.0, 8386.0], [612.0, 8728.0], [614.0, 9562.0], [622.0, 8070.0], [620.0, 8547.0], [618.0, 7946.0], [616.0, 8341.0], [632.0, 8113.0], [628.0, 8306.0], [630.0, 8815.0], [626.0, 9286.0], [624.0, 7790.0], [636.0, 8216.0], [664.0, 9307.0], [668.0, 4788.0], [640.0, 5023.5], [648.0, 5077.5], [646.0, 8028.0], [644.0, 9084.0], [642.0, 9183.0], [666.0, 8150.0], [654.0, 7819.5], [650.0, 7936.0], [658.0, 5123.5], [662.0, 4852.5], [660.0, 9433.0], [656.0, 9158.0], [670.0, 8076.0], [674.0, 8243.0], [700.0, 8101.0], [672.0, 5325.0], [676.0, 8855.0], [686.0, 8119.0], [684.0, 8453.0], [682.0, 8647.0], [680.0, 9426.0], [678.0, 5223.0], [696.0, 4907.5], [688.0, 8459.0], [690.0, 7956.0], [692.0, 8366.0], [694.0, 8276.0], [702.0, 8112.0], [698.0, 9366.0], [718.0, 5899.5], [716.0, 6002.0], [714.0, 5368.5], [712.0, 5204.5], [728.0, 5351.5], [710.0, 3872.3333333333335], [708.0, 4201.666666666666], [706.0, 5447.5], [704.0, 8356.0], [722.0, 8190.0], [724.0, 4033.666666666667], [726.0, 5283.0], [734.0, 3410.75], [720.0, 6097.5], [732.0, 5351.5], [730.0, 5573.5], [738.0, 5280.5], [764.0, 4019.666666666667], [736.0, 4854.75], [740.0, 5865.5], [742.0, 4880.0], [760.0, 8695.5], [746.0, 5289.0], [744.0, 8731.0], [748.0, 4751.5], [750.0, 4344.0], [756.0, 8118.0], [754.0, 3595.0], [752.0, 8517.0], [766.0, 4243.333333333334], [758.0, 7980.0], [762.0, 3685.4], [774.0, 3895.6666666666665], [770.0, 1898.0], [792.0, 5249.5], [794.0, 4877.0], [796.0, 3356.0], [798.0, 5166.0], [776.0, 4160.0], [778.0, 7749.0], [780.0, 8143.0], [782.0, 4405.333333333334], [768.0, 4942.5], [784.0, 1902.3333333333333], [786.0, 4791.0], [788.0, 3995.0], [790.0, 5797.0], [804.0, 7320.0], [806.0, 5015.5], [802.0, 6281.333333333333], [800.0, 5020.0], [824.0, 6900.0], [826.0, 7319.0], [828.0, 6663.0], [814.0, 4479.5], [812.0, 7282.0], [810.0, 6928.0], [808.0, 8434.0], [830.0, 6890.0], [816.0, 7096.0], [818.0, 7282.0], [820.0, 6999.0], [822.0, 7797.0], [860.0, 7995.0], [848.0, 7295.0], [850.0, 8051.0], [852.0, 7956.0], [862.0, 8206.0], [858.0, 7580.0], [856.0, 7253.0], [832.0, 7025.0], [836.0, 6916.0], [838.0, 7656.0], [846.0, 7039.0], [844.0, 7049.0], [842.0, 7074.0], [854.0, 7269.0], [888.0, 7058.0], [892.0, 6789.0], [864.0, 5095.5], [878.0, 5073.5], [876.0, 8315.0], [874.0, 6632.0], [872.0, 6966.0], [880.0, 8035.0], [882.0, 7452.5], [894.0, 8182.0], [890.0, 7654.0], [870.0, 7490.0], [868.0, 7081.0], [866.0, 8140.0], [896.0, 7036.0], [924.0, 7194.0], [902.0, 5040.5], [900.0, 7863.0], [910.0, 6990.0], [908.0, 6710.0], [906.0, 6560.0], [904.0, 6772.0], [912.0, 7849.0], [914.0, 7677.0], [916.0, 6768.0], [918.0, 7114.0], [926.0, 7139.0], [922.0, 6673.0], [920.0, 7911.0], [956.0, 7193.0], [958.0, 7452.0], [946.0, 6316.0], [948.0, 7035.0], [952.0, 6491.0], [934.0, 7472.0], [932.0, 7784.0], [930.0, 6764.0], [928.0, 7307.0], [942.0, 6298.0], [940.0, 6520.0], [938.0, 6599.0], [936.0, 6625.0], [950.0, 7734.0], [984.0, 3647.333333333333], [976.0, 4323.5], [960.0, 4964.0], [962.0, 3911.0], [964.0, 7159.0], [966.0, 7023.0], [986.0, 6924.0], [988.0, 3919.5], [990.0, 7294.0], [972.0, 6471.0], [970.0, 6441.0], [968.0, 7564.0], [974.0, 3941.333333333333], [982.0, 7311.0], [980.0, 3918.333333333333], [978.0, 4157.0], [998.0, 6277.0], [1018.0, 2918.285714285714], [992.0, 4750.0], [994.0, 3398.333333333333], [996.0, 6628.0], [1020.0, 4536.0], [1022.0, 1798.0], [1016.0, 3181.75], [1002.0, 7319.0], [1000.0, 6954.0], [1004.0, 7252.0], [1006.0, 4244.0], [1010.0, 7055.0], [1008.0, 3286.2], [1012.0, 4511.0], [1014.0, 3119.25], [1032.0, 7768.0], [1028.0, 4420.5], [1024.0, 6552.0], [1052.0, 4739.5], [1036.0, 3833.666666666667], [1080.0, 3405.8], [1076.0, 6787.0], [1072.0, 6288.0], [1084.0, 4087.5], [1056.0, 7000.0], [1060.0, 3913.0], [1064.0, 4294.5], [1068.0, 6626.0], [1048.0, 6948.0], [1044.0, 7168.0], [1040.0, 7453.0], [1092.0, 4414.0], [1096.0, 4840.5], [1112.0, 3731.75], [1116.0, 4293.0], [1088.0, 7062.0], [1108.0, 4043.666666666667], [1104.0, 4587.0], [1100.0, 6090.0], [1136.0, 6785.0], [1144.0, 6904.0], [1120.0, 6960.0], [1148.0, 5826.0], [1132.0, 4969.5], [1128.0, 6949.0], [1124.0, 4630.0], [1160.0, 5855.0], [1200.0, 3939.5], [1152.0, 4112.333333333333], [1180.0, 6685.0], [1156.0, 6449.0], [1164.0, 6141.0], [1208.0, 4485.333333333333], [1204.0, 7627.0], [1184.0, 5743.0], [1212.0, 6436.0], [1188.0, 3906.333333333333], [1192.0, 4262.0], [1196.0, 5777.0], [1172.0, 4058.0], [1168.0, 6233.0], [1176.0, 7718.0], [1216.0, 7474.0], [1228.0, 4350.333333333333], [1244.0, 5907.0], [1236.0, 3704.0], [1240.0, 4117.75], [1220.0, 5742.0], [1224.0, 4307.5], [1232.0, 3709.25], [1268.0, 4519.666666666667], [1264.0, 5542.0], [1272.0, 2698.0], [1276.0, 2812.3333333333335], [1248.0, 3505.666666666667], [1252.0, 6251.0], [1256.0, 5744.0], [1260.0, 6959.0], [1328.0, 6114.0], [1284.0, 6240.076923076923], [1288.0, 6238.0], [1308.0, 7069.0], [1304.0, 7092.0], [1292.0, 4596.0], [1316.0, 4154.0], [1320.0, 7067.0], [1324.0, 5103.5], [1312.0, 5256.5], [1336.0, 4009.0], [1340.0, 5037.0], [1332.0, 4925.0], [1296.0, 4340.0], [1300.0, 3414.0], [1356.0, 3711.0], [1344.0, 4295.0], [1372.0, 4709.5], [1368.0, 5408.5], [1348.0, 5377.0], [1392.0, 6181.0], [1380.0, 5863.5], [1376.0, 6025.0], [1404.0, 6481.0], [1396.0, 3764.3333333333335], [1400.0, 6633.0], [1388.0, 4807.0], [1384.0, 6757.0], [1360.0, 6875.0], [1364.0, 6799.0], [1412.0, 3617.8], [1456.0, 4305.5], [1408.0, 4310.0], [1428.0, 4689.5], [1432.0, 5913.0], [1436.0, 6279.0], [1420.0, 3867.0], [1416.0, 6570.0], [1460.0, 6454.0], [1464.0, 6215.5], [1440.0, 3961.5], [1468.0, 6113.0], [1444.0, 5563.0], [1448.0, 6355.0], [1452.0, 5843.0], [1424.0, 3806.6666666666665], [1472.0, 4603.0], [1476.0, 3984.333333333333], [1496.0, 4182.666666666667], [1500.0, 4681.5], [1492.0, 6284.0], [1488.0, 5931.0], [1480.0, 4464.5], [1508.0, 4719.5], [1516.0, 5390.0], [1512.0, 6183.0], [1504.0, 5790.0], [1532.0, 4405.0], [1528.0, 4858.5], [1520.0, 4948.0], [1524.0, 4942.0], [1484.0, 4310.333333333333], [1548.0, 4566.5], [1544.0, 5261.0], [1564.0, 5854.0], [1540.0, 3860.5], [1536.0, 5101.0], [1596.0, 4552.666666666667], [1568.0, 5891.0], [1592.0, 4946.0], [1588.0, 5077.0], [1584.0, 5540.0], [1576.0, 4171.0], [1580.0, 5014.666666666667], [1572.0, 3356.0], [1552.0, 4439.0], [1556.0, 5962.0], [1648.0, 4706.0], [1600.0, 4326.5], [1604.0, 5711.0], [1628.0, 5614.0], [1624.0, 4421.666666666667], [1660.0, 4025.6666666666665], [1656.0, 4558.0], [1652.0, 4933.0], [1612.0, 4902.0], [1608.0, 5657.0], [1632.0, 4105.5], [1644.0, 3619.6666666666665], [1640.0, 4798.0], [1636.0, 4481.5], [1616.0, 5317.5], [1620.0, 4778.0], [1676.0, 5258.0], [1664.0, 4705.5], [1668.0, 5001.0], [1672.0, 4268.666666666667], [1712.0, 4777.0], [1716.0, 4152.0], [1720.0, 4060.0], [1724.0, 5068.0], [1708.0, 4434.0], [1696.0, 4447.666666666667], [1700.0, 4903.0], [1704.0, 5198.0], [1680.0, 3911.0], [1684.0, 4586.0], [1688.0, 4439.0], [1692.0, 4431.0], [1736.0, 4312.5], [1784.0, 3729.25], [1732.0, 4833.0], [1728.0, 4601.0], [1752.0, 4984.0], [1756.0, 4390.0], [1740.0, 5041.0], [1760.0, 3850.6666666666665], [1788.0, 3945.5], [1780.0, 4089.0], [1776.0, 3556.0], [1768.0, 4634.0], [1764.0, 4510.0], [1772.0, 4210.0], [1744.0, 4500.0], [1748.0, 5138.0], [1804.0, 4264.0], [1792.0, 4039.0], [1796.0, 3918.0], [1800.0, 5116.0], [1808.0, 4534.0], [1824.0, 4014.3333333333335], [1852.0, 4501.5], [1848.0, 3936.5], [1840.0, 4311.5], [1844.0, 4040.0], [1828.0, 3542.5], [1832.0, 5037.5], [1836.0, 4330.0], [1816.0, 4894.0], [1812.0, 4676.0], [1820.0, 4165.0], [1856.0, 4464.0], [1912.0, 3548.0], [1884.0, 4399.0], [1880.0, 4128.0], [1876.0, 4318.0], [1872.0, 4088.0], [1860.0, 4395.0], [1864.0, 4339.0], [1888.0, 3744.0], [1892.0, 4342.0], [1896.0, 4912.0], [1900.0, 4315.0], [1916.0, 4270.0], [1904.0, 3965.0], [1868.0, 4222.0], [1952.0, 4097.0], [1964.0, 4156.0], [1960.0, 4162.0], [1956.0, 5337.0], [1932.0, 3760.5], [1928.0, 4063.0], [1924.0, 4217.0], [1920.0, 5301.0], [1948.0, 4134.0], [1944.0, 4200.0], [1940.0, 3368.0], [1033.0, 6521.0], [1025.0, 6150.0], [1053.0, 7214.0], [1029.0, 4180.5], [1037.0, 3455.0], [1077.0, 6704.0], [1073.0, 6606.0], [1081.0, 5897.0], [1085.0, 6386.0], [1065.0, 4550.666666666667], [1069.0, 6766.0], [1061.0, 3514.333333333333], [1057.0, 4837.0], [1045.0, 4470.5], [1041.0, 7287.0], [1049.0, 7057.0], [1089.0, 6815.0], [1101.0, 5287.0], [1117.0, 4756.0], [1113.0, 6011.0], [1109.0, 3935.5], [1105.0, 6530.0], [1093.0, 5349.5], [1097.0, 4092.0], [1137.0, 5829.0], [1141.0, 7302.0], [1125.0, 4958.5], [1121.0, 6359.0], [1149.0, 6276.0], [1145.0, 6180.0], [1129.0, 3705.2], [1133.0, 6157.0], [1201.0, 4291.5], [1205.0, 3966.25], [1153.0, 3860.3333333333335], [1161.0, 4518.5], [1157.0, 6345.0], [1165.0, 6067.0], [1209.0, 4254.0], [1213.0, 6317.0], [1185.0, 3715.0], [1189.0, 3398.25], [1193.0, 4288.5], [1197.0, 6324.0], [1169.0, 3755.333333333333], [1173.0, 7176.0], [1177.0, 4362.5], [1181.0, 6572.0], [1221.0, 6346.0], [1217.0, 5711.0], [1225.0, 5518.0], [1229.0, 6943.0], [1245.0, 5236.0], [1241.0, 7120.0], [1237.0, 5157.5], [1269.0, 2601.0], [1277.0, 2467.0], [1249.0, 7180.0], [1265.0, 7284.0], [1253.0, 5453.0], [1257.0, 4236.0], [1261.0, 4927.0], [1233.0, 3467.666666666667], [1313.0, 4011.75], [1333.0, 4098.75], [1285.0, 4820.833333333334], [1293.0, 4446.5], [1325.0, 3960.5], [1321.0, 7051.0], [1317.0, 7066.0], [1341.0, 5551.0], [1337.0, 6989.0], [1329.0, 4855.5], [1305.0, 4697.0], [1301.0, 5705.0], [1297.0, 6742.0], [1309.0, 6369.0], [1353.0, 6299.5], [1345.0, 6950.0], [1349.0, 4910.0], [1373.0, 5970.0], [1369.0, 6029.0], [1357.0, 5065.25], [1393.0, 5821.0], [1405.0, 6653.0], [1397.0, 5211.0], [1401.0, 6615.0], [1385.0, 6766.0], [1389.0, 6644.0], [1361.0, 5948.0], [1365.0, 6014.0], [1421.0, 4106.75], [1417.0, 6571.0], [1413.0, 6607.0], [1409.0, 5441.0], [1437.0, 4092.666666666667], [1429.0, 5280.5], [1457.0, 6097.0], [1465.0, 6421.0], [1469.0, 3992.0], [1449.0, 4021.0], [1441.0, 6077.0], [1445.0, 5512.0], [1453.0, 4800.0], [1425.0, 3933.6666666666665], [1473.0, 5844.0], [1485.0, 4290.0], [1501.0, 6127.0], [1497.0, 6235.0], [1489.0, 6040.0], [1493.0, 4210.5], [1477.0, 4126.0], [1481.0, 3903.3333333333335], [1509.0, 5288.0], [1513.0, 4639.5], [1517.0, 5854.0], [1505.0, 4594.0], [1533.0, 4371.0], [1529.0, 4192.0], [1525.0, 4519.0], [1521.0, 6175.0], [1541.0, 5460.0], [1537.0, 4394.0], [1565.0, 4152.666666666667], [1561.0, 4944.75], [1545.0, 4402.0], [1549.0, 5202.0], [1585.0, 4571.5], [1589.0, 4307.0], [1593.0, 5751.0], [1597.0, 4294.0], [1573.0, 4549.5], [1569.0, 5207.0], [1577.0, 4231.666666666667], [1581.0, 4422.5], [1557.0, 4856.5], [1553.0, 5939.0], [1601.0, 5773.0], [1609.0, 5739.0], [1621.0, 4384.5], [1625.0, 5611.0], [1629.0, 4860.0], [1605.0, 4485.5], [1613.0, 4084.0], [1657.0, 4078.5], [1649.0, 5529.0], [1661.0, 4239.5], [1633.0, 4911.0], [1637.0, 4088.3333333333335], [1641.0, 4935.0], [1645.0, 5119.0], [1617.0, 5180.0], [1677.0, 4076.0], [1713.0, 4123.333333333333], [1669.0, 5354.0], [1665.0, 4632.0], [1673.0, 4111.0], [1717.0, 4425.0], [1721.0, 4100.8], [1725.0, 5088.0], [1697.0, 3872.3333333333335], [1701.0, 5215.0], [1705.0, 5138.0], [1681.0, 4732.666666666667], [1693.0, 4428.0], [1685.0, 4540.5], [1689.0, 5295.0], [1737.0, 4359.0], [1785.0, 3634.0], [1733.0, 4350.0], [1729.0, 4732.0], [1753.0, 3842.8], [1757.0, 4190.5], [1741.0, 3746.0], [1789.0, 4152.666666666667], [1781.0, 3639.5], [1777.0, 4010.5], [1761.0, 4761.666666666667], [1769.0, 4144.0], [1765.0, 4903.0], [1773.0, 5546.0], [1745.0, 4784.0], [1749.0, 3822.714285714286], [1841.0, 4484.0], [1801.0, 4222.0], [1797.0, 4482.0], [1805.0, 4254.0], [1809.0, 3603.0], [1825.0, 4150.0], [1853.0, 4432.0], [1849.0, 4244.0], [1845.0, 3843.5], [1829.0, 4589.0], [1833.0, 4617.0], [1837.0, 4583.0], [1813.0, 3920.0], [1817.0, 4527.0], [1861.0, 3689.0], [1857.0, 4473.0], [1885.0, 3840.0], [1881.0, 3630.0], [1877.0, 4445.0], [1873.0, 3860.0], [1865.0, 3940.5], [1889.0, 4200.0], [1893.0, 4210.0], [1897.0, 4311.0], [1901.0, 5333.0], [1917.0, 4994.0], [1913.0, 6398.0], [1909.0, 4743.0], [1905.0, 4239.0], [1869.0, 4176.0], [1953.0, 4155.0], [1965.0, 4170.0], [1961.0, 4099.0], [1957.0, 5086.0], [1933.0, 4229.0], [1929.0, 4205.0], [1925.0, 4191.0], [1921.0, 4208.0], [1949.0, 5134.0], [1945.0, 4170.0], [1941.0, 4177.0], [1937.0, 4514.5], [517.0, 4641.5], [541.0, 3949.3333333333335], [515.0, 5292.5], [513.0, 8681.0], [519.0, 7892.0], [537.0, 8427.5], [539.0, 10042.0], [521.0, 9098.0], [523.0, 8205.0], [525.0, 10144.0], [527.0, 8334.0], [531.0, 5006.5], [533.0, 4562.5], [535.0, 8582.0], [543.0, 9480.5], [529.0, 10384.0], [549.0, 4674.5], [573.0, 9511.0], [551.0, 10133.0], [569.0, 9328.0], [557.0, 9532.0], [555.0, 7763.0], [553.0, 8736.0], [559.0, 9294.0], [545.0, 10123.0], [547.0, 9369.0], [565.0, 4408.0], [563.0, 8487.0], [561.0, 7631.0], [567.0, 8484.0], [575.0, 5382.5], [571.0, 8372.0], [581.0, 9185.0], [605.0, 9316.0], [579.0, 3454.6666666666665], [583.0, 7751.0], [601.0, 7973.0], [603.0, 9049.0], [577.0, 8650.0], [591.0, 9393.0], [589.0, 8188.0], [585.0, 4753.5], [587.0, 8635.0], [593.0, 8272.0], [595.0, 9833.0], [597.0, 8081.0], [599.0, 8905.0], [607.0, 8696.0], [609.0, 7482.0], [623.0, 3802.0], [611.0, 8912.0], [613.0, 7920.0], [615.0, 8631.0], [621.0, 7196.0], [619.0, 9106.0], [617.0, 9538.0], [633.0, 8610.0], [627.0, 5105.0], [629.0, 5328.5], [631.0, 9614.0], [639.0, 8038.0], [637.0, 9882.0], [635.0, 9796.0], [641.0, 7717.0], [647.0, 4496.5], [645.0, 8113.0], [643.0, 8879.0], [665.0, 8173.0], [667.0, 9307.0], [649.0, 5378.5], [655.0, 9427.0], [653.0, 9677.0], [651.0, 9015.0], [661.0, 7421.0], [659.0, 9511.0], [663.0, 8062.0], [671.0, 8982.0], [657.0, 7862.0], [675.0, 7510.0], [679.0, 5507.0], [673.0, 8671.0], [687.0, 8424.0], [685.0, 8384.0], [683.0, 8446.0], [681.0, 8295.0], [677.0, 5685.0], [697.0, 4921.5], [703.0, 8505.0], [689.0, 8269.0], [691.0, 9162.0], [693.0, 8419.0], [695.0, 9050.0], [701.0, 7910.0], [699.0, 7719.0], [709.0, 8541.0], [729.0, 5059.0], [733.0, 3586.333333333333], [717.0, 3804.3333333333335], [715.0, 4954.5], [713.0, 4978.5], [711.0, 5609.5], [705.0, 8440.0], [707.0, 8514.0], [719.0, 5828.0], [721.0, 4030.0], [723.0, 3462.0], [725.0, 4854.0], [727.0, 4799.5], [735.0, 2514.0], [731.0, 5459.5], [739.0, 4238.5], [743.0, 4853.5], [737.0, 4910.5], [741.0, 5231.5], [761.0, 3642.25], [747.0, 4117.0], [745.0, 4054.333333333333], [749.0, 7886.0], [751.0, 5616.0], [755.0, 4511.5], [757.0, 9194.0], [753.0, 3468.5], [765.0, 3857.0], [767.0, 4320.333333333334], [759.0, 1911.0], [763.0, 3141.0], [773.0, 5842.333333333333], [771.0, 6059.333333333333], [775.0, 4400.333333333333], [795.0, 4976.5], [793.0, 4972.0], [799.0, 4036.6666666666665], [797.0, 7872.0], [777.0, 4140.333333333333], [781.0, 3053.25], [779.0, 3750.0], [783.0, 4539.666666666666], [769.0, 5599.5], [785.0, 4756.2], [789.0, 3940.6666666666665], [791.0, 4052.666666666667], [787.0, 4134.333333333334], [801.0, 2675.0], [827.0, 8281.0], [803.0, 3678.75], [805.0, 7825.0], [807.0, 2976.5714285714284], [825.0, 7244.0], [813.0, 7363.0], [811.0, 7149.0], [809.0, 7201.0], [815.0, 7299.0], [817.0, 7841.0], [819.0, 7995.0], [821.0, 7228.0], [823.0, 7770.0], [829.0, 7286.0], [861.0, 8424.0], [863.0, 7782.0], [849.0, 8314.0], [851.0, 7152.0], [853.0, 8168.0], [859.0, 8374.0], [857.0, 8048.0], [847.0, 6973.0], [835.0, 7274.5], [833.0, 7006.0], [837.0, 7150.0], [839.0, 8381.0], [845.0, 7101.0], [843.0, 7132.0], [841.0, 7719.5], [855.0, 7038.0], [879.0, 7148.0], [877.0, 7470.0], [875.0, 7685.0], [873.0, 7235.0], [895.0, 7235.0], [883.0, 7678.0], [887.0, 6998.0], [885.0, 7866.5], [893.0, 6784.0], [891.0, 8049.0], [889.0, 7308.0], [871.0, 7911.0], [869.0, 8147.0], [867.0, 6903.0], [865.0, 6886.0], [897.0, 8062.0], [903.0, 4548.0], [901.0, 6938.0], [899.0, 8001.0], [911.0, 6469.0], [909.0, 6794.0], [907.0, 7407.0], [905.0, 7109.0], [927.0, 8031.0], [913.0, 7830.0], [915.0, 7288.0], [917.0, 6749.0], [919.0, 7952.0], [925.0, 6737.0], [923.0, 6587.0], [921.0, 7085.0], [955.0, 7326.5], [953.0, 7088.0], [959.0, 7806.0], [945.0, 7020.5], [947.0, 6908.0], [949.0, 7052.0], [957.0, 7030.0], [935.0, 7219.0], [933.0, 6858.0], [931.0, 7086.0], [929.0, 7712.0], [943.0, 7283.0], [941.0, 6493.0], [939.0, 7227.0], [937.0, 7828.0], [951.0, 6919.0], [965.0, 6453.0], [961.0, 7879.0], [967.0, 7051.0], [985.0, 3554.666666666667], [987.0, 2886.4], [989.0, 4604.0], [991.0, 3572.666666666667], [973.0, 4779.0], [971.0, 6679.0], [969.0, 6363.0], [975.0, 4432.5], [979.0, 3065.5], [981.0, 3727.666666666667], [983.0, 3523.333333333333], [977.0, 4680.5], [999.0, 6247.0], [993.0, 4155.0], [995.0, 6813.0], [997.0, 6032.0], [1017.0, 2787.4], [1019.0, 3518.75], [1023.0, 7705.0], [1021.0, 4563.5], [1003.0, 3436.0], [1001.0, 6498.0], [1007.0, 4114.0], [1005.0, 6916.0], [1009.0, 3076.0], [1011.0, 3180.0], [1015.0, 4897.5], [1013.0, 4393.5], [1034.0, 6420.0], [1038.0, 3163.0], [1026.0, 3512.25], [1054.0, 4398.0], [1030.0, 7460.0], [1078.0, 7224.0], [1074.0, 6678.0], [1082.0, 6536.0], [1058.0, 3458.666666666667], [1086.0, 7061.0], [1062.0, 4434.0], [1070.0, 4399.0], [1066.0, 7124.0], [1050.0, 2417.3333333333335], [1046.0, 6506.0], [1042.0, 6664.0], [1098.0, 8131.0], [1094.0, 5030.5], [1090.0, 7984.0], [1110.0, 3973.0], [1106.0, 4730.0], [1102.0, 3813.0], [1138.0, 7658.0], [1142.0, 3125.2], [1146.0, 4289.666666666667], [1150.0, 5910.0], [1122.0, 4314.5], [1130.0, 6317.0], [1134.0, 6392.0], [1126.0, 4295.0], [1162.0, 6509.0], [1154.0, 3469.75], [1182.0, 6190.0], [1158.0, 4930.0], [1166.0, 6151.0], [1206.0, 6736.0], [1202.0, 5604.0], [1210.0, 4599.5], [1214.0, 4591.5], [1186.0, 3137.3999999999996], [1190.0, 5711.0], [1198.0, 4421.0], [1194.0, 6417.0], [1170.0, 7803.0], [1174.0, 5731.0], [1178.0, 3954.666666666667], [1222.0, 3990.75], [1218.0, 3894.0], [1246.0, 3845.0], [1242.0, 5435.0], [1238.0, 3762.666666666667], [1234.0, 4692.5], [1226.0, 4475.5], [1266.0, 6475.0], [1230.0, 5842.0], [1254.0, 4943.0], [1250.0, 5521.0], [1258.0, 6796.0], [1262.0, 6427.0], [1290.0, 6285.5], [1330.0, 4116.333333333333], [1342.0, 4362.5], [1294.0, 4180.5], [1286.0, 3831.0], [1310.0, 5487.0], [1306.0, 5359.0], [1302.0, 5959.0], [1314.0, 4058.666666666667], [1318.0, 7007.0], [1322.0, 7045.0], [1326.0, 4591.5], [1338.0, 3287.6], [1334.0, 6924.0], [1298.0, 5587.0], [1350.0, 4113.5], [1354.0, 6499.0], [1374.0, 6824.0], [1370.0, 3878.3333333333335], [1366.0, 3782.2], [1346.0, 3279.6666666666665], [1358.0, 3881.5], [1394.0, 4692.0], [1382.0, 5269.333333333333], [1406.0, 6030.0], [1378.0, 6606.5], [1402.0, 4420.0], [1398.0, 6603.0], [1386.0, 6419.0], [1390.0, 6782.0], [1362.0, 4639.0], [1438.0, 4260.0], [1426.0, 4187.0], [1430.0, 6242.0], [1434.0, 5410.0], [1418.0, 4697.0], [1414.0, 5098.0], [1422.0, 4207.333333333333], [1458.0, 5032.5], [1462.0, 6247.0], [1466.0, 4772.0], [1442.0, 3508.0], [1446.0, 6466.0], [1450.0, 6334.0], [1454.0, 4450.0], [1478.0, 4069.666666666667], [1486.0, 4002.3333333333335], [1498.0, 5361.0], [1502.0, 6214.0], [1494.0, 4236.666666666667], [1490.0, 6328.0], [1474.0, 4330.0], [1482.0, 4507.666666666667], [1518.0, 6032.0], [1514.0, 5612.0], [1510.0, 6159.0], [1534.0, 4387.0], [1506.0, 6020.0], [1530.0, 4371.5], [1526.0, 5256.5], [1522.0, 6135.0], [1542.0, 5294.0], [1566.0, 4302.5], [1562.0, 4164.333333333333], [1538.0, 5269.0], [1546.0, 3895.5], [1598.0, 4176.333333333333], [1594.0, 5028.5], [1590.0, 5766.0], [1586.0, 4979.0], [1550.0, 5958.0], [1570.0, 4936.5], [1578.0, 4503.0], [1582.0, 5205.0], [1574.0, 5382.0], [1554.0, 5537.0], [1558.0, 4480.333333333333], [1650.0, 5477.0], [1654.0, 5124.5], [1606.0, 4138.666666666667], [1602.0, 5027.0], [1630.0, 5185.0], [1626.0, 4547.0], [1662.0, 4838.5], [1658.0, 5081.0], [1614.0, 4913.0], [1610.0, 5671.0], [1638.0, 5123.5], [1646.0, 5528.0], [1642.0, 3728.3333333333335], [1634.0, 4844.0], [1618.0, 5032.0], [1622.0, 4730.0], [1678.0, 5063.0], [1674.0, 5086.0], [1666.0, 5459.0], [1670.0, 4623.75], [1714.0, 5155.0], [1718.0, 4300.0], [1722.0, 4758.0], [1726.0, 3851.5], [1706.0, 5054.5], [1710.0, 4750.5], [1698.0, 4734.0], [1702.0, 5169.0], [1682.0, 3677.0], [1686.0, 3322.4], [1690.0, 4771.0], [1694.0, 4469.5], [1742.0, 4596.0], [1734.0, 4647.0], [1730.0, 5116.0], [1758.0, 4316.0], [1754.0, 4969.0], [1786.0, 4725.0], [1790.0, 6172.0], [1778.0, 4086.0], [1782.0, 5353.0], [1766.0, 5604.0], [1762.0, 4126.0], [1770.0, 4514.0], [1774.0, 4001.0], [1746.0, 4222.5], [1750.0, 5129.0], [1806.0, 4735.0], [1794.0, 4369.333333333333], [1798.0, 3999.0], [1802.0, 3835.0], [1854.0, 4177.0], [1850.0, 3993.0], [1842.0, 3783.0], [1846.0, 3967.0], [1826.0, 3794.5], [1830.0, 4141.0], [1834.0, 4479.5], [1838.0, 4196.0], [1810.0, 4078.25], [1814.0, 4001.0], [1822.0, 4674.0], [1862.0, 4886.0], [1866.0, 4444.0], [1858.0, 4349.0], [1886.0, 3887.0], [1882.0, 3965.0], [1878.0, 4274.0], [1890.0, 3883.0], [1894.0, 4279.0], [1898.0, 5286.0], [1902.0, 4246.0], [1918.0, 5342.0], [1914.0, 4251.0], [1910.0, 6375.0], [1906.0, 3689.0], [1870.0, 4386.0], [1954.0, 4203.0], [1966.0, 4053.0], [1962.0, 4137.0], [1958.0, 4175.0], [1926.0, 4900.0], [1922.0, 4134.0], [1950.0, 4177.0], [1942.0, 4232.0], [1938.0, 4030.0], [1035.0, 7477.0], [1039.0, 3133.6666666666665], [1051.0, 5838.333333333333], [1055.0, 6485.0], [1027.0, 7030.0], [1031.0, 6287.0], [1079.0, 4727.0], [1075.0, 6337.0], [1083.0, 4276.0], [1087.0, 4593.5], [1063.0, 3935.5], [1067.0, 6679.0], [1071.0, 3226.4], [1059.0, 6203.0], [1043.0, 7213.0], [1047.0, 6235.0], [1095.0, 6712.0], [1119.0, 5302.0], [1091.0, 4381.0], [1115.0, 6253.5], [1111.0, 3448.333333333333], [1107.0, 4609.0], [1099.0, 8065.0], [1103.0, 4564.333333333333], [1139.0, 6492.0], [1143.0, 4686.0], [1151.0, 6608.0], [1123.0, 5716.0], [1147.0, 6395.0], [1131.0, 4274.5], [1135.0, 6690.0], [1127.0, 4344.0], [1167.0, 4600.0], [1163.0, 4522.5], [1155.0, 4370.5], [1159.0, 7821.0], [1203.0, 5226.0], [1207.0, 4423.0], [1215.0, 3266.75], [1211.0, 7512.0], [1187.0, 3425.4], [1191.0, 6245.0], [1195.0, 4023.0], [1199.0, 3613.5], [1171.0, 5886.0], [1175.0, 6770.0], [1179.0, 3645.0], [1183.0, 6543.0], [1223.0, 5704.0], [1231.0, 4864.0], [1219.0, 4450.5], [1227.0, 5910.0], [1247.0, 5212.0], [1243.0, 6136.0], [1239.0, 4162.0], [1235.0, 4498.5], [1275.0, 3433.3333333333335], [1251.0, 5732.0], [1267.0, 3884.0], [1255.0, 5689.0], [1259.0, 6848.0], [1263.0, 6079.0], [1343.0, 4092.0], [1287.0, 6616.0], [1291.0, 4271.666666666667], [1295.0, 5644.0], [1315.0, 3870.5], [1323.0, 6475.0], [1319.0, 5677.0], [1327.0, 4766.0], [1339.0, 4543.5], [1335.0, 3878.333333333333], [1331.0, 4928.0], [1303.0, 6589.0], [1299.0, 7084.0], [1307.0, 6493.0], [1311.0, 5804.0], [1351.0, 4168.5], [1395.0, 3964.3333333333335], [1367.0, 4430.333333333333], [1375.0, 6790.0], [1347.0, 5893.0], [1371.0, 6200.0], [1355.0, 6895.0], [1359.0, 6824.0], [1407.0, 4378.0], [1403.0, 4623.0], [1399.0, 5811.0], [1387.0, 4392.333333333333], [1383.0, 4663.0], [1391.0, 6183.0], [1363.0, 4171.333333333333], [1415.0, 6082.0], [1419.0, 4654.5], [1411.0, 4564.75], [1439.0, 6467.0], [1435.0, 5315.5], [1431.0, 6576.0], [1427.0, 3807.5], [1423.0, 5837.0], [1459.0, 6428.0], [1467.0, 6446.0], [1451.0, 6034.0], [1471.0, 6117.0], [1443.0, 5962.5], [1447.0, 6460.0], [1455.0, 3915.6666666666665], [1479.0, 4062.6666666666665], [1475.0, 4487.5], [1503.0, 4308.5], [1499.0, 6186.0], [1495.0, 4679.333333333333], [1491.0, 4532.5], [1511.0, 5446.0], [1515.0, 5167.0], [1519.0, 6158.0], [1507.0, 3822.0], [1535.0, 5219.0], [1531.0, 5125.5], [1527.0, 3770.285714285714], [1523.0, 5407.0], [1487.0, 5847.0], [1483.0, 5163.5], [1543.0, 4060.0], [1563.0, 5188.0], [1567.0, 5368.0], [1559.0, 5228.0], [1539.0, 4521.333333333333], [1547.0, 4305.0], [1551.0, 4593.0], [1587.0, 5005.0], [1591.0, 4377.666666666667], [1595.0, 4617.0], [1599.0, 4343.0], [1571.0, 5815.0], [1575.0, 4497.0], [1583.0, 5845.0], [1555.0, 5328.0], [1607.0, 3743.0], [1611.0, 4353.5], [1603.0, 4479.666666666667], [1619.0, 4723.5], [1623.0, 5157.0], [1627.0, 4943.0], [1631.0, 5553.0], [1655.0, 4556.0], [1651.0, 4676.0], [1615.0, 5703.0], [1659.0, 5407.0], [1663.0, 3637.5], [1635.0, 5582.0], [1639.0, 5002.0], [1643.0, 5481.0], [1647.0, 5463.0], [1679.0, 4568.0], [1671.0, 4430.666666666667], [1667.0, 5383.0], [1675.0, 5341.0], [1715.0, 4015.5], [1719.0, 4471.0], [1727.0, 4959.5], [1723.0, 4810.0], [1699.0, 4771.0], [1703.0, 4494.0], [1711.0, 4582.0], [1707.0, 5219.0], [1683.0, 3896.0], [1695.0, 4385.0], [1687.0, 4945.0], [1691.0, 5279.0], [1735.0, 4439.0], [1739.0, 3665.142857142857], [1731.0, 4280.0], [1751.0, 3777.6666666666665], [1759.0, 3966.0], [1755.0, 4518.0], [1743.0, 4446.5], [1791.0, 4405.666666666667], [1787.0, 4881.0], [1779.0, 4563.0], [1783.0, 4346.0], [1767.0, 4372.0], [1763.0, 4085.0], [1771.0, 3694.5], [1775.0, 4423.0], [1747.0, 3598.6666666666665], [1807.0, 4180.0], [1795.0, 3851.0], [1799.0, 4816.0], [1803.0, 4479.0], [1855.0, 4926.5], [1851.0, 5627.0], [1847.0, 4234.0], [1843.0, 4231.0], [1827.0, 4155.333333333333], [1835.0, 4206.5], [1839.0, 3353.5], [1831.0, 4321.0], [1815.0, 4700.0], [1811.0, 4029.0], [1819.0, 4439.0], [1823.0, 4221.0], [1867.0, 4430.5], [1859.0, 3976.5], [1887.0, 4340.0], [1883.0, 4354.0], [1879.0, 4105.0], [1875.0, 4121.0], [1919.0, 4271.0], [1891.0, 4297.0], [1895.0, 3651.0], [1899.0, 4284.0], [1903.0, 6358.0], [1915.0, 4209.0], [1911.0, 3817.0], [1907.0, 4255.0], [1871.0, 3657.0], [1935.0, 4801.5], [1959.0, 4211.0], [1963.0, 4204.0], [1955.0, 3996.0], [1931.0, 5361.0], [1927.0, 4195.0], [1923.0, 4264.0], [1951.0, 4819.0], [1947.0, 4562.0], [1943.0, 6338.0], [1939.0, 4033.0], [1.0, 10035.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1035.336999999999, 5619.493666666662]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1966.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12700.0, "minX": 1.54958358E12, "maxY": 20998.366666666665, "series": [{"data": [[1.54958358E12, 20998.366666666665]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958358E12, 12700.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 5619.493666666662, "minX": 1.54958358E12, "maxY": 5619.493666666662, "series": [{"data": [[1.54958358E12, 5619.493666666662]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958358E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 5619.485666666674, "minX": 1.54958358E12, "maxY": 5619.485666666674, "series": [{"data": [[1.54958358E12, 5619.485666666674]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958358E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 74.05200000000015, "minX": 1.54958358E12, "maxY": 74.05200000000015, "series": [{"data": [[1.54958358E12, 74.05200000000015]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958358E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 165.0, "minX": 1.54958358E12, "maxY": 11503.0, "series": [{"data": [[1.54958358E12, 11503.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958358E12, 165.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958358E12, 9294.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958358E12, 10161.919999999998]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958358E12, 9629.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 5651.0, "minX": 50.0, "maxY": 5651.0, "series": [{"data": [[50.0, 5651.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 5651.0, "minX": 50.0, "maxY": 5651.0, "series": [{"data": [[50.0, 5651.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958358E12, "maxY": 50.0, "series": [{"data": [[1.54958358E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958358E12, "maxY": 50.0, "series": [{"data": [[1.54958358E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958358E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958358E12, "maxY": 50.0, "series": [{"data": [[1.54958358E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958358E12, "title": "Transactions Per Second"}},
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
