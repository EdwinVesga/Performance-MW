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
        data: {"result": {"minY": 313.0, "minX": 0.0, "maxY": 11491.0, "series": [{"data": [[0.0, 313.0], [0.1, 345.0], [0.2, 364.0], [0.3, 389.0], [0.4, 424.0], [0.5, 448.0], [0.6, 460.0], [0.7, 472.0], [0.8, 493.0], [0.9, 507.0], [1.0, 520.0], [1.1, 528.0], [1.2, 545.0], [1.3, 562.0], [1.4, 571.0], [1.5, 584.0], [1.6, 600.0], [1.7, 611.0], [1.8, 625.0], [1.9, 631.0], [2.0, 635.0], [2.1, 650.0], [2.2, 655.0], [2.3, 664.0], [2.4, 677.0], [2.5, 685.0], [2.6, 701.0], [2.7, 720.0], [2.8, 731.0], [2.9, 736.0], [3.0, 764.0], [3.1, 773.0], [3.2, 781.0], [3.3, 793.0], [3.4, 806.0], [3.5, 827.0], [3.6, 854.0], [3.7, 864.0], [3.8, 873.0], [3.9, 883.0], [4.0, 906.0], [4.1, 919.0], [4.2, 924.0], [4.3, 943.0], [4.4, 949.0], [4.5, 961.0], [4.6, 971.0], [4.7, 996.0], [4.8, 1010.0], [4.9, 1025.0], [5.0, 1054.0], [5.1, 1079.0], [5.2, 1090.0], [5.3, 1109.0], [5.4, 1131.0], [5.5, 1148.0], [5.6, 1186.0], [5.7, 1209.0], [5.8, 1219.0], [5.9, 1246.0], [6.0, 1263.0], [6.1, 1278.0], [6.2, 1284.0], [6.3, 1310.0], [6.4, 1329.0], [6.5, 1342.0], [6.6, 1346.0], [6.7, 1361.0], [6.8, 1376.0], [6.9, 1388.0], [7.0, 1405.0], [7.1, 1413.0], [7.2, 1427.0], [7.3, 1432.0], [7.4, 1442.0], [7.5, 1455.0], [7.6, 1459.0], [7.7, 1503.0], [7.8, 1524.0], [7.9, 1538.0], [8.0, 1543.0], [8.1, 1555.0], [8.2, 1559.0], [8.3, 1568.0], [8.4, 1576.0], [8.5, 1589.0], [8.6, 1602.0], [8.7, 1604.0], [8.8, 1620.0], [8.9, 1624.0], [9.0, 1641.0], [9.1, 1655.0], [9.2, 1676.0], [9.3, 1689.0], [9.4, 1708.0], [9.5, 1715.0], [9.6, 1737.0], [9.7, 1753.0], [9.8, 1765.0], [9.9, 1787.0], [10.0, 1795.0], [10.1, 1799.0], [10.2, 1808.0], [10.3, 1812.0], [10.4, 1836.0], [10.5, 1846.0], [10.6, 1849.0], [10.7, 1860.0], [10.8, 1874.0], [10.9, 1887.0], [11.0, 1891.0], [11.1, 1904.0], [11.2, 1921.0], [11.3, 1933.0], [11.4, 1941.0], [11.5, 1956.0], [11.6, 1961.0], [11.7, 1968.0], [11.8, 1980.0], [11.9, 1999.0], [12.0, 2015.0], [12.1, 2042.0], [12.2, 2062.0], [12.3, 2077.0], [12.4, 2092.0], [12.5, 2102.0], [12.6, 2111.0], [12.7, 2114.0], [12.8, 2121.0], [12.9, 2141.0], [13.0, 2150.0], [13.1, 2169.0], [13.2, 2181.0], [13.3, 2197.0], [13.4, 2206.0], [13.5, 2215.0], [13.6, 2223.0], [13.7, 2227.0], [13.8, 2240.0], [13.9, 2254.0], [14.0, 2260.0], [14.1, 2277.0], [14.2, 2283.0], [14.3, 2293.0], [14.4, 2324.0], [14.5, 2332.0], [14.6, 2340.0], [14.7, 2349.0], [14.8, 2363.0], [14.9, 2370.0], [15.0, 2375.0], [15.1, 2386.0], [15.2, 2399.0], [15.3, 2411.0], [15.4, 2422.0], [15.5, 2425.0], [15.6, 2438.0], [15.7, 2445.0], [15.8, 2451.0], [15.9, 2453.0], [16.0, 2460.0], [16.1, 2480.0], [16.2, 2486.0], [16.3, 2502.0], [16.4, 2508.0], [16.5, 2519.0], [16.6, 2527.0], [16.7, 2534.0], [16.8, 2547.0], [16.9, 2557.0], [17.0, 2561.0], [17.1, 2568.0], [17.2, 2581.0], [17.3, 2588.0], [17.4, 2595.0], [17.5, 2603.0], [17.6, 2618.0], [17.7, 2623.0], [17.8, 2632.0], [17.9, 2634.0], [18.0, 2650.0], [18.1, 2654.0], [18.2, 2660.0], [18.3, 2663.0], [18.4, 2672.0], [18.5, 2678.0], [18.6, 2697.0], [18.7, 2703.0], [18.8, 2708.0], [18.9, 2716.0], [19.0, 2734.0], [19.1, 2737.0], [19.2, 2748.0], [19.3, 2753.0], [19.4, 2760.0], [19.5, 2763.0], [19.6, 2772.0], [19.7, 2779.0], [19.8, 2784.0], [19.9, 2794.0], [20.0, 2804.0], [20.1, 2807.0], [20.2, 2812.0], [20.3, 2824.0], [20.4, 2827.0], [20.5, 2831.0], [20.6, 2836.0], [20.7, 2843.0], [20.8, 2849.0], [20.9, 2852.0], [21.0, 2857.0], [21.1, 2863.0], [21.2, 2872.0], [21.3, 2873.0], [21.4, 2885.0], [21.5, 2895.0], [21.6, 2902.0], [21.7, 2911.0], [21.8, 2914.0], [21.9, 2916.0], [22.0, 2921.0], [22.1, 2924.0], [22.2, 2926.0], [22.3, 2931.0], [22.4, 2939.0], [22.5, 2956.0], [22.6, 2961.0], [22.7, 2967.0], [22.8, 2978.0], [22.9, 2984.0], [23.0, 2991.0], [23.1, 2997.0], [23.2, 3005.0], [23.3, 3009.0], [23.4, 3022.0], [23.5, 3027.0], [23.6, 3036.0], [23.7, 3044.0], [23.8, 3047.0], [23.9, 3056.0], [24.0, 3058.0], [24.1, 3064.0], [24.2, 3074.0], [24.3, 3077.0], [24.4, 3084.0], [24.5, 3088.0], [24.6, 3091.0], [24.7, 3094.0], [24.8, 3105.0], [24.9, 3108.0], [25.0, 3115.0], [25.1, 3121.0], [25.2, 3126.0], [25.3, 3130.0], [25.4, 3139.0], [25.5, 3145.0], [25.6, 3155.0], [25.7, 3157.0], [25.8, 3160.0], [25.9, 3166.0], [26.0, 3179.0], [26.1, 3189.0], [26.2, 3190.0], [26.3, 3197.0], [26.4, 3205.0], [26.5, 3207.0], [26.6, 3210.0], [26.7, 3223.0], [26.8, 3229.0], [26.9, 3236.0], [27.0, 3246.0], [27.1, 3253.0], [27.2, 3262.0], [27.3, 3267.0], [27.4, 3271.0], [27.5, 3278.0], [27.6, 3285.0], [27.7, 3297.0], [27.8, 3308.0], [27.9, 3318.0], [28.0, 3332.0], [28.1, 3336.0], [28.2, 3341.0], [28.3, 3354.0], [28.4, 3359.0], [28.5, 3366.0], [28.6, 3391.0], [28.7, 3392.0], [28.8, 3398.0], [28.9, 3405.0], [29.0, 3415.0], [29.1, 3427.0], [29.2, 3433.0], [29.3, 3446.0], [29.4, 3447.0], [29.5, 3455.0], [29.6, 3456.0], [29.7, 3463.0], [29.8, 3475.0], [29.9, 3484.0], [30.0, 3490.0], [30.1, 3493.0], [30.2, 3495.0], [30.3, 3498.0], [30.4, 3504.0], [30.5, 3507.0], [30.6, 3517.0], [30.7, 3523.0], [30.8, 3527.0], [30.9, 3542.0], [31.0, 3553.0], [31.1, 3557.0], [31.2, 3562.0], [31.3, 3566.0], [31.4, 3579.0], [31.5, 3587.0], [31.6, 3601.0], [31.7, 3610.0], [31.8, 3620.0], [31.9, 3624.0], [32.0, 3635.0], [32.1, 3651.0], [32.2, 3663.0], [32.3, 3669.0], [32.4, 3690.0], [32.5, 3705.0], [32.6, 3712.0], [32.7, 3721.0], [32.8, 3725.0], [32.9, 3734.0], [33.0, 3743.0], [33.1, 3747.0], [33.2, 3749.0], [33.3, 3754.0], [33.4, 3757.0], [33.5, 3766.0], [33.6, 3776.0], [33.7, 3788.0], [33.8, 3791.0], [33.9, 3797.0], [34.0, 3811.0], [34.1, 3818.0], [34.2, 3820.0], [34.3, 3833.0], [34.4, 3843.0], [34.5, 3855.0], [34.6, 3867.0], [34.7, 3873.0], [34.8, 3881.0], [34.9, 3889.0], [35.0, 3897.0], [35.1, 3904.0], [35.2, 3907.0], [35.3, 3910.0], [35.4, 3921.0], [35.5, 3928.0], [35.6, 3933.0], [35.7, 3946.0], [35.8, 3961.0], [35.9, 3973.0], [36.0, 3978.0], [36.1, 3984.0], [36.2, 3991.0], [36.3, 4003.0], [36.4, 4016.0], [36.5, 4021.0], [36.6, 4039.0], [36.7, 4047.0], [36.8, 4068.0], [36.9, 4073.0], [37.0, 4082.0], [37.1, 4102.0], [37.2, 4107.0], [37.3, 4111.0], [37.4, 4119.0], [37.5, 4127.0], [37.6, 4132.0], [37.7, 4143.0], [37.8, 4154.0], [37.9, 4161.0], [38.0, 4164.0], [38.1, 4171.0], [38.2, 4176.0], [38.3, 4195.0], [38.4, 4203.0], [38.5, 4208.0], [38.6, 4213.0], [38.7, 4227.0], [38.8, 4234.0], [38.9, 4242.0], [39.0, 4250.0], [39.1, 4256.0], [39.2, 4259.0], [39.3, 4272.0], [39.4, 4273.0], [39.5, 4277.0], [39.6, 4287.0], [39.7, 4292.0], [39.8, 4305.0], [39.9, 4313.0], [40.0, 4318.0], [40.1, 4321.0], [40.2, 4326.0], [40.3, 4334.0], [40.4, 4344.0], [40.5, 4346.0], [40.6, 4357.0], [40.7, 4367.0], [40.8, 4373.0], [40.9, 4377.0], [41.0, 4379.0], [41.1, 4382.0], [41.2, 4387.0], [41.3, 4397.0], [41.4, 4400.0], [41.5, 4407.0], [41.6, 4409.0], [41.7, 4420.0], [41.8, 4429.0], [41.9, 4446.0], [42.0, 4449.0], [42.1, 4457.0], [42.2, 4471.0], [42.3, 4472.0], [42.4, 4478.0], [42.5, 4494.0], [42.6, 4500.0], [42.7, 4505.0], [42.8, 4515.0], [42.9, 4527.0], [43.0, 4534.0], [43.1, 4541.0], [43.2, 4550.0], [43.3, 4554.0], [43.4, 4570.0], [43.5, 4572.0], [43.6, 4576.0], [43.7, 4580.0], [43.8, 4584.0], [43.9, 4598.0], [44.0, 4600.0], [44.1, 4603.0], [44.2, 4606.0], [44.3, 4617.0], [44.4, 4629.0], [44.5, 4634.0], [44.6, 4639.0], [44.7, 4644.0], [44.8, 4646.0], [44.9, 4653.0], [45.0, 4664.0], [45.1, 4669.0], [45.2, 4678.0], [45.3, 4690.0], [45.4, 4702.0], [45.5, 4709.0], [45.6, 4713.0], [45.7, 4718.0], [45.8, 4729.0], [45.9, 4736.0], [46.0, 4744.0], [46.1, 4766.0], [46.2, 4793.0], [46.3, 4798.0], [46.4, 4803.0], [46.5, 4807.0], [46.6, 4818.0], [46.7, 4825.0], [46.8, 4837.0], [46.9, 4846.0], [47.0, 4849.0], [47.1, 4853.0], [47.2, 4868.0], [47.3, 4882.0], [47.4, 4886.0], [47.5, 4894.0], [47.6, 4896.0], [47.7, 4909.0], [47.8, 4931.0], [47.9, 4940.0], [48.0, 4953.0], [48.1, 4956.0], [48.2, 4962.0], [48.3, 4968.0], [48.4, 4970.0], [48.5, 4978.0], [48.6, 4979.0], [48.7, 4993.0], [48.8, 4998.0], [48.9, 5000.0], [49.0, 5003.0], [49.1, 5014.0], [49.2, 5018.0], [49.3, 5021.0], [49.4, 5024.0], [49.5, 5034.0], [49.6, 5058.0], [49.7, 5062.0], [49.8, 5072.0], [49.9, 5082.0], [50.0, 5085.0], [50.1, 5092.0], [50.2, 5100.0], [50.3, 5110.0], [50.4, 5111.0], [50.5, 5119.0], [50.6, 5127.0], [50.7, 5132.0], [50.8, 5137.0], [50.9, 5143.0], [51.0, 5148.0], [51.1, 5162.0], [51.2, 5172.0], [51.3, 5175.0], [51.4, 5183.0], [51.5, 5188.0], [51.6, 5203.0], [51.7, 5206.0], [51.8, 5212.0], [51.9, 5219.0], [52.0, 5224.0], [52.1, 5230.0], [52.2, 5233.0], [52.3, 5237.0], [52.4, 5247.0], [52.5, 5255.0], [52.6, 5261.0], [52.7, 5271.0], [52.8, 5276.0], [52.9, 5279.0], [53.0, 5287.0], [53.1, 5288.0], [53.2, 5293.0], [53.3, 5302.0], [53.4, 5308.0], [53.5, 5316.0], [53.6, 5327.0], [53.7, 5334.0], [53.8, 5338.0], [53.9, 5341.0], [54.0, 5343.0], [54.1, 5346.0], [54.2, 5350.0], [54.3, 5353.0], [54.4, 5358.0], [54.5, 5360.0], [54.6, 5363.0], [54.7, 5370.0], [54.8, 5378.0], [54.9, 5384.0], [55.0, 5388.0], [55.1, 5392.0], [55.2, 5395.0], [55.3, 5398.0], [55.4, 5405.0], [55.5, 5407.0], [55.6, 5412.0], [55.7, 5417.0], [55.8, 5430.0], [55.9, 5435.0], [56.0, 5440.0], [56.1, 5447.0], [56.2, 5457.0], [56.3, 5469.0], [56.4, 5474.0], [56.5, 5482.0], [56.6, 5485.0], [56.7, 5489.0], [56.8, 5493.0], [56.9, 5502.0], [57.0, 5508.0], [57.1, 5535.0], [57.2, 5542.0], [57.3, 5555.0], [57.4, 5557.0], [57.5, 5562.0], [57.6, 5572.0], [57.7, 5579.0], [57.8, 5586.0], [57.9, 5591.0], [58.0, 5605.0], [58.1, 5612.0], [58.2, 5622.0], [58.3, 5627.0], [58.4, 5631.0], [58.5, 5640.0], [58.6, 5652.0], [58.7, 5679.0], [58.8, 5689.0], [58.9, 5694.0], [59.0, 5709.0], [59.1, 5715.0], [59.2, 5733.0], [59.3, 5740.0], [59.4, 5747.0], [59.5, 5754.0], [59.6, 5759.0], [59.7, 5765.0], [59.8, 5774.0], [59.9, 5782.0], [60.0, 5793.0], [60.1, 5810.0], [60.2, 5821.0], [60.3, 5827.0], [60.4, 5839.0], [60.5, 5846.0], [60.6, 5860.0], [60.7, 5867.0], [60.8, 5878.0], [60.9, 5883.0], [61.0, 5893.0], [61.1, 5906.0], [61.2, 5923.0], [61.3, 5931.0], [61.4, 5943.0], [61.5, 5955.0], [61.6, 5957.0], [61.7, 5967.0], [61.8, 5985.0], [61.9, 5999.0], [62.0, 6016.0], [62.1, 6030.0], [62.2, 6034.0], [62.3, 6039.0], [62.4, 6045.0], [62.5, 6048.0], [62.6, 6051.0], [62.7, 6065.0], [62.8, 6080.0], [62.9, 6092.0], [63.0, 6102.0], [63.1, 6108.0], [63.2, 6141.0], [63.3, 6163.0], [63.4, 6169.0], [63.5, 6179.0], [63.6, 6184.0], [63.7, 6188.0], [63.8, 6208.0], [63.9, 6214.0], [64.0, 6222.0], [64.1, 6235.0], [64.2, 6246.0], [64.3, 6256.0], [64.4, 6267.0], [64.5, 6276.0], [64.6, 6288.0], [64.7, 6303.0], [64.8, 6319.0], [64.9, 6323.0], [65.0, 6333.0], [65.1, 6336.0], [65.2, 6353.0], [65.3, 6356.0], [65.4, 6361.0], [65.5, 6367.0], [65.6, 6385.0], [65.7, 6398.0], [65.8, 6406.0], [65.9, 6410.0], [66.0, 6417.0], [66.1, 6434.0], [66.2, 6442.0], [66.3, 6453.0], [66.4, 6459.0], [66.5, 6464.0], [66.6, 6467.0], [66.7, 6488.0], [66.8, 6504.0], [66.9, 6509.0], [67.0, 6520.0], [67.1, 6539.0], [67.2, 6557.0], [67.3, 6568.0], [67.4, 6621.0], [67.5, 6642.0], [67.6, 6657.0], [67.7, 6677.0], [67.8, 6683.0], [67.9, 6694.0], [68.0, 6703.0], [68.1, 6719.0], [68.2, 6741.0], [68.3, 6747.0], [68.4, 6779.0], [68.5, 6792.0], [68.6, 6836.0], [68.7, 6851.0], [68.8, 6869.0], [68.9, 6894.0], [69.0, 6897.0], [69.1, 6940.0], [69.2, 6963.0], [69.3, 6990.0], [69.4, 7021.0], [69.5, 7051.0], [69.6, 7068.0], [69.7, 7104.0], [69.8, 7122.0], [69.9, 7136.0], [70.0, 7147.0], [70.1, 7171.0], [70.2, 7189.0], [70.3, 7203.0], [70.4, 7210.0], [70.5, 7233.0], [70.6, 7261.0], [70.7, 7292.0], [70.8, 7304.0], [70.9, 7318.0], [71.0, 7325.0], [71.1, 7345.0], [71.2, 7353.0], [71.3, 7358.0], [71.4, 7376.0], [71.5, 7387.0], [71.6, 7392.0], [71.7, 7406.0], [71.8, 7422.0], [71.9, 7453.0], [72.0, 7464.0], [72.1, 7481.0], [72.2, 7491.0], [72.3, 7495.0], [72.4, 7517.0], [72.5, 7534.0], [72.6, 7542.0], [72.7, 7576.0], [72.8, 7595.0], [72.9, 7602.0], [73.0, 7606.0], [73.1, 7625.0], [73.2, 7640.0], [73.3, 7659.0], [73.4, 7669.0], [73.5, 7696.0], [73.6, 7699.0], [73.7, 7709.0], [73.8, 7720.0], [73.9, 7727.0], [74.0, 7745.0], [74.1, 7748.0], [74.2, 7758.0], [74.3, 7767.0], [74.4, 7771.0], [74.5, 7786.0], [74.6, 7820.0], [74.7, 7836.0], [74.8, 7848.0], [74.9, 7858.0], [75.0, 7871.0], [75.1, 7876.0], [75.2, 7888.0], [75.3, 7901.0], [75.4, 7910.0], [75.5, 7923.0], [75.6, 7930.0], [75.7, 7932.0], [75.8, 7944.0], [75.9, 7951.0], [76.0, 7966.0], [76.1, 7969.0], [76.2, 7974.0], [76.3, 7984.0], [76.4, 7990.0], [76.5, 8009.0], [76.6, 8019.0], [76.7, 8030.0], [76.8, 8046.0], [76.9, 8058.0], [77.0, 8067.0], [77.1, 8082.0], [77.2, 8104.0], [77.3, 8115.0], [77.4, 8124.0], [77.5, 8137.0], [77.6, 8143.0], [77.7, 8148.0], [77.8, 8152.0], [77.9, 8173.0], [78.0, 8177.0], [78.1, 8185.0], [78.2, 8187.0], [78.3, 8191.0], [78.4, 8205.0], [78.5, 8219.0], [78.6, 8234.0], [78.7, 8250.0], [78.8, 8258.0], [78.9, 8263.0], [79.0, 8275.0], [79.1, 8281.0], [79.2, 8283.0], [79.3, 8289.0], [79.4, 8308.0], [79.5, 8314.0], [79.6, 8318.0], [79.7, 8324.0], [79.8, 8333.0], [79.9, 8342.0], [80.0, 8346.0], [80.1, 8353.0], [80.2, 8355.0], [80.3, 8359.0], [80.4, 8369.0], [80.5, 8374.0], [80.6, 8380.0], [80.7, 8391.0], [80.8, 8397.0], [80.9, 8402.0], [81.0, 8410.0], [81.1, 8417.0], [81.2, 8420.0], [81.3, 8428.0], [81.4, 8433.0], [81.5, 8442.0], [81.6, 8446.0], [81.7, 8461.0], [81.8, 8466.0], [81.9, 8478.0], [82.0, 8482.0], [82.1, 8488.0], [82.2, 8496.0], [82.3, 8498.0], [82.4, 8508.0], [82.5, 8512.0], [82.6, 8517.0], [82.7, 8520.0], [82.8, 8522.0], [82.9, 8531.0], [83.0, 8541.0], [83.1, 8548.0], [83.2, 8555.0], [83.3, 8560.0], [83.4, 8569.0], [83.5, 8577.0], [83.6, 8582.0], [83.7, 8586.0], [83.8, 8592.0], [83.9, 8596.0], [84.0, 8599.0], [84.1, 8602.0], [84.2, 8608.0], [84.3, 8612.0], [84.4, 8619.0], [84.5, 8632.0], [84.6, 8637.0], [84.7, 8642.0], [84.8, 8650.0], [84.9, 8655.0], [85.0, 8659.0], [85.1, 8666.0], [85.2, 8671.0], [85.3, 8674.0], [85.4, 8681.0], [85.5, 8683.0], [85.6, 8687.0], [85.7, 8695.0], [85.8, 8697.0], [85.9, 8702.0], [86.0, 8709.0], [86.1, 8720.0], [86.2, 8732.0], [86.3, 8736.0], [86.4, 8739.0], [86.5, 8746.0], [86.6, 8762.0], [86.7, 8764.0], [86.8, 8773.0], [86.9, 8778.0], [87.0, 8783.0], [87.1, 8804.0], [87.2, 8813.0], [87.3, 8818.0], [87.4, 8822.0], [87.5, 8834.0], [87.6, 8837.0], [87.7, 8841.0], [87.8, 8844.0], [87.9, 8846.0], [88.0, 8849.0], [88.1, 8851.0], [88.2, 8860.0], [88.3, 8863.0], [88.4, 8865.0], [88.5, 8866.0], [88.6, 8874.0], [88.7, 8878.0], [88.8, 8880.0], [88.9, 8886.0], [89.0, 8900.0], [89.1, 8907.0], [89.2, 8917.0], [89.3, 8924.0], [89.4, 8935.0], [89.5, 8938.0], [89.6, 8940.0], [89.7, 8956.0], [89.8, 8961.0], [89.9, 8963.0], [90.0, 8977.0], [90.1, 8988.0], [90.2, 8992.0], [90.3, 8996.0], [90.4, 9000.0], [90.5, 9009.0], [90.6, 9026.0], [90.7, 9033.0], [90.8, 9035.0], [90.9, 9043.0], [91.0, 9048.0], [91.1, 9060.0], [91.2, 9061.0], [91.3, 9070.0], [91.4, 9075.0], [91.5, 9085.0], [91.6, 9091.0], [91.7, 9098.0], [91.8, 9105.0], [91.9, 9114.0], [92.0, 9117.0], [92.1, 9126.0], [92.2, 9135.0], [92.3, 9147.0], [92.4, 9151.0], [92.5, 9159.0], [92.6, 9162.0], [92.7, 9165.0], [92.8, 9195.0], [92.9, 9206.0], [93.0, 9218.0], [93.1, 9228.0], [93.2, 9244.0], [93.3, 9247.0], [93.4, 9254.0], [93.5, 9257.0], [93.6, 9273.0], [93.7, 9281.0], [93.8, 9288.0], [93.9, 9291.0], [94.0, 9304.0], [94.1, 9306.0], [94.2, 9325.0], [94.3, 9331.0], [94.4, 9344.0], [94.5, 9361.0], [94.6, 9376.0], [94.7, 9383.0], [94.8, 9390.0], [94.9, 9405.0], [95.0, 9423.0], [95.1, 9437.0], [95.2, 9444.0], [95.3, 9463.0], [95.4, 9465.0], [95.5, 9482.0], [95.6, 9492.0], [95.7, 9503.0], [95.8, 9536.0], [95.9, 9547.0], [96.0, 9552.0], [96.1, 9572.0], [96.2, 9595.0], [96.3, 9614.0], [96.4, 9630.0], [96.5, 9657.0], [96.6, 9688.0], [96.7, 9707.0], [96.8, 9739.0], [96.9, 9789.0], [97.0, 9813.0], [97.1, 9841.0], [97.2, 9855.0], [97.3, 9879.0], [97.4, 9901.0], [97.5, 9951.0], [97.6, 9992.0], [97.7, 10052.0], [97.8, 10071.0], [97.9, 10130.0], [98.0, 10165.0], [98.1, 10206.0], [98.2, 10228.0], [98.3, 10267.0], [98.4, 10311.0], [98.5, 10326.0], [98.6, 10400.0], [98.7, 10454.0], [98.8, 10524.0], [98.9, 10624.0], [99.0, 10673.0], [99.1, 10710.0], [99.2, 10801.0], [99.3, 10825.0], [99.4, 10936.0], [99.5, 10978.0], [99.6, 11045.0], [99.7, 11169.0], [99.8, 11236.0], [99.9, 11361.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 61.0, "series": [{"data": [[300.0, 11.0], [400.0, 14.0], [500.0, 22.0], [600.0, 30.0], [700.0, 24.0], [800.0, 18.0], [900.0, 23.0], [1000.0, 16.0], [1100.0, 12.0], [1200.0, 19.0], [1300.0, 20.0], [1400.0, 22.0], [1500.0, 26.0], [1600.0, 24.0], [1700.0, 23.0], [1800.0, 28.0], [1900.0, 26.0], [2000.0, 17.0], [2100.0, 26.0], [2200.0, 30.0], [2300.0, 26.0], [2400.0, 32.0], [2500.0, 33.0], [2600.0, 38.0], [2700.0, 38.0], [2800.0, 49.0], [2900.0, 46.0], [3000.0, 49.0], [3100.0, 47.0], [3300.0, 32.0], [3200.0, 43.0], [3400.0, 46.0], [3500.0, 37.0], [3600.0, 27.0], [3700.0, 44.0], [3800.0, 34.0], [3900.0, 35.0], [4000.0, 24.0], [4200.0, 44.0], [4100.0, 38.0], [4300.0, 48.0], [4400.0, 36.0], [4500.0, 42.0], [4600.0, 42.0], [4700.0, 28.0], [4800.0, 40.0], [4900.0, 36.0], [5100.0, 41.0], [5000.0, 40.0], [5200.0, 53.0], [5300.0, 61.0], [5400.0, 47.0], [5500.0, 33.0], [5600.0, 28.0], [5800.0, 30.0], [5700.0, 35.0], [6000.0, 30.0], [5900.0, 25.0], [6100.0, 26.0], [6300.0, 31.0], [6200.0, 27.0], [6400.0, 32.0], [6600.0, 19.0], [6500.0, 17.0], [6700.0, 17.0], [6800.0, 14.0], [6900.0, 9.0], [7000.0, 10.0], [7100.0, 17.0], [7300.0, 27.0], [7200.0, 17.0], [7400.0, 19.0], [7600.0, 23.0], [7500.0, 16.0], [7700.0, 27.0], [7800.0, 23.0], [7900.0, 36.0], [8000.0, 20.0], [8100.0, 35.0], [8200.0, 32.0], [8300.0, 45.0], [8500.0, 51.0], [8400.0, 43.0], [8600.0, 56.0], [8700.0, 36.0], [8800.0, 57.0], [9000.0, 42.0], [8900.0, 42.0], [9100.0, 31.0], [9200.0, 34.0], [9600.0, 13.0], [9500.0, 16.0], [9400.0, 24.0], [9700.0, 9.0], [9300.0, 28.0], [9900.0, 7.0], [9800.0, 13.0], [10100.0, 6.0], [10000.0, 7.0], [10200.0, 10.0], [10300.0, 6.0], [10400.0, 5.0], [10500.0, 4.0], [10600.0, 5.0], [10700.0, 4.0], [10800.0, 5.0], [10900.0, 5.0], [11000.0, 5.0], [11100.0, 3.0], [11200.0, 3.0], [11400.0, 2.0], [11300.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 11400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 25.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2769.0, "series": [{"data": [[1.0, 206.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 25.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2769.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 997.8346666666704, "minX": 1.5495831E12, "maxY": 997.8346666666704, "series": [{"data": [[1.5495831E12, 997.8346666666704]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 402.6666666666667, "minX": 1.0, "maxY": 11491.0, "series": [{"data": [[2.0, 9122.0], [3.0, 9326.0], [4.0, 8681.0], [5.0, 8681.0], [6.0, 8862.0], [7.0, 8845.0], [8.0, 8928.0], [9.0, 9228.0], [10.0, 8999.0], [11.0, 9437.0], [12.0, 9536.0], [13.0, 9378.0], [14.0, 8695.0], [15.0, 9379.0], [16.0, 9463.0], [17.0, 9205.0], [18.0, 9281.0], [19.0, 8769.0], [20.0, 9357.0], [21.0, 9094.0], [22.0, 9310.0], [23.0, 9482.0], [25.0, 8867.0], [26.0, 8860.0], [27.0, 9577.0], [28.0, 8674.0], [29.0, 9542.0], [30.0, 8655.0], [31.0, 9492.0], [33.0, 9465.0], [32.0, 9256.0], [35.0, 9114.0], [34.0, 9304.0], [37.0, 9479.0], [36.0, 8874.0], [39.0, 9573.0], [38.0, 8982.0], [41.0, 9366.0], [40.0, 9002.0], [43.0, 9106.0], [42.0, 8874.0], [45.0, 8908.0], [44.0, 9487.0], [47.0, 9374.0], [46.0, 8901.0], [49.0, 8698.0], [48.0, 9416.0], [51.0, 9105.0], [50.0, 8940.0], [52.0, 9305.0], [55.0, 8884.0], [54.0, 8724.0], [57.0, 8659.0], [56.0, 9073.0], [59.0, 8666.0], [61.0, 9033.0], [60.0, 9255.0], [63.0, 9413.0], [62.0, 8746.0], [67.0, 8738.0], [66.0, 9208.0], [65.0, 8671.0], [64.0, 9112.0], [71.0, 8822.0], [70.0, 9275.0], [69.0, 9046.0], [68.0, 9231.0], [75.0, 8746.0], [74.0, 9147.0], [73.0, 9061.0], [72.0, 9160.0], [79.0, 8917.0], [78.0, 8990.0], [77.0, 8940.0], [76.0, 8641.0], [83.0, 9306.0], [82.0, 8992.0], [81.0, 9035.0], [80.0, 9302.0], [87.0, 8696.0], [86.0, 9388.0], [85.0, 8674.0], [84.0, 11278.0], [91.0, 9148.0], [89.0, 9477.0], [88.0, 8654.0], [94.0, 9022.5], [92.0, 8922.0], [99.0, 9405.0], [98.0, 8863.0], [97.0, 9461.0], [96.0, 8794.0], [103.0, 8997.0], [102.0, 8888.0], [101.0, 9075.0], [100.0, 8586.0], [106.0, 8679.0], [105.0, 9288.0], [104.0, 9493.0], [110.0, 9275.0], [109.0, 9052.0], [108.0, 8957.5], [112.0, 6134.0], [114.0, 8977.0], [113.0, 8586.0], [119.0, 8763.0], [118.0, 9376.0], [117.0, 8868.5], [116.0, 9305.0], [120.0, 4556.5], [123.0, 4838.0], [122.0, 9312.0], [121.0, 9273.0], [127.0, 2056.2], [126.0, 9048.0], [125.0, 9128.0], [124.0, 8844.0], [135.0, 4656.0], [134.0, 9444.0], [133.0, 8846.0], [132.0, 8823.0], [131.0, 8576.0], [130.0, 9200.0], [129.0, 9009.0], [128.0, 9099.0], [140.0, 402.6666666666667], [139.0, 4455.0], [138.0, 4748.0], [141.0, 6140.0], [143.0, 9089.0], [142.0, 8552.0], [137.0, 9116.0], [136.0, 8613.0], [146.0, 460.0], [149.0, 4886.0], [150.0, 3245.6666666666665], [151.0, 9228.0], [148.0, 9070.0], [147.0, 8994.0], [145.0, 8681.0], [144.0, 9257.0], [153.0, 3180.3333333333335], [152.0, 3213.6666666666665], [155.0, 4548.0], [154.0, 4609.0], [159.0, 4499.0], [158.0, 8535.0], [157.0, 8872.5], [161.0, 4780.0], [160.0, 4522.5], [167.0, 4973.5], [166.0, 9133.0], [165.0, 8877.0], [163.0, 8996.0], [162.0, 8844.0], [171.0, 4691.0], [174.0, 4657.0], [175.0, 8807.0], [173.0, 9247.0], [172.0, 10745.0], [170.0, 8850.0], [169.0, 8736.0], [168.0, 9155.0], [180.0, 4844.0], [183.0, 4731.0], [182.0, 8849.0], [181.0, 8419.0], [179.0, 8491.0], [178.0, 8774.0], [177.0, 9065.0], [176.0, 8603.0], [191.0, 4647.5], [190.0, 9099.0], [189.0, 9186.0], [188.0, 9268.0], [187.0, 8804.0], [186.0, 8524.0], [185.0, 8622.0], [184.0, 8602.0], [192.0, 1592.5], [193.0, 3534.3333333333335], [194.0, 2752.25], [195.0, 4884.0], [196.0, 3344.3333333333335], [198.0, 4705.0], [199.0, 8402.0], [197.0, 8666.0], [202.0, 528.0], [201.0, 4441.0], [200.0, 2807.5], [204.0, 2308.2], [203.0, 6197.333333333333], [207.0, 4482.0], [206.0, 673.0], [205.0, 8720.0], [208.0, 725.0], [215.0, 8697.0], [214.0, 8988.0], [212.0, 9282.0], [211.0, 8442.0], [210.0, 8565.0], [209.0, 8858.5], [216.0, 785.0], [217.0, 6228.333333333333], [223.0, 4567.5], [222.0, 9165.0], [221.0, 8374.0], [220.0, 8695.0], [219.0, 9195.0], [218.0, 9226.0], [226.0, 6391.666666666667], [229.0, 5183.5], [231.0, 8594.0], [230.0, 8555.0], [228.0, 8591.0], [227.0, 10228.0], [224.0, 8981.0], [236.0, 4886.0], [235.0, 3284.0], [234.0, 3250.0], [233.0, 2866.75], [232.0, 4655.0], [239.0, 8281.0], [238.0, 8485.0], [237.0, 8886.0], [241.0, 3556.3333333333335], [240.0, 3235.0], [247.0, 906.0], [246.0, 4834.0], [245.0, 10400.0], [244.0, 8287.0], [243.0, 8868.5], [253.0, 4629.5], [255.0, 4749.0], [254.0, 8732.0], [252.0, 11172.0], [251.0, 8848.0], [250.0, 8409.0], [249.0, 11491.0], [248.0, 8859.5], [270.0, 8541.5], [257.0, 4498.0], [261.0, 5931.5], [260.0, 8420.0], [263.0, 8453.0], [256.0, 10673.0], [262.0, 9033.0], [266.0, 4789.5], [267.0, 4967.5], [271.0, 4754.0], [268.0, 8776.0], [259.0, 8560.0], [258.0, 8924.0], [265.0, 8314.0], [264.0, 8963.0], [286.0, 4639.5], [282.0, 979.0], [273.0, 5724.5], [272.0, 8685.0], [275.0, 8988.0], [274.0, 8281.0], [279.0, 8708.0], [278.0, 8214.0], [277.0, 8405.0], [276.0, 9060.0], [283.0, 6130.0], [287.0, 8739.0], [285.0, 8386.0], [284.0, 8359.0], [281.0, 9688.0], [280.0, 8508.0], [303.0, 3443.0], [295.0, 871.0], [294.0, 8637.0], [293.0, 8732.0], [292.0, 8974.0], [301.0, 4649.5], [302.0, 4618.5], [300.0, 8512.0], [291.0, 8687.0], [290.0, 8350.0], [289.0, 8203.0], [288.0, 8579.0], [299.0, 8778.0], [298.0, 8698.0], [297.0, 8866.0], [296.0, 8512.0], [318.0, 8219.0], [306.0, 1109.0], [307.0, 5911.0], [310.0, 4828.0], [305.0, 8550.0], [304.0, 8267.0], [309.0, 8250.0], [308.0, 8391.0], [319.0, 670.0], [313.0, 8878.0], [312.0, 9252.5], [317.0, 8443.0], [316.0, 8510.0], [315.0, 8677.0], [314.0, 11058.0], [334.0, 8556.0], [325.0, 4603.0], [323.0, 6097.333333333333], [321.0, 8346.0], [320.0, 8647.0], [327.0, 8283.0], [326.0, 8421.0], [324.0, 4593.0], [335.0, 10876.0], [329.0, 11361.0], [328.0, 8943.0], [333.0, 8328.0], [332.0, 9704.0], [331.0, 9028.0], [330.0, 8315.0], [350.0, 8958.0], [337.0, 5506.5], [338.0, 848.0], [339.0, 8747.0], [341.0, 869.0], [340.0, 7988.0], [342.0, 8648.0], [336.0, 8478.0], [347.0, 3378.3333333333335], [349.0, 8595.0], [348.0, 8866.0], [346.0, 9730.0], [345.0, 8670.0], [344.0, 8557.0], [366.0, 8124.0], [353.0, 3512.3333333333335], [354.0, 4871.0], [355.0, 11056.0], [357.0, 4640.5], [356.0, 9975.0], [358.0, 4485.0], [359.0, 8720.0], [352.0, 8863.0], [367.0, 11428.0], [361.0, 8634.0], [360.0, 8385.0], [365.0, 10267.0], [364.0, 8343.0], [363.0, 8844.0], [362.0, 8173.0], [381.0, 3334.0], [371.0, 4814.0], [375.0, 4762.5], [368.0, 8560.0], [370.0, 8865.0], [369.0, 10650.0], [374.0, 8355.0], [373.0, 10238.0], [372.0, 8397.0], [377.0, 3543.6666666666665], [376.0, 10927.0], [380.0, 4716.5], [383.0, 2684.5], [382.0, 2995.5], [379.0, 9797.0], [378.0, 8359.0], [387.0, 5951.0], [384.0, 5450.5], [386.0, 3347.6666666666665], [385.0, 2758.5], [391.0, 4528.5], [390.0, 10452.0], [389.0, 11045.0], [388.0, 8187.0], [395.0, 4533.0], [394.0, 9074.0], [393.0, 10710.0], [392.0, 7886.0], [399.0, 3649.0], [398.0, 8449.0], [396.0, 8291.0], [414.0, 9383.0], [405.0, 3346.6666666666665], [404.0, 7896.0], [407.0, 9855.0], [401.0, 10326.0], [400.0, 8374.0], [403.0, 10936.0], [402.0, 8433.0], [406.0, 9043.0], [415.0, 8308.0], [413.0, 8480.0], [412.0, 7906.0], [411.0, 8841.0], [410.0, 8590.0], [409.0, 10548.0], [408.0, 9247.0], [431.0, 8939.0], [417.0, 5673.5], [422.0, 4764.0], [421.0, 11247.0], [420.0, 8683.0], [423.0, 8173.0], [416.0, 7843.0], [427.0, 5169.5], [430.0, 10699.0], [429.0, 8030.0], [428.0, 8187.0], [419.0, 8813.0], [418.0, 10206.0], [426.0, 8228.0], [425.0, 7930.0], [424.0, 8596.0], [446.0, 8180.0], [439.0, 4698.0], [438.0, 4504.0], [437.0, 10524.0], [436.0, 11169.0], [447.0, 9739.0], [445.0, 9884.0], [444.0, 9463.0], [435.0, 7773.0], [434.0, 8574.0], [433.0, 11175.0], [432.0, 8205.0], [443.0, 10054.0], [442.0, 10978.0], [441.0, 10022.0], [440.0, 8177.0], [462.0, 4723.0], [450.0, 4482.25], [453.0, 4327.0], [452.0, 10718.0], [455.0, 7866.0], [448.0, 10940.0], [454.0, 8938.0], [458.0, 4697.5], [461.0, 4684.5], [463.0, 7967.0], [460.0, 7836.0], [451.0, 7932.0], [459.0, 7786.0], [457.0, 8461.0], [456.0, 7710.0], [477.0, 10276.0], [465.0, 5535.5], [466.0, 4615.5], [470.0, 5299.5], [469.0, 8069.0], [468.0, 11031.0], [471.0, 7738.0], [464.0, 9048.0], [472.0, 4546.5], [479.0, 6004.5], [478.0, 9038.0], [476.0, 9287.5], [467.0, 7777.0], [474.0, 8149.0], [473.0, 8189.0], [494.0, 9361.0], [482.0, 5882.75], [487.0, 5106.0], [480.0, 9739.0], [486.0, 8396.0], [485.0, 9503.0], [484.0, 10634.0], [493.0, 3835.3333333333335], [495.0, 6136.5], [492.0, 8064.0], [483.0, 7606.0], [491.0, 9246.0], [490.0, 8514.0], [489.0, 7971.0], [488.0, 8330.0], [510.0, 8562.0], [496.0, 5723.0], [497.0, 4496.0], [499.0, 9230.0], [501.0, 4436.5], [500.0, 7970.0], [503.0, 9718.5], [511.0, 8505.0], [505.0, 8488.0], [504.0, 10471.0], [509.0, 9547.0], [508.0, 9465.0], [507.0, 8877.0], [506.0, 10052.0], [526.0, 8107.0], [542.0, 8837.0], [520.0, 4792.0], [522.0, 8873.0], [524.0, 9383.0], [536.0, 8134.0], [518.0, 7726.0], [516.0, 8866.0], [514.0, 8339.0], [512.0, 10706.0], [530.0, 5373.5], [534.0, 9218.0], [532.0, 8917.0], [528.0, 10801.0], [540.0, 7345.0], [538.0, 8258.0], [546.0, 9617.0], [570.0, 5500.0], [550.0, 7313.0], [548.0, 7767.0], [568.0, 7714.5], [558.0, 5658.5], [556.0, 9908.0], [554.0, 9633.0], [552.0, 8019.0], [560.0, 3728.6666666666665], [544.0, 9552.0], [562.0, 7982.0], [564.0, 8649.0], [566.0, 9849.0], [574.0, 9506.0], [572.0, 10332.0], [578.0, 4340.0], [600.0, 5424.0], [580.0, 5909.0], [582.0, 10053.0], [576.0, 7969.0], [588.0, 10206.0], [586.0, 8067.0], [584.0, 7956.0], [598.0, 5020.0], [596.0, 8747.0], [594.0, 8082.0], [592.0, 8922.0], [602.0, 4894.5], [604.0, 8324.0], [606.0, 5608.0], [610.0, 10130.0], [632.0, 5113.0], [608.0, 5150.0], [614.0, 5129.0], [612.0, 8296.5], [622.0, 9085.0], [620.0, 10311.0], [618.0, 4536.0], [616.0, 10205.0], [628.0, 3607.6666666666665], [626.0, 8419.0], [630.0, 8070.0], [634.0, 4998.0], [636.0, 8840.0], [624.0, 9495.0], [638.0, 5488.0], [644.0, 10098.0], [656.0, 5638.5], [652.0, 4733.5], [650.0, 8967.0], [648.0, 9159.0], [654.0, 9027.0], [664.0, 8442.0], [646.0, 10165.0], [642.0, 8612.0], [640.0, 9395.0], [666.0, 8641.0], [668.0, 5727.5], [670.0, 8144.0], [658.0, 7595.0], [660.0, 4637.5], [662.0, 5647.0], [676.0, 8819.0], [672.0, 5599.0], [686.0, 5708.5], [674.0, 4640.5], [696.0, 9548.0], [700.0, 4418.0], [702.0, 4572.0], [688.0, 4285.0], [690.0, 9162.0], [692.0, 8517.0], [694.0, 8414.0], [678.0, 5036.5], [682.0, 4632.0], [680.0, 5783.0], [684.0, 5664.5], [706.0, 8354.0], [712.0, 1328.3333333333333], [714.0, 7839.0], [710.0, 8608.0], [728.0, 9606.0], [730.0, 8875.0], [732.0, 7602.0], [734.0, 7268.0], [718.0, 3506.0], [704.0, 8601.0], [716.0, 5920.5], [722.0, 8510.0], [724.0, 8993.0], [726.0, 8632.0], [720.0, 4571.0], [738.0, 4916.5], [764.0, 3351.5], [736.0, 1641.5], [740.0, 9614.0], [742.0, 4665.5], [744.0, 3386.5], [746.0, 7365.0], [748.0, 8447.0], [760.0, 7491.0], [762.0, 7455.0], [766.0, 3767.666666666667], [752.0, 6832.0], [754.0, 7260.0], [756.0, 9186.0], [758.0, 4900.0], [750.0, 3974.666666666667], [774.0, 4167.666666666667], [770.0, 2535.5714285714284], [768.0, 7874.0], [782.0, 8910.0], [772.0, 2598.75], [792.0, 7406.0], [794.0, 6434.0], [796.0, 4063.333333333333], [798.0, 4295.5], [784.0, 3050.2], [786.0, 3379.222222222222], [790.0, 6963.0], [776.0, 2450.5384615384614], [778.0, 2847.5], [780.0, 4921.0], [806.0, 6797.0], [826.0, 7204.0], [830.0, 8522.0], [804.0, 7703.0], [824.0, 8026.0], [800.0, 5188.0], [802.0, 5564.5], [810.0, 8318.0], [808.0, 7495.0], [812.0, 7068.0], [814.0, 6273.0], [820.0, 6246.0], [822.0, 8835.0], [818.0, 4429.5], [816.0, 7542.0], [828.0, 8841.0], [846.0, 3823.0], [840.0, 4198.0], [842.0, 8599.0], [844.0, 7974.0], [854.0, 4316.0], [852.0, 6211.0], [850.0, 6762.0], [848.0, 8642.0], [862.0, 6111.0], [860.0, 7064.0], [858.0, 7663.0], [856.0, 8225.0], [838.0, 8046.0], [836.0, 7127.0], [834.0, 6465.0], [832.0, 8764.0], [892.0, 6694.0], [894.0, 8275.0], [880.0, 8531.0], [882.0, 7501.0], [884.0, 6621.0], [888.0, 6293.0], [870.0, 7387.0], [868.0, 6214.0], [866.0, 7699.0], [864.0, 7295.0], [878.0, 7058.0], [876.0, 6473.0], [874.0, 7727.0], [872.0, 6686.0], [886.0, 6568.0], [920.0, 5083.5], [898.0, 3725.666666666667], [900.0, 3903.333333333333], [902.0, 4963.5], [912.0, 6030.0], [916.0, 6851.0], [918.0, 6897.0], [926.0, 4489.5], [924.0, 8160.0], [922.0, 8252.0], [906.0, 3871.5], [904.0, 4610.5], [908.0, 3605.666666666667], [896.0, 6520.0], [910.0, 7680.0], [930.0, 2444.0], [928.0, 8143.0], [932.0, 7540.0], [934.0, 7771.0], [952.0, 6494.0], [938.0, 4029.0], [936.0, 7800.0], [940.0, 6235.0], [942.0, 7104.0], [944.0, 6277.0], [946.0, 6441.0], [948.0, 6080.0], [950.0, 7356.0], [958.0, 6641.0], [954.0, 7382.0], [988.0, 6745.0], [990.0, 7748.0], [978.0, 6319.5], [976.0, 6004.0], [980.0, 6215.0], [986.0, 7720.0], [984.0, 5702.0], [966.0, 6173.0], [964.0, 7325.0], [962.0, 7217.0], [960.0, 6036.0], [974.0, 5821.0], [972.0, 5759.0], [970.0, 7709.0], [968.0, 5774.0], [982.0, 6333.0], [1020.0, 6355.0], [1008.0, 6844.0], [1010.0, 5709.0], [1012.0, 6322.0], [1022.0, 7395.0], [1018.0, 7630.0], [1016.0, 6253.0], [992.0, 6062.5], [994.0, 8115.0], [996.0, 7296.0], [998.0, 6818.5], [1006.0, 5742.0], [1004.0, 7205.0], [1002.0, 5749.0], [1000.0, 6153.0], [1014.0, 5749.0], [1080.0, 5689.0], [1084.0, 5183.0], [1056.0, 5843.0], [1060.0, 6267.0], [1076.0, 6123.0], [1024.0, 6488.0], [1028.0, 5860.0], [1032.0, 7944.0], [1036.0, 5469.0], [1052.0, 6464.0], [1048.0, 5622.0], [1044.0, 5482.0], [1040.0, 5906.0], [1068.0, 6034.0], [1064.0, 5393.0], [1120.0, 3369.0], [1096.0, 3852.666666666667], [1088.0, 6163.0], [1124.0, 3192.222222222222], [1128.0, 3267.0], [1132.0, 2983.2], [1092.0, 3905.333333333333], [1100.0, 2163.5], [1136.0, 2987.0], [1144.0, 4389.5], [1140.0, 5023.0], [1148.0, 3218.25], [1116.0, 3993.5], [1112.0, 2974.333333333333], [1108.0, 3461.0], [1104.0, 3689.666666666667], [1160.0, 3079.0], [1164.0, 4069.5], [1180.0, 3478.3333333333335], [1176.0, 6045.0], [1152.0, 5798.0], [1156.0, 5008.0], [1172.0, 3458.0], [1192.0, 6860.0], [1196.0, 5206.0], [1188.0, 3624.0], [1184.0, 5795.0], [1212.0, 3897.0], [1208.0, 3123.666666666667], [1200.0, 4263.5], [1204.0, 3600.0], [1168.0, 2544.5], [1272.0, 4896.0], [1264.0, 3475.0], [1220.0, 3788.0], [1228.0, 4893.0], [1224.0, 5493.0], [1276.0, 5088.0], [1268.0, 4098.333333333333], [1260.0, 4170.5], [1256.0, 4674.0], [1252.0, 4481.5], [1248.0, 6086.0], [1236.0, 3871.0], [1240.0, 3635.5], [1244.0, 5083.5], [1288.0, 4854.0], [1280.0, 5069.0], [1308.0, 5793.0], [1284.0, 6509.5], [1292.0, 5224.0], [1312.0, 4278.5], [1340.0, 6467.0], [1336.0, 5000.0], [1332.0, 5015.0], [1328.0, 5079.5], [1316.0, 3922.0], [1320.0, 5184.0], [1324.0, 4678.0], [1300.0, 4065.5], [1296.0, 4819.0], [1304.0, 5214.0], [1348.0, 3893.666666666667], [1356.0, 3736.0], [1344.0, 4454.5], [1372.0, 6019.0], [1368.0, 3653.6666666666665], [1364.0, 4008.75], [1360.0, 4837.0], [1352.0, 6381.0], [1392.0, 5203.0], [1396.0, 5489.0], [1400.0, 3717.0], [1376.0, 3710.3333333333335], [1404.0, 4420.0], [1384.0, 4042.6666666666665], [1388.0, 4788.0], [1380.0, 5554.0], [1416.0, 5072.0], [1420.0, 4667.0], [1408.0, 3878.0], [1436.0, 4742.0], [1412.0, 3661.0], [1456.0, 4580.0], [1460.0, 3567.285714285714], [1468.0, 3574.6666666666665], [1464.0, 6217.0], [1448.0, 5755.0], [1444.0, 5539.0], [1440.0, 4635.0], [1452.0, 5562.0], [1428.0, 4165.5], [1424.0, 5839.0], [1432.0, 5999.0], [1472.0, 3478.5], [1476.0, 4961.0], [1500.0, 3916.25], [1492.0, 4422.0], [1488.0, 4391.0], [1496.0, 4953.0], [1508.0, 3972.5], [1512.0, 5177.0], [1516.0, 4344.0], [1504.0, 3637.6666666666665], [1520.0, 3528.0], [1484.0, 4570.0], [1524.0, 4694.0], [1528.0, 5893.0], [1532.0, 5892.0], [1480.0, 4688.0], [1548.0, 3916.5], [1564.0, 4811.5], [1540.0, 3653.5], [1536.0, 5951.0], [1580.0, 4071.5], [1576.0, 4194.666666666667], [1572.0, 5416.0], [1568.0, 4735.0], [1592.0, 4978.5], [1596.0, 5405.0], [1584.0, 4720.0], [1588.0, 4270.333333333333], [1556.0, 4766.0], [1552.0, 5342.0], [1560.0, 4678.0], [1600.0, 5504.0], [1604.0, 3927.4285714285716], [1628.0, 4639.0], [1616.0, 4409.0], [1620.0, 5391.0], [1624.0, 4364.333333333333], [1608.0, 5212.0], [1612.0, 5201.0], [1648.0, 4747.5], [1652.0, 4346.0], [1656.0, 4969.0], [1660.0, 4103.5], [1632.0, 4570.0], [1636.0, 4714.5], [1640.0, 5235.0], [1644.0, 5849.5], [1672.0, 4024.75], [1712.0, 4508.0], [1668.0, 4111.0], [1692.0, 5222.0], [1688.0, 4569.0], [1684.0, 4734.5], [1680.0, 5839.0], [1716.0, 4033.5], [1720.0, 4009.5], [1724.0, 3744.0], [1696.0, 5271.0], [1704.0, 4988.0], [1700.0, 5258.0], [1708.0, 4644.0], [1676.0, 4249.5], [1732.0, 4006.5], [1736.0, 1576.0], [1728.0, 4279.0], [1756.0, 4494.0], [1752.0, 4497.5], [1748.0, 4594.666666666667], [1740.0, 4459.0], [1744.0, 4096.25], [1776.0, 4348.0], [1780.0, 4336.0], [1784.0, 4322.0], [1788.0, 4378.0], [1760.0, 4417.5], [1768.0, 3827.0], [1764.0, 3466.0], [1772.0, 4402.0], [1796.0, 4313.0], [1792.0, 4290.0], [1820.0, 3849.3333333333335], [1816.0, 5232.0], [1812.0, 4230.0], [1800.0, 4895.0], [1804.0, 1329.0], [1824.0, 3320.0], [1852.0, 3838.0], [1848.0, 4047.0], [1844.0, 3791.0], [1840.0, 4557.5], [1828.0, 3793.25], [1832.0, 4219.0], [1836.0, 4052.5], [1808.0, 5131.0], [1856.0, 3883.5], [1860.0, 3819.0], [1864.0, 4318.5], [1868.0, 3925.0], [1081.0, 7179.0], [1057.0, 7858.0], [1061.0, 5586.0], [1065.0, 6221.0], [1085.0, 6367.0], [1077.0, 5474.0], [1073.0, 6357.0], [1025.0, 6417.0], [1029.0, 5882.0], [1033.0, 7392.0], [1053.0, 6357.0], [1049.0, 6185.0], [1045.0, 5358.0], [1041.0, 6087.0], [1069.0, 5722.0], [1149.0, 6780.0], [1097.0, 3436.8], [1125.0, 3505.0], [1133.0, 4342.0], [1129.0, 3885.5], [1121.0, 3141.2], [1089.0, 5562.0], [1093.0, 2314.6666666666665], [1141.0, 7072.0], [1137.0, 6421.5], [1145.0, 4968.0], [1101.0, 4378.666666666667], [1117.0, 3798.5], [1113.0, 2999.0], [1109.0, 3214.5], [1105.0, 4533.0], [1161.0, 5584.0], [1157.0, 3486.6666666666665], [1153.0, 5407.0], [1181.0, 5857.0], [1177.0, 4730.0], [1165.0, 5112.0], [1189.0, 4096.5], [1193.0, 3813.5], [1197.0, 6413.0], [1185.0, 6453.0], [1213.0, 5555.0], [1209.0, 3582.4], [1205.0, 5111.0], [1201.0, 5021.0], [1169.0, 5022.333333333333], [1173.0, 5930.0], [1229.0, 3673.5], [1265.0, 3350.0], [1225.0, 4803.0], [1217.0, 5308.0], [1245.0, 5155.0], [1221.0, 3219.0], [1269.0, 4557.0], [1249.0, 3721.6666666666665], [1277.0, 5294.0], [1273.0, 6100.0], [1253.0, 3718.3333333333335], [1261.0, 4438.0], [1257.0, 4277.0], [1233.0, 5814.0], [1237.0, 6894.0], [1241.0, 5110.0], [1289.0, 5127.0], [1285.0, 4387.0], [1281.0, 5955.0], [1305.0, 3720.6666666666665], [1309.0, 4993.0], [1293.0, 4720.0], [1329.0, 5040.0], [1333.0, 6278.0], [1341.0, 5931.0], [1337.0, 5342.0], [1317.0, 4654.0], [1325.0, 3793.5], [1321.0, 4520.5], [1313.0, 4500.0], [1297.0, 4375.5], [1301.0, 3766.0], [1349.0, 3978.666666666667], [1393.0, 4297.0], [1373.0, 4254.0], [1369.0, 4433.0], [1361.0, 4148.0], [1365.0, 5137.0], [1345.0, 2843.0], [1357.0, 5096.5], [1353.0, 5994.0], [1397.0, 3655.5], [1377.0, 5883.0], [1405.0, 4883.0], [1401.0, 4040.0], [1381.0, 3436.3333333333335], [1385.0, 2872.0], [1389.0, 4979.0], [1421.0, 4051.0], [1413.0, 4062.6666666666665], [1409.0, 3375.4444444444443], [1417.0, 4530.0], [1457.0, 3828.0], [1461.0, 4561.5], [1445.0, 3855.0], [1441.0, 6073.0], [1469.0, 4707.0], [1465.0, 5608.0], [1449.0, 4288.0], [1425.0, 4935.0], [1429.0, 4882.0], [1433.0, 5132.0], [1437.0, 5935.0], [1477.0, 4097.5], [1485.0, 4255.5], [1473.0, 4561.0], [1501.0, 3712.0], [1497.0, 5679.0], [1489.0, 5451.0], [1493.0, 5341.0], [1481.0, 3845.4], [1509.0, 4546.5], [1513.0, 5345.0], [1517.0, 3981.5], [1505.0, 4026.4], [1533.0, 4962.0], [1529.0, 5449.0], [1525.0, 5605.0], [1521.0, 4874.0], [1541.0, 4356.0], [1537.0, 4173.5], [1565.0, 4111.5], [1561.0, 6414.0], [1557.0, 5782.0], [1553.0, 4993.0], [1545.0, 4990.666666666667], [1549.0, 5667.0], [1585.0, 4247.0], [1577.0, 4504.5], [1581.0, 5341.0], [1569.0, 5408.0], [1573.0, 4126.0], [1589.0, 5003.0], [1593.0, 5434.0], [1605.0, 5205.0], [1609.0, 3798.0], [1629.0, 4979.0], [1601.0, 5370.0], [1625.0, 4529.333333333333], [1617.0, 5985.0], [1621.0, 5133.0], [1649.0, 3995.3333333333335], [1653.0, 5304.0], [1657.0, 4264.0], [1661.0, 5276.0], [1633.0, 3780.0], [1637.0, 4229.0], [1641.0, 3962.8333333333335], [1645.0, 4484.0], [1673.0, 5384.0], [1669.0, 4783.0], [1665.0, 5301.5], [1693.0, 4664.0], [1689.0, 4760.0], [1685.0, 4700.666666666667], [1713.0, 3989.5], [1717.0, 4016.0], [1721.0, 4710.0], [1725.0, 5278.0], [1697.0, 5237.0], [1705.0, 4586.666666666667], [1701.0, 5071.0], [1709.0, 3675.3333333333335], [1677.0, 4091.0], [1729.0, 4620.0], [1733.0, 3818.3333333333335], [1753.0, 3840.0], [1757.0, 4228.0], [1749.0, 4063.0], [1737.0, 3345.75], [1741.0, 5233.0], [1745.0, 3956.0], [1777.0, 4347.0], [1781.0, 3660.5], [1785.0, 4213.0], [1789.0, 4318.0], [1765.0, 4409.0], [1769.0, 4382.0], [1773.0, 4400.0], [1761.0, 3601.0], [1797.0, 4274.0], [1793.0, 4102.333333333333], [1821.0, 4109.666666666667], [1817.0, 4174.0], [1813.0, 4006.5], [1801.0, 3965.5], [1805.0, 3750.5], [1825.0, 3882.5], [1853.0, 3852.0], [1849.0, 4288.666666666667], [1845.0, 4225.0], [1841.0, 4650.0], [1829.0, 4909.0], [1833.0, 4143.0], [1837.0, 3669.0], [1809.0, 3878.0], [1857.0, 3947.25], [1861.0, 4680.0], [1865.0, 4329.5], [515.0, 9098.0], [537.0, 5608.0], [521.0, 8018.0], [523.0, 8662.0], [525.0, 7858.0], [519.0, 9331.0], [517.0, 7848.0], [513.0, 8773.0], [527.0, 8517.0], [535.0, 4674.0], [533.0, 8743.0], [541.0, 4607.0], [543.0, 7902.0], [529.0, 7901.0], [539.0, 10534.0], [545.0, 3965.6666666666665], [551.0, 5054.0], [549.0, 8148.0], [547.0, 9565.0], [569.0, 8497.0], [557.0, 8428.0], [555.0, 7923.0], [553.0, 9436.0], [559.0, 6130.0], [563.0, 3242.3333333333335], [561.0, 10517.0], [565.0, 9841.0], [575.0, 10297.0], [573.0, 9901.0], [571.0, 8009.0], [579.0, 5258.0], [605.0, 8399.0], [581.0, 3620.6666666666665], [583.0, 8605.0], [591.0, 5876.0], [577.0, 8863.0], [589.0, 8342.0], [587.0, 7849.0], [585.0, 8259.0], [597.0, 9441.0], [595.0, 8935.0], [593.0, 9079.0], [599.0, 9739.0], [601.0, 10107.0], [603.0, 10326.0], [607.0, 3660.6666666666665], [613.0, 7600.0], [609.0, 9630.0], [615.0, 8041.0], [619.0, 4634.0], [623.0, 10212.0], [621.0, 9115.0], [617.0, 7472.0], [625.0, 5255.0], [627.0, 8314.0], [629.0, 5430.0], [631.0, 8397.0], [633.0, 9269.0], [635.0, 9344.0], [637.0, 4528.5], [639.0, 4593.5], [655.0, 3874.6666666666665], [667.0, 5295.5], [651.0, 5305.5], [649.0, 7525.0], [653.0, 8531.0], [647.0, 6895.0], [645.0, 7683.0], [643.0, 9329.0], [641.0, 9227.0], [665.0, 9954.0], [669.0, 4810.0], [671.0, 5341.5], [657.0, 5668.0], [661.0, 8343.0], [659.0, 5032.5], [663.0, 3082.25], [677.0, 8673.0], [673.0, 5086.5], [687.0, 4633.5], [675.0, 8107.0], [679.0, 4207.333333333334], [699.0, 8816.5], [697.0, 7888.0], [701.0, 9842.0], [703.0, 8608.0], [689.0, 5037.5], [691.0, 8957.0], [693.0, 5674.5], [695.0, 5256.5], [681.0, 5613.5], [683.0, 7422.0], [685.0, 4388.5], [711.0, 4959.0], [707.0, 4417.5], [713.0, 8408.5], [709.0, 8624.5], [729.0, 9678.0], [731.0, 7320.0], [733.0, 7347.0], [735.0, 7664.0], [719.0, 7748.0], [705.0, 7481.0], [717.0, 2928.8], [715.0, 4232.0], [721.0, 3689.666666666667], [723.0, 7606.0], [725.0, 8141.0], [727.0, 8292.0], [743.0, 5018.5], [739.0, 5110.0], [741.0, 9206.0], [737.0, 5928.333333333333], [745.0, 8521.0], [747.0, 9291.0], [761.0, 7745.0], [763.0, 6989.0], [765.0, 7622.0], [767.0, 4797.5], [753.0, 7754.0], [755.0, 9033.0], [757.0, 7310.0], [759.0, 4870.0], [751.0, 9061.0], [749.0, 3337.0], [773.0, 4398.666666666666], [771.0, 2634.875], [769.0, 3267.75], [783.0, 6860.0], [781.0, 8465.0], [775.0, 2809.285714285714], [793.0, 7991.0], [797.0, 6410.0], [795.0, 2487.5217391304345], [799.0, 4518.5], [785.0, 2017.8888888888891], [787.0, 5052.0], [789.0, 7718.5], [791.0, 7156.0], [777.0, 3740.6666666666665], [779.0, 3631.333333333333], [801.0, 6388.0], [803.0, 4223.0], [805.0, 6741.0], [807.0, 7771.0], [825.0, 6353.0], [827.0, 8050.0], [811.0, 4371.5], [809.0, 8212.0], [813.0, 7588.0], [815.0, 7130.0], [819.0, 4872.5], [821.0, 7625.0], [823.0, 7485.0], [831.0, 7925.0], [817.0, 8529.0], [829.0, 6319.0], [863.0, 6323.0], [857.0, 7646.0], [847.0, 4391.0], [841.0, 7017.0], [843.0, 5204.0], [845.0, 7576.0], [853.0, 6169.0], [851.0, 7764.0], [849.0, 7143.0], [861.0, 7659.0], [859.0, 6428.0], [839.0, 6511.0], [837.0, 6530.0], [835.0, 6364.0], [833.0, 8541.0], [891.0, 6118.0], [889.0, 6955.0], [895.0, 8396.0], [881.0, 7203.0], [883.0, 7304.0], [885.0, 7323.0], [893.0, 6166.0], [871.0, 6333.0], [869.0, 6459.0], [867.0, 6679.0], [865.0, 6657.0], [879.0, 6836.0], [877.0, 7832.0], [875.0, 6266.0], [873.0, 7614.0], [887.0, 7118.0], [921.0, 3585.333333333333], [905.0, 3590.333333333333], [899.0, 7758.0], [903.0, 6290.0], [915.0, 4884.0], [913.0, 6779.0], [917.0, 6228.0], [919.0, 7990.0], [925.0, 7483.0], [923.0, 7494.0], [927.0, 4954.0], [901.0, 3671.666666666667], [907.0, 3532.0], [909.0, 3832.5], [911.0, 6054.0], [897.0, 6195.0], [929.0, 4005.666666666667], [955.0, 6680.0], [933.0, 5108.0], [931.0, 7466.5], [935.0, 6964.0], [937.0, 7270.0], [939.0, 6044.0], [941.0, 7210.0], [943.0, 6504.0], [959.0, 5938.0], [945.0, 7879.0], [947.0, 7233.0], [949.0, 6406.0], [951.0, 6208.0], [957.0, 7333.0], [953.0, 7966.0], [985.0, 5715.0], [989.0, 5583.0], [981.0, 8050.0], [987.0, 5628.0], [967.0, 6342.0], [965.0, 5765.0], [963.0, 6716.0], [961.0, 6409.0], [975.0, 6722.0], [973.0, 6235.0], [971.0, 7579.0], [969.0, 5972.0], [983.0, 8185.0], [1021.0, 6509.0], [1023.0, 7136.0], [1009.0, 7009.0], [1011.0, 5646.0], [1013.0, 5586.0], [1019.0, 7206.0], [1017.0, 6696.0], [1007.0, 6557.0], [993.0, 7147.0], [995.0, 6940.0], [999.0, 7630.0], [1005.0, 7464.0], [1001.0, 5754.0], [1015.0, 6361.0], [1074.0, 6847.0], [1086.0, 7170.0], [1058.0, 5966.0], [1062.0, 7387.0], [1082.0, 6442.0], [1054.0, 7337.0], [1026.0, 8042.0], [1030.0, 6934.0], [1034.0, 6208.0], [1038.0, 6699.5], [1050.0, 5640.0], [1046.0, 7051.0], [1042.0, 6473.0], [1070.0, 5467.0], [1066.0, 6313.0], [1098.0, 2785.0], [1118.0, 3397.25], [1090.0, 5180.0], [1122.0, 3282.1666666666665], [1126.0, 3457.6666666666665], [1130.0, 2775.5], [1134.0, 7116.0], [1094.0, 4551.333333333333], [1138.0, 4046.5], [1142.0, 5846.0], [1146.0, 3693.8], [1150.0, 3697.0], [1102.0, 2114.0], [1114.0, 3369.0], [1110.0, 3626.0], [1106.0, 2689.5], [1158.0, 3280.2], [1162.0, 5956.0], [1178.0, 5111.0], [1182.0, 5360.0], [1154.0, 6016.0], [1174.0, 3499.0], [1166.0, 4840.5], [1190.0, 4138.0], [1194.0, 4246.5], [1198.0, 6103.0], [1186.0, 5956.0], [1214.0, 4564.5], [1210.0, 4101.0], [1206.0, 3239.166666666667], [1202.0, 5138.0], [1170.0, 7041.0], [1230.0, 4019.0], [1222.0, 3620.3333333333335], [1218.0, 6460.0], [1226.0, 4702.0], [1270.0, 3382.25], [1278.0, 3992.333333333333], [1274.0, 6719.0], [1266.0, 4967.0], [1258.0, 6527.0], [1254.0, 6642.0], [1262.0, 5316.0], [1250.0, 3700.75], [1234.0, 5590.0], [1238.0, 4544.0], [1242.0, 5104.0], [1246.0, 3855.0], [1290.0, 3951.5], [1294.0, 3732.0], [1282.0, 4259.0], [1306.0, 4121.5], [1310.0, 5457.0], [1286.0, 5188.0], [1314.0, 5291.0], [1342.0, 5108.0], [1338.0, 5526.0], [1334.0, 7358.0], [1330.0, 6322.0], [1322.0, 3694.0], [1318.0, 6020.0], [1326.0, 6539.0], [1298.0, 4382.0], [1302.0, 4377.0], [1346.0, 4739.666666666667], [1370.0, 4150.5], [1374.0, 4003.5], [1362.0, 4748.0], [1366.0, 5076.0], [1350.0, 3922.0], [1358.0, 4048.0], [1394.0, 5359.0], [1398.0, 3812.0], [1402.0, 3452.75], [1406.0, 6381.0], [1390.0, 4894.0], [1386.0, 3804.0], [1382.0, 3751.6], [1378.0, 5637.0], [1418.0, 5542.0], [1466.0, 4671.0], [1410.0, 3065.8], [1434.0, 4343.5], [1438.0, 3808.0], [1414.0, 5552.0], [1458.0, 4077.6666666666665], [1422.0, 5208.0], [1462.0, 5867.0], [1470.0, 4745.0], [1450.0, 3766.25], [1446.0, 5784.0], [1442.0, 5279.0], [1454.0, 5007.0], [1426.0, 5255.0], [1430.0, 5174.0], [1482.0, 4048.5], [1530.0, 4669.0], [1474.0, 5402.0], [1502.0, 4129.4], [1494.0, 4601.0], [1498.0, 6046.0], [1478.0, 4496.5], [1510.0, 4380.0], [1514.0, 4694.5], [1518.0, 4744.0], [1506.0, 3783.5], [1486.0, 5790.0], [1522.0, 4886.0], [1526.0, 5925.0], [1534.0, 4574.0], [1550.0, 4179.0], [1542.0, 3743.0], [1566.0, 4924.0], [1538.0, 5447.0], [1546.0, 4510.0], [1578.0, 3230.6666666666665], [1582.0, 6198.0], [1574.0, 4825.0], [1570.0, 5652.0], [1598.0, 4965.666666666667], [1590.0, 4477.0], [1594.0, 5142.0], [1586.0, 5612.0], [1558.0, 5140.5], [1554.0, 4729.0], [1562.0, 4119.666666666667], [1602.0, 4268.0], [1614.0, 3920.3333333333335], [1630.0, 5334.0], [1626.0, 3795.5], [1618.0, 4164.0], [1622.0, 5387.0], [1610.0, 4814.0], [1606.0, 3991.0], [1650.0, 4202.0], [1654.0, 5014.0], [1658.0, 3907.0], [1662.0, 4716.5], [1638.0, 5354.0], [1646.0, 4753.0], [1642.0, 3598.0], [1670.0, 4289.0], [1666.0, 4373.0], [1694.0, 5230.0], [1690.0, 4835.0], [1682.0, 5630.0], [1674.0, 5943.0], [1714.0, 4615.0], [1718.0, 4617.0], [1722.0, 4623.0], [1726.0, 4054.0], [1698.0, 4321.5], [1702.0, 4979.0], [1706.0, 4693.0], [1710.0, 4305.0], [1678.0, 4562.0], [1738.0, 3780.3333333333335], [1742.0, 4142.75], [1730.0, 4357.0], [1754.0, 4478.0], [1758.0, 4601.75], [1750.0, 4554.0], [1734.0, 4593.0], [1778.0, 4334.0], [1782.0, 4254.5], [1790.0, 4326.0], [1762.0, 3761.6666666666665], [1766.0, 5354.0], [1770.0, 4372.0], [1774.0, 4602.25], [1746.0, 3832.0], [1798.0, 4259.0], [1822.0, 3836.5], [1814.0, 3748.0], [1818.0, 4210.0], [1794.0, 4319.0], [1854.0, 4606.0], [1850.0, 4516.0], [1846.0, 3954.0], [1806.0, 4291.5], [1842.0, 3875.0], [1826.0, 4223.0], [1830.0, 4122.0], [1834.0, 4537.0], [1838.0, 3964.0], [1810.0, 3961.0], [1858.0, 3930.0], [1862.0, 4291.5], [1866.0, 3835.0], [1083.0, 5328.0], [1087.0, 5392.0], [1059.0, 7189.0], [1063.0, 7122.0], [1067.0, 5765.0], [1079.0, 5527.5], [1075.0, 5957.0], [1055.0, 5734.0], [1027.0, 6566.0], [1031.0, 7492.0], [1039.0, 7200.0], [1035.0, 6913.0], [1051.0, 5465.0], [1047.0, 6180.0], [1043.0, 5829.0], [1071.0, 7103.0], [1123.0, 2385.2], [1127.0, 3707.333333333333], [1135.0, 3469.5], [1131.0, 4763.666666666667], [1151.0, 6051.0], [1147.0, 5443.0], [1119.0, 3656.0], [1091.0, 5378.0], [1095.0, 4481.0], [1099.0, 3637.8], [1103.0, 4031.4], [1143.0, 4773.0], [1139.0, 6101.0], [1115.0, 3333.75], [1111.0, 3483.5], [1107.0, 4560.666666666667], [1163.0, 3593.75], [1159.0, 3269.0], [1155.0, 5085.0], [1183.0, 3794.333333333333], [1175.0, 3436.0], [1179.0, 5273.0], [1167.0, 3677.0], [1191.0, 5872.0], [1195.0, 4849.0], [1199.0, 4718.0], [1215.0, 3650.0], [1187.0, 5110.0], [1211.0, 3939.5], [1207.0, 3599.0], [1203.0, 6452.0], [1171.0, 5957.0], [1267.0, 5169.0], [1227.0, 4938.0], [1223.0, 5577.0], [1231.0, 6141.0], [1219.0, 3972.0], [1247.0, 6179.0], [1271.0, 3617.3333333333335], [1279.0, 5248.0], [1275.0, 5225.0], [1263.0, 4170.0], [1259.0, 3803.0], [1255.0, 5062.0], [1251.0, 3969.0], [1235.0, 3800.333333333333], [1243.0, 3158.0], [1239.0, 3058.0], [1291.0, 5489.0], [1331.0, 5362.0], [1283.0, 3150.6666666666665], [1311.0, 3789.25], [1307.0, 4626.5], [1287.0, 3917.0], [1295.0, 4940.0], [1335.0, 4139.0], [1343.0, 4783.5], [1339.0, 4978.0], [1319.0, 6276.0], [1323.0, 4380.0], [1315.0, 4732.5], [1299.0, 4095.0], [1347.0, 3659.25], [1375.0, 3937.6666666666665], [1371.0, 5779.0], [1363.0, 4515.5], [1367.0, 4379.0], [1355.0, 6051.5], [1351.0, 6744.0], [1359.0, 5622.0], [1395.0, 3366.5], [1407.0, 3634.6666666666665], [1403.0, 5391.0], [1399.0, 4622.5], [1379.0, 3748.5], [1387.0, 3279.0], [1391.0, 4592.5], [1383.0, 3422.4], [1419.0, 6141.0], [1439.0, 4352.0], [1411.0, 4176.666666666667], [1415.0, 6389.0], [1423.0, 4345.0], [1459.0, 4018.6666666666665], [1443.0, 5394.0], [1471.0, 4211.0], [1467.0, 6715.0], [1463.0, 4661.0], [1447.0, 4422.5], [1451.0, 4102.0], [1455.0, 5865.0], [1427.0, 4032.0], [1431.0, 4572.0], [1435.0, 5733.0], [1479.0, 4192.0], [1475.0, 4784.0], [1503.0, 4313.5], [1495.0, 4013.6666666666665], [1499.0, 3644.0], [1491.0, 3917.8], [1483.0, 4966.0], [1507.0, 4174.0], [1515.0, 3505.0], [1511.0, 5535.0], [1519.0, 4236.5], [1535.0, 3970.0], [1531.0, 5162.0], [1527.0, 5477.0], [1523.0, 5119.0], [1487.0, 5810.0], [1539.0, 5334.0], [1543.0, 4996.0], [1563.0, 5734.0], [1559.0, 5758.0], [1555.0, 6356.0], [1567.0, 4970.0], [1547.0, 4646.0], [1551.0, 4272.0], [1579.0, 4467.8], [1583.0, 4223.333333333333], [1595.0, 3851.5], [1599.0, 3996.6666666666665], [1571.0, 4809.0], [1575.0, 4664.0], [1591.0, 4117.0], [1587.0, 3541.0], [1603.0, 4014.5], [1607.0, 4907.5], [1627.0, 3570.0], [1631.0, 5469.0], [1619.0, 4016.25], [1623.0, 5002.0], [1611.0, 4323.0], [1615.0, 4359.0], [1651.0, 4293.5], [1655.0, 3690.5], [1659.0, 4529.0], [1663.0, 3892.5], [1639.0, 5258.0], [1643.0, 3440.0], [1647.0, 5982.0], [1635.0, 4177.0], [1667.0, 4545.0], [1671.0, 3923.0], [1691.0, 3652.0], [1695.0, 5238.0], [1687.0, 5079.5], [1683.0, 4163.0], [1675.0, 4629.666666666667], [1679.0, 4382.5], [1715.0, 4736.0], [1719.0, 4457.0], [1727.0, 4810.0], [1723.0, 3973.0], [1703.0, 5092.0], [1699.0, 3921.0], [1707.0, 4666.0], [1711.0, 4235.0], [1735.0, 4239.0], [1759.0, 3604.0], [1731.0, 4272.0], [1755.0, 4471.0], [1751.0, 4599.0], [1747.0, 4086.166666666667], [1739.0, 4167.333333333333], [1743.0, 4572.5], [1783.0, 4316.0], [1787.0, 4209.0], [1791.0, 4194.0], [1779.0, 3534.0], [1767.0, 4452.0], [1763.0, 4154.0], [1771.0, 3979.5], [1775.0, 4189.666666666667], [1799.0, 4282.0], [1823.0, 3314.0], [1815.0, 3907.0], [1819.0, 3937.5], [1795.0, 3945.5], [1803.0, 4636.666666666667], [1855.0, 5172.0], [1851.0, 3564.5], [1847.0, 3914.5], [1843.0, 4043.0], [1807.0, 4112.0], [1827.0, 3918.0], [1831.0, 4291.5], [1839.0, 4712.0], [1811.0, 4045.0], [1863.0, 3976.5], [1859.0, 4309.5], [1867.0, 3988.0], [1.0, 9253.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[997.8346666666704, 5301.479666666666]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1868.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12700.0, "minX": 1.5495831E12, "maxY": 20997.216666666667, "series": [{"data": [[1.5495831E12, 20997.216666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495831E12, 12700.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 5301.479666666666, "minX": 1.5495831E12, "maxY": 5301.479666666666, "series": [{"data": [[1.5495831E12, 5301.479666666666]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 5301.471666666664, "minX": 1.5495831E12, "maxY": 5301.471666666664, "series": [{"data": [[1.5495831E12, 5301.471666666664]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 54.088333333333324, "minX": 1.5495831E12, "maxY": 54.088333333333324, "series": [{"data": [[1.5495831E12, 54.088333333333324]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 313.0, "minX": 1.5495831E12, "maxY": 11491.0, "series": [{"data": [[1.5495831E12, 11491.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495831E12, 313.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495831E12, 8976.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495831E12, 10672.769999999995]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495831E12, 9422.649999999998]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 5084.5, "minX": 50.0, "maxY": 5084.5, "series": [{"data": [[50.0, 5084.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 5084.5, "minX": 50.0, "maxY": 5084.5, "series": [{"data": [[50.0, 5084.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5495831E12, "maxY": 50.0, "series": [{"data": [[1.5495831E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5495831E12, "maxY": 50.0, "series": [{"data": [[1.5495831E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5495831E12, "maxY": 50.0, "series": [{"data": [[1.5495831E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Transactions Per Second"}},
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
