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
        data: {"result": {"minY": 194.0, "minX": 0.0, "maxY": 6219.0, "series": [{"data": [[0.0, 194.0], [0.1, 213.0], [0.2, 217.0], [0.3, 247.0], [0.4, 255.0], [0.5, 261.0], [0.6, 263.0], [0.7, 268.0], [0.8, 281.0], [0.9, 284.0], [1.0, 288.0], [1.1, 299.0], [1.2, 304.0], [1.3, 305.0], [1.4, 306.0], [1.5, 315.0], [1.6, 321.0], [1.7, 322.0], [1.8, 328.0], [1.9, 331.0], [2.0, 338.0], [2.1, 344.0], [2.2, 356.0], [2.3, 359.0], [2.4, 363.0], [2.5, 368.0], [2.6, 373.0], [2.7, 377.0], [2.8, 384.0], [2.9, 393.0], [3.0, 402.0], [3.1, 414.0], [3.2, 496.0], [3.3, 523.0], [3.4, 607.0], [3.5, 619.0], [3.6, 667.0], [3.7, 692.0], [3.8, 707.0], [3.9, 721.0], [4.0, 756.0], [4.1, 779.0], [4.2, 782.0], [4.3, 804.0], [4.4, 819.0], [4.5, 822.0], [4.6, 837.0], [4.7, 844.0], [4.8, 860.0], [4.9, 866.0], [5.0, 878.0], [5.1, 880.0], [5.2, 895.0], [5.3, 915.0], [5.4, 926.0], [5.5, 928.0], [5.6, 932.0], [5.7, 951.0], [5.8, 966.0], [5.9, 971.0], [6.0, 992.0], [6.1, 993.0], [6.2, 1001.0], [6.3, 1027.0], [6.4, 1039.0], [6.5, 1042.0], [6.6, 1060.0], [6.7, 1070.0], [6.8, 1076.0], [6.9, 1077.0], [7.0, 1082.0], [7.1, 1087.0], [7.2, 1098.0], [7.3, 1103.0], [7.4, 1108.0], [7.5, 1115.0], [7.6, 1125.0], [7.7, 1132.0], [7.8, 1136.0], [7.9, 1137.0], [8.0, 1144.0], [8.1, 1148.0], [8.2, 1155.0], [8.3, 1160.0], [8.4, 1165.0], [8.5, 1166.0], [8.6, 1179.0], [8.7, 1180.0], [8.8, 1193.0], [8.9, 1197.0], [9.0, 1208.0], [9.1, 1212.0], [9.2, 1216.0], [9.3, 1227.0], [9.4, 1233.0], [9.5, 1237.0], [9.6, 1246.0], [9.7, 1264.0], [9.8, 1279.0], [9.9, 1280.0], [10.0, 1285.0], [10.1, 1289.0], [10.2, 1289.0], [10.3, 1297.0], [10.4, 1297.0], [10.5, 1312.0], [10.6, 1314.0], [10.7, 1317.0], [10.8, 1323.0], [10.9, 1338.0], [11.0, 1338.0], [11.1, 1340.0], [11.2, 1351.0], [11.3, 1358.0], [11.4, 1365.0], [11.5, 1374.0], [11.6, 1375.0], [11.7, 1383.0], [11.8, 1386.0], [11.9, 1393.0], [12.0, 1395.0], [12.1, 1397.0], [12.2, 1400.0], [12.3, 1415.0], [12.4, 1420.0], [12.5, 1444.0], [12.6, 1454.0], [12.7, 1460.0], [12.8, 1477.0], [12.9, 1489.0], [13.0, 1497.0], [13.1, 1505.0], [13.2, 1527.0], [13.3, 1543.0], [13.4, 1546.0], [13.5, 1551.0], [13.6, 1559.0], [13.7, 1564.0], [13.8, 1571.0], [13.9, 1575.0], [14.0, 1578.0], [14.1, 1583.0], [14.2, 1589.0], [14.3, 1599.0], [14.4, 1612.0], [14.5, 1619.0], [14.6, 1621.0], [14.7, 1629.0], [14.8, 1634.0], [14.9, 1637.0], [15.0, 1641.0], [15.1, 1644.0], [15.2, 1651.0], [15.3, 1656.0], [15.4, 1660.0], [15.5, 1685.0], [15.6, 1691.0], [15.7, 1700.0], [15.8, 1702.0], [15.9, 1715.0], [16.0, 1718.0], [16.1, 1721.0], [16.2, 1723.0], [16.3, 1729.0], [16.4, 1740.0], [16.5, 1744.0], [16.6, 1750.0], [16.7, 1772.0], [16.8, 1777.0], [16.9, 1782.0], [17.0, 1787.0], [17.1, 1794.0], [17.2, 1799.0], [17.3, 1816.0], [17.4, 1818.0], [17.5, 1824.0], [17.6, 1834.0], [17.7, 1844.0], [17.8, 1845.0], [17.9, 1851.0], [18.0, 1857.0], [18.1, 1865.0], [18.2, 1868.0], [18.3, 1870.0], [18.4, 1871.0], [18.5, 1873.0], [18.6, 1881.0], [18.7, 1885.0], [18.8, 1887.0], [18.9, 1892.0], [19.0, 1894.0], [19.1, 1897.0], [19.2, 1913.0], [19.3, 1922.0], [19.4, 1938.0], [19.5, 1945.0], [19.6, 1951.0], [19.7, 1962.0], [19.8, 1976.0], [19.9, 1980.0], [20.0, 1983.0], [20.1, 1989.0], [20.2, 1991.0], [20.3, 1996.0], [20.4, 2002.0], [20.5, 2005.0], [20.6, 2009.0], [20.7, 2013.0], [20.8, 2015.0], [20.9, 2022.0], [21.0, 2028.0], [21.1, 2038.0], [21.2, 2044.0], [21.3, 2050.0], [21.4, 2053.0], [21.5, 2066.0], [21.6, 2071.0], [21.7, 2081.0], [21.8, 2091.0], [21.9, 2096.0], [22.0, 2102.0], [22.1, 2110.0], [22.2, 2120.0], [22.3, 2126.0], [22.4, 2126.0], [22.5, 2129.0], [22.6, 2131.0], [22.7, 2143.0], [22.8, 2144.0], [22.9, 2148.0], [23.0, 2153.0], [23.1, 2158.0], [23.2, 2165.0], [23.3, 2168.0], [23.4, 2175.0], [23.5, 2179.0], [23.6, 2182.0], [23.7, 2188.0], [23.8, 2198.0], [23.9, 2204.0], [24.0, 2213.0], [24.1, 2216.0], [24.2, 2218.0], [24.3, 2220.0], [24.4, 2229.0], [24.5, 2236.0], [24.6, 2237.0], [24.7, 2238.0], [24.8, 2240.0], [24.9, 2242.0], [25.0, 2244.0], [25.1, 2247.0], [25.2, 2253.0], [25.3, 2254.0], [25.4, 2256.0], [25.5, 2261.0], [25.6, 2266.0], [25.7, 2272.0], [25.8, 2277.0], [25.9, 2282.0], [26.0, 2288.0], [26.1, 2295.0], [26.2, 2303.0], [26.3, 2304.0], [26.4, 2306.0], [26.5, 2307.0], [26.6, 2311.0], [26.7, 2316.0], [26.8, 2328.0], [26.9, 2329.0], [27.0, 2332.0], [27.1, 2332.0], [27.2, 2334.0], [27.3, 2336.0], [27.4, 2345.0], [27.5, 2348.0], [27.6, 2355.0], [27.7, 2357.0], [27.8, 2363.0], [27.9, 2372.0], [28.0, 2380.0], [28.1, 2387.0], [28.2, 2388.0], [28.3, 2391.0], [28.4, 2397.0], [28.5, 2400.0], [28.6, 2409.0], [28.7, 2414.0], [28.8, 2423.0], [28.9, 2428.0], [29.0, 2438.0], [29.1, 2447.0], [29.2, 2453.0], [29.3, 2455.0], [29.4, 2469.0], [29.5, 2472.0], [29.6, 2474.0], [29.7, 2482.0], [29.8, 2483.0], [29.9, 2492.0], [30.0, 2504.0], [30.1, 2508.0], [30.2, 2514.0], [30.3, 2516.0], [30.4, 2524.0], [30.5, 2532.0], [30.6, 2534.0], [30.7, 2537.0], [30.8, 2544.0], [30.9, 2545.0], [31.0, 2553.0], [31.1, 2558.0], [31.2, 2559.0], [31.3, 2561.0], [31.4, 2563.0], [31.5, 2567.0], [31.6, 2570.0], [31.7, 2574.0], [31.8, 2583.0], [31.9, 2586.0], [32.0, 2589.0], [32.1, 2594.0], [32.2, 2606.0], [32.3, 2610.0], [32.4, 2611.0], [32.5, 2617.0], [32.6, 2619.0], [32.7, 2625.0], [32.8, 2626.0], [32.9, 2631.0], [33.0, 2636.0], [33.1, 2639.0], [33.2, 2641.0], [33.3, 2645.0], [33.4, 2654.0], [33.5, 2661.0], [33.6, 2664.0], [33.7, 2667.0], [33.8, 2668.0], [33.9, 2675.0], [34.0, 2679.0], [34.1, 2684.0], [34.2, 2687.0], [34.3, 2692.0], [34.4, 2705.0], [34.5, 2713.0], [34.6, 2718.0], [34.7, 2723.0], [34.8, 2728.0], [34.9, 2729.0], [35.0, 2736.0], [35.1, 2737.0], [35.2, 2743.0], [35.3, 2745.0], [35.4, 2748.0], [35.5, 2753.0], [35.6, 2755.0], [35.7, 2768.0], [35.8, 2776.0], [35.9, 2777.0], [36.0, 2778.0], [36.1, 2779.0], [36.2, 2780.0], [36.3, 2784.0], [36.4, 2797.0], [36.5, 2801.0], [36.6, 2803.0], [36.7, 2806.0], [36.8, 2807.0], [36.9, 2812.0], [37.0, 2814.0], [37.1, 2818.0], [37.2, 2820.0], [37.3, 2826.0], [37.4, 2828.0], [37.5, 2829.0], [37.6, 2833.0], [37.7, 2836.0], [37.8, 2840.0], [37.9, 2850.0], [38.0, 2854.0], [38.1, 2857.0], [38.2, 2866.0], [38.3, 2869.0], [38.4, 2871.0], [38.5, 2875.0], [38.6, 2877.0], [38.7, 2885.0], [38.8, 2889.0], [38.9, 2894.0], [39.0, 2896.0], [39.1, 2897.0], [39.2, 2900.0], [39.3, 2901.0], [39.4, 2910.0], [39.5, 2912.0], [39.6, 2914.0], [39.7, 2915.0], [39.8, 2919.0], [39.9, 2920.0], [40.0, 2926.0], [40.1, 2933.0], [40.2, 2933.0], [40.3, 2936.0], [40.4, 2938.0], [40.5, 2941.0], [40.6, 2943.0], [40.7, 2945.0], [40.8, 2957.0], [40.9, 2961.0], [41.0, 2968.0], [41.1, 2971.0], [41.2, 2981.0], [41.3, 2984.0], [41.4, 2988.0], [41.5, 2993.0], [41.6, 2996.0], [41.7, 2997.0], [41.8, 3000.0], [41.9, 3001.0], [42.0, 3006.0], [42.1, 3012.0], [42.2, 3017.0], [42.3, 3019.0], [42.4, 3020.0], [42.5, 3024.0], [42.6, 3033.0], [42.7, 3038.0], [42.8, 3038.0], [42.9, 3043.0], [43.0, 3049.0], [43.1, 3056.0], [43.2, 3063.0], [43.3, 3066.0], [43.4, 3070.0], [43.5, 3072.0], [43.6, 3073.0], [43.7, 3078.0], [43.8, 3081.0], [43.9, 3085.0], [44.0, 3092.0], [44.1, 3095.0], [44.2, 3100.0], [44.3, 3111.0], [44.4, 3117.0], [44.5, 3118.0], [44.6, 3126.0], [44.7, 3133.0], [44.8, 3134.0], [44.9, 3134.0], [45.0, 3136.0], [45.1, 3142.0], [45.2, 3146.0], [45.3, 3148.0], [45.4, 3151.0], [45.5, 3155.0], [45.6, 3162.0], [45.7, 3166.0], [45.8, 3169.0], [45.9, 3172.0], [46.0, 3175.0], [46.1, 3178.0], [46.2, 3186.0], [46.3, 3195.0], [46.4, 3199.0], [46.5, 3201.0], [46.6, 3203.0], [46.7, 3204.0], [46.8, 3210.0], [46.9, 3216.0], [47.0, 3218.0], [47.1, 3218.0], [47.2, 3220.0], [47.3, 3225.0], [47.4, 3235.0], [47.5, 3238.0], [47.6, 3245.0], [47.7, 3249.0], [47.8, 3256.0], [47.9, 3258.0], [48.0, 3259.0], [48.1, 3266.0], [48.2, 3279.0], [48.3, 3284.0], [48.4, 3285.0], [48.5, 3289.0], [48.6, 3292.0], [48.7, 3293.0], [48.8, 3299.0], [48.9, 3306.0], [49.0, 3310.0], [49.1, 3313.0], [49.2, 3317.0], [49.3, 3319.0], [49.4, 3321.0], [49.5, 3326.0], [49.6, 3327.0], [49.7, 3328.0], [49.8, 3336.0], [49.9, 3337.0], [50.0, 3346.0], [50.1, 3348.0], [50.2, 3355.0], [50.3, 3360.0], [50.4, 3362.0], [50.5, 3367.0], [50.6, 3372.0], [50.7, 3377.0], [50.8, 3381.0], [50.9, 3385.0], [51.0, 3386.0], [51.1, 3387.0], [51.2, 3390.0], [51.3, 3394.0], [51.4, 3401.0], [51.5, 3403.0], [51.6, 3418.0], [51.7, 3428.0], [51.8, 3431.0], [51.9, 3434.0], [52.0, 3437.0], [52.1, 3440.0], [52.2, 3447.0], [52.3, 3464.0], [52.4, 3468.0], [52.5, 3471.0], [52.6, 3474.0], [52.7, 3482.0], [52.8, 3490.0], [52.9, 3499.0], [53.0, 3504.0], [53.1, 3506.0], [53.2, 3509.0], [53.3, 3515.0], [53.4, 3523.0], [53.5, 3527.0], [53.6, 3527.0], [53.7, 3529.0], [53.8, 3533.0], [53.9, 3545.0], [54.0, 3549.0], [54.1, 3554.0], [54.2, 3557.0], [54.3, 3560.0], [54.4, 3563.0], [54.5, 3565.0], [54.6, 3572.0], [54.7, 3574.0], [54.8, 3583.0], [54.9, 3591.0], [55.0, 3594.0], [55.1, 3598.0], [55.2, 3601.0], [55.3, 3605.0], [55.4, 3607.0], [55.5, 3611.0], [55.6, 3615.0], [55.7, 3622.0], [55.8, 3626.0], [55.9, 3628.0], [56.0, 3634.0], [56.1, 3637.0], [56.2, 3640.0], [56.3, 3644.0], [56.4, 3645.0], [56.5, 3646.0], [56.6, 3648.0], [56.7, 3656.0], [56.8, 3661.0], [56.9, 3670.0], [57.0, 3673.0], [57.1, 3677.0], [57.2, 3677.0], [57.3, 3684.0], [57.4, 3690.0], [57.5, 3697.0], [57.6, 3699.0], [57.7, 3701.0], [57.8, 3706.0], [57.9, 3708.0], [58.0, 3711.0], [58.1, 3715.0], [58.2, 3722.0], [58.3, 3724.0], [58.4, 3727.0], [58.5, 3729.0], [58.6, 3730.0], [58.7, 3731.0], [58.8, 3736.0], [58.9, 3741.0], [59.0, 3745.0], [59.1, 3750.0], [59.2, 3754.0], [59.3, 3759.0], [59.4, 3761.0], [59.5, 3763.0], [59.6, 3766.0], [59.7, 3767.0], [59.8, 3768.0], [59.9, 3772.0], [60.0, 3776.0], [60.1, 3783.0], [60.2, 3784.0], [60.3, 3785.0], [60.4, 3790.0], [60.5, 3792.0], [60.6, 3792.0], [60.7, 3795.0], [60.8, 3796.0], [60.9, 3800.0], [61.0, 3804.0], [61.1, 3805.0], [61.2, 3809.0], [61.3, 3815.0], [61.4, 3816.0], [61.5, 3825.0], [61.6, 3829.0], [61.7, 3830.0], [61.8, 3832.0], [61.9, 3841.0], [62.0, 3844.0], [62.1, 3845.0], [62.2, 3845.0], [62.3, 3850.0], [62.4, 3851.0], [62.5, 3852.0], [62.6, 3858.0], [62.7, 3858.0], [62.8, 3861.0], [62.9, 3867.0], [63.0, 3868.0], [63.1, 3874.0], [63.2, 3877.0], [63.3, 3879.0], [63.4, 3887.0], [63.5, 3889.0], [63.6, 3896.0], [63.7, 3900.0], [63.8, 3904.0], [63.9, 3905.0], [64.0, 3909.0], [64.1, 3913.0], [64.2, 3914.0], [64.3, 3916.0], [64.4, 3920.0], [64.5, 3922.0], [64.6, 3923.0], [64.7, 3926.0], [64.8, 3928.0], [64.9, 3928.0], [65.0, 3937.0], [65.1, 3941.0], [65.2, 3943.0], [65.3, 3949.0], [65.4, 3953.0], [65.5, 3960.0], [65.6, 3963.0], [65.7, 3968.0], [65.8, 3969.0], [65.9, 3971.0], [66.0, 3975.0], [66.1, 3977.0], [66.2, 3982.0], [66.3, 3984.0], [66.4, 3988.0], [66.5, 3991.0], [66.6, 3995.0], [66.7, 3998.0], [66.8, 4001.0], [66.9, 4008.0], [67.0, 4012.0], [67.1, 4016.0], [67.2, 4016.0], [67.3, 4024.0], [67.4, 4025.0], [67.5, 4029.0], [67.6, 4034.0], [67.7, 4036.0], [67.8, 4041.0], [67.9, 4044.0], [68.0, 4049.0], [68.1, 4050.0], [68.2, 4052.0], [68.3, 4054.0], [68.4, 4055.0], [68.5, 4057.0], [68.6, 4063.0], [68.7, 4067.0], [68.8, 4073.0], [68.9, 4078.0], [69.0, 4080.0], [69.1, 4082.0], [69.2, 4085.0], [69.3, 4087.0], [69.4, 4089.0], [69.5, 4091.0], [69.6, 4095.0], [69.7, 4097.0], [69.8, 4098.0], [69.9, 4101.0], [70.0, 4104.0], [70.1, 4107.0], [70.2, 4108.0], [70.3, 4113.0], [70.4, 4114.0], [70.5, 4117.0], [70.6, 4118.0], [70.7, 4126.0], [70.8, 4127.0], [70.9, 4128.0], [71.0, 4130.0], [71.1, 4134.0], [71.2, 4139.0], [71.3, 4140.0], [71.4, 4142.0], [71.5, 4145.0], [71.6, 4147.0], [71.7, 4149.0], [71.8, 4150.0], [71.9, 4157.0], [72.0, 4159.0], [72.1, 4161.0], [72.2, 4163.0], [72.3, 4165.0], [72.4, 4167.0], [72.5, 4168.0], [72.6, 4171.0], [72.7, 4173.0], [72.8, 4179.0], [72.9, 4181.0], [73.0, 4187.0], [73.1, 4190.0], [73.2, 4193.0], [73.3, 4196.0], [73.4, 4199.0], [73.5, 4202.0], [73.6, 4206.0], [73.7, 4208.0], [73.8, 4214.0], [73.9, 4216.0], [74.0, 4220.0], [74.1, 4220.0], [74.2, 4222.0], [74.3, 4223.0], [74.4, 4225.0], [74.5, 4230.0], [74.6, 4231.0], [74.7, 4234.0], [74.8, 4239.0], [74.9, 4242.0], [75.0, 4248.0], [75.1, 4251.0], [75.2, 4254.0], [75.3, 4255.0], [75.4, 4256.0], [75.5, 4260.0], [75.6, 4266.0], [75.7, 4267.0], [75.8, 4270.0], [75.9, 4273.0], [76.0, 4274.0], [76.1, 4279.0], [76.2, 4286.0], [76.3, 4293.0], [76.4, 4301.0], [76.5, 4302.0], [76.6, 4303.0], [76.7, 4304.0], [76.8, 4306.0], [76.9, 4313.0], [77.0, 4317.0], [77.1, 4318.0], [77.2, 4320.0], [77.3, 4323.0], [77.4, 4329.0], [77.5, 4329.0], [77.6, 4331.0], [77.7, 4337.0], [77.8, 4339.0], [77.9, 4344.0], [78.0, 4348.0], [78.1, 4349.0], [78.2, 4359.0], [78.3, 4364.0], [78.4, 4366.0], [78.5, 4369.0], [78.6, 4372.0], [78.7, 4375.0], [78.8, 4379.0], [78.9, 4383.0], [79.0, 4384.0], [79.1, 4386.0], [79.2, 4390.0], [79.3, 4391.0], [79.4, 4398.0], [79.5, 4401.0], [79.6, 4408.0], [79.7, 4414.0], [79.8, 4414.0], [79.9, 4420.0], [80.0, 4425.0], [80.1, 4431.0], [80.2, 4434.0], [80.3, 4436.0], [80.4, 4438.0], [80.5, 4438.0], [80.6, 4447.0], [80.7, 4448.0], [80.8, 4451.0], [80.9, 4454.0], [81.0, 4457.0], [81.1, 4460.0], [81.2, 4462.0], [81.3, 4467.0], [81.4, 4469.0], [81.5, 4470.0], [81.6, 4473.0], [81.7, 4475.0], [81.8, 4483.0], [81.9, 4485.0], [82.0, 4487.0], [82.1, 4487.0], [82.2, 4489.0], [82.3, 4493.0], [82.4, 4499.0], [82.5, 4505.0], [82.6, 4511.0], [82.7, 4515.0], [82.8, 4520.0], [82.9, 4527.0], [83.0, 4533.0], [83.1, 4538.0], [83.2, 4540.0], [83.3, 4540.0], [83.4, 4542.0], [83.5, 4546.0], [83.6, 4551.0], [83.7, 4555.0], [83.8, 4561.0], [83.9, 4564.0], [84.0, 4564.0], [84.1, 4564.0], [84.2, 4572.0], [84.3, 4581.0], [84.4, 4583.0], [84.5, 4595.0], [84.6, 4596.0], [84.7, 4598.0], [84.8, 4605.0], [84.9, 4609.0], [85.0, 4613.0], [85.1, 4615.0], [85.2, 4624.0], [85.3, 4624.0], [85.4, 4626.0], [85.5, 4629.0], [85.6, 4631.0], [85.7, 4632.0], [85.8, 4638.0], [85.9, 4642.0], [86.0, 4644.0], [86.1, 4650.0], [86.2, 4659.0], [86.3, 4663.0], [86.4, 4665.0], [86.5, 4674.0], [86.6, 4675.0], [86.7, 4683.0], [86.8, 4683.0], [86.9, 4688.0], [87.0, 4693.0], [87.1, 4698.0], [87.2, 4698.0], [87.3, 4700.0], [87.4, 4706.0], [87.5, 4708.0], [87.6, 4710.0], [87.7, 4721.0], [87.8, 4733.0], [87.9, 4739.0], [88.0, 4741.0], [88.1, 4743.0], [88.2, 4746.0], [88.3, 4750.0], [88.4, 4762.0], [88.5, 4768.0], [88.6, 4773.0], [88.7, 4780.0], [88.8, 4784.0], [88.9, 4790.0], [89.0, 4794.0], [89.1, 4796.0], [89.2, 4797.0], [89.3, 4803.0], [89.4, 4819.0], [89.5, 4823.0], [89.6, 4829.0], [89.7, 4837.0], [89.8, 4839.0], [89.9, 4844.0], [90.0, 4858.0], [90.1, 4860.0], [90.2, 4862.0], [90.3, 4867.0], [90.4, 4871.0], [90.5, 4873.0], [90.6, 4879.0], [90.7, 4887.0], [90.8, 4888.0], [90.9, 4891.0], [91.0, 4894.0], [91.1, 4898.0], [91.2, 4904.0], [91.3, 4908.0], [91.4, 4913.0], [91.5, 4915.0], [91.6, 4916.0], [91.7, 4918.0], [91.8, 4919.0], [91.9, 4927.0], [92.0, 4928.0], [92.1, 4932.0], [92.2, 4938.0], [92.3, 4944.0], [92.4, 4950.0], [92.5, 4952.0], [92.6, 4956.0], [92.7, 4965.0], [92.8, 4971.0], [92.9, 4975.0], [93.0, 4979.0], [93.1, 4979.0], [93.2, 4980.0], [93.3, 4984.0], [93.4, 4987.0], [93.5, 5001.0], [93.6, 5005.0], [93.7, 5009.0], [93.8, 5016.0], [93.9, 5021.0], [94.0, 5027.0], [94.1, 5029.0], [94.2, 5031.0], [94.3, 5040.0], [94.4, 5052.0], [94.5, 5061.0], [94.6, 5068.0], [94.7, 5081.0], [94.8, 5091.0], [94.9, 5094.0], [95.0, 5112.0], [95.1, 5113.0], [95.2, 5118.0], [95.3, 5120.0], [95.4, 5129.0], [95.5, 5136.0], [95.6, 5143.0], [95.7, 5158.0], [95.8, 5164.0], [95.9, 5165.0], [96.0, 5173.0], [96.1, 5189.0], [96.2, 5192.0], [96.3, 5196.0], [96.4, 5208.0], [96.5, 5212.0], [96.6, 5214.0], [96.7, 5218.0], [96.8, 5224.0], [96.9, 5235.0], [97.0, 5237.0], [97.1, 5241.0], [97.2, 5270.0], [97.3, 5276.0], [97.4, 5292.0], [97.5, 5299.0], [97.6, 5314.0], [97.7, 5324.0], [97.8, 5334.0], [97.9, 5377.0], [98.0, 5389.0], [98.1, 5394.0], [98.2, 5425.0], [98.3, 5453.0], [98.4, 5469.0], [98.5, 5473.0], [98.6, 5482.0], [98.7, 5492.0], [98.8, 5520.0], [98.9, 5561.0], [99.0, 5571.0], [99.1, 5583.0], [99.2, 5608.0], [99.3, 5699.0], [99.4, 5759.0], [99.5, 5803.0], [99.6, 5878.0], [99.7, 5942.0], [99.8, 6028.0], [99.9, 6185.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 72.0, "series": [{"data": [[600.0, 7.0], [700.0, 11.0], [800.0, 19.0], [900.0, 19.0], [1000.0, 21.0], [1100.0, 34.0], [1200.0, 30.0], [1300.0, 33.0], [1400.0, 19.0], [1500.0, 25.0], [1600.0, 27.0], [1700.0, 32.0], [1800.0, 37.0], [1900.0, 24.0], [2000.0, 33.0], [2100.0, 37.0], [2300.0, 47.0], [2200.0, 46.0], [2400.0, 29.0], [2500.0, 45.0], [2600.0, 43.0], [2800.0, 56.0], [2700.0, 42.0], [2900.0, 51.0], [3000.0, 49.0], [3100.0, 45.0], [3200.0, 48.0], [3300.0, 50.0], [3400.0, 32.0], [3500.0, 44.0], [3700.0, 65.0], [3600.0, 50.0], [3800.0, 56.0], [3900.0, 62.0], [4000.0, 62.0], [4100.0, 72.0], [4300.0, 61.0], [4200.0, 58.0], [4600.0, 51.0], [4500.0, 46.0], [4400.0, 60.0], [4800.0, 38.0], [4700.0, 39.0], [5000.0, 31.0], [5100.0, 27.0], [4900.0, 46.0], [5200.0, 24.0], [5300.0, 12.0], [5400.0, 13.0], [5600.0, 3.0], [5500.0, 8.0], [5700.0, 3.0], [5800.0, 3.0], [5900.0, 3.0], [6000.0, 1.0], [6100.0, 2.0], [6200.0, 1.0], [100.0, 1.0], [200.0, 21.0], [300.0, 37.0], [400.0, 6.0], [500.0, 3.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 6200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 65.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1739.0, "series": [{"data": [[1.0, 196.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 65.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1739.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 579.4534999999994, "minX": 1.54958352E12, "maxY": 579.4534999999994, "series": [{"data": [[1.54958352E12, 579.4534999999994]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 299.0, "minX": 1.0, "maxY": 6219.0, "series": [{"data": [[2.0, 4642.0], [3.0, 4564.0], [4.0, 4464.0], [5.0, 4953.0], [7.0, 4164.5], [8.0, 4609.0], [9.0, 5494.0], [10.0, 4596.0], [11.0, 4780.0], [12.0, 4344.0], [13.0, 4965.0], [14.0, 4210.0], [16.0, 5083.0], [17.0, 4615.0], [18.0, 4912.0], [19.0, 5473.0], [20.0, 5262.0], [21.0, 5136.0], [22.0, 4710.0], [23.0, 4971.0], [24.0, 4659.0], [25.0, 5212.0], [26.0, 4431.0], [27.0, 5005.0], [29.0, 4687.0], [31.0, 4919.5], [33.0, 4814.0], [32.0, 5425.0], [34.0, 4627.0], [37.0, 4800.0], [36.0, 4591.5], [39.0, 2238.5], [38.0, 4683.0], [41.0, 1443.75], [40.0, 2382.0], [43.0, 2232.0], [42.0, 2037.0], [45.0, 1483.0], [44.0, 1930.0], [47.0, 2282.0], [46.0, 2748.0], [49.0, 1403.75], [48.0, 2707.5], [51.0, 1943.3333333333333], [50.0, 1095.8], [53.0, 2516.0], [52.0, 1635.6666666666667], [55.0, 2439.5], [54.0, 341.0], [57.0, 2683.5], [56.0, 363.0], [59.0, 891.125], [58.0, 1904.6666666666667], [61.0, 1069.4], [60.0, 1114.0], [63.0, 299.0], [62.0, 2548.0], [64.0, 1762.1666666666665], [65.0, 1792.0], [66.0, 1659.6666666666667], [67.0, 4613.0], [71.0, 4621.0], [70.0, 4691.0], [69.0, 4345.0], [68.0, 5394.0], [75.0, 5031.0], [74.0, 4256.5], [72.0, 4949.0], [79.0, 4487.5], [77.0, 4499.0], [76.0, 5237.0], [83.0, 4274.0], [82.0, 4865.0], [81.0, 4707.0], [80.0, 4126.0], [86.0, 4984.0], [85.0, 5023.0], [84.0, 4085.0], [91.0, 4391.0], [90.0, 5239.0], [89.0, 5172.0], [88.0, 4416.5], [95.0, 4242.0], [94.0, 4219.5], [92.0, 4101.0], [98.0, 4873.0], [97.0, 4087.0], [96.0, 4564.0], [103.0, 5233.0], [102.0, 4665.0], [100.0, 4683.5], [107.0, 4407.5], [105.0, 4644.0], [104.0, 4919.0], [111.0, 4791.0], [110.0, 4420.0], [109.0, 5081.0], [108.0, 5173.0], [115.0, 4146.5], [113.0, 4915.0], [112.0, 4739.0], [119.0, 4108.0], [118.0, 4938.0], [117.0, 4234.0], [116.0, 4162.0], [123.0, 5570.0], [122.0, 4727.0], [121.0, 5190.0], [120.0, 4287.0], [127.0, 6185.0], [126.0, 5214.0], [125.0, 5297.0], [124.0, 5241.0], [135.0, 4176.5], [133.0, 4638.0], [132.0, 4012.0], [131.0, 4918.0], [130.0, 4893.0], [129.0, 4206.0], [128.0, 4956.0], [143.0, 4631.0], [142.0, 4970.0], [141.0, 6141.0], [140.0, 5236.0], [139.0, 4679.0], [138.0, 4475.0], [137.0, 5321.0], [136.0, 5208.0], [151.0, 4256.0], [150.0, 4128.0], [149.0, 4796.0], [148.0, 5292.0], [147.0, 4984.0], [146.0, 4168.0], [145.0, 4511.0], [144.0, 4437.0], [159.0, 4189.0], [158.0, 4063.0], [157.0, 4171.0], [156.0, 4317.0], [155.0, 6219.0], [154.0, 4065.0], [153.0, 4486.0], [152.0, 4337.0], [167.0, 4205.0], [166.0, 4784.0], [165.0, 4521.0], [164.0, 4780.0], [163.0, 4509.5], [161.0, 5061.0], [160.0, 4179.0], [175.0, 4231.0], [174.0, 4977.0], [173.0, 5115.0], [171.0, 5112.0], [170.0, 5143.0], [169.0, 4073.0], [168.0, 4889.0], [183.0, 4538.0], [182.0, 4629.0], [181.0, 3977.0], [180.0, 4927.0], [179.0, 4482.0], [178.0, 5042.5], [176.0, 4301.0], [191.0, 4699.0], [190.0, 4055.0], [189.0, 5009.0], [188.0, 3949.0], [187.0, 5001.0], [186.0, 4190.0], [185.0, 4936.0], [184.0, 4735.0], [199.0, 4641.0], [198.0, 5334.5], [196.0, 4255.0], [195.0, 4199.0], [194.0, 4589.0], [193.0, 4114.0], [192.0, 4797.0], [207.0, 4350.0], [206.0, 3963.0], [205.0, 5453.0], [204.0, 4124.0], [203.0, 4542.0], [202.0, 4098.0], [201.0, 5195.0], [200.0, 5406.0], [215.0, 3844.0], [214.0, 4016.0], [213.0, 4867.0], [212.0, 4260.0], [211.0, 4884.0], [210.0, 4632.0], [208.0, 5699.0], [223.0, 951.0], [222.0, 2827.0], [221.0, 2490.5], [220.0, 2333.0], [219.0, 3804.0], [218.0, 4837.0], [217.0, 4368.0], [216.0, 4632.0], [224.0, 3508.6666666666665], [230.0, 2841.0], [231.0, 2380.5], [229.0, 4461.0], [228.0, 4721.0], [227.0, 4159.0], [226.0, 4420.0], [225.0, 4473.0], [236.0, 2458.0], [235.0, 2431.0], [238.0, 3988.0], [237.0, 4895.0], [234.0, 4695.0], [233.0, 5719.0], [232.0, 4472.0], [241.0, 2675.5], [247.0, 2652.5], [246.0, 3839.0], [245.0, 5380.0], [244.0, 4920.5], [242.0, 3937.0], [240.0, 4349.0], [248.0, 2528.5], [251.0, 2366.5], [253.0, 2228.333333333333], [254.0, 4438.0], [252.0, 3998.0], [250.0, 4451.0], [249.0, 4527.0], [270.0, 2497.5], [271.0, 4390.0], [269.0, 4230.0], [268.0, 4797.0], [267.0, 4058.0], [266.0, 4867.0], [265.0, 4042.0], [264.0, 3851.0], [263.0, 4024.0], [257.0, 4487.0], [256.0, 4436.5], [259.0, 4267.0], [258.0, 4467.0], [262.0, 3962.0], [260.0, 4583.0], [286.0, 3784.0], [281.0, 3142.0], [277.0, 2777.0], [276.0, 5042.0], [279.0, 4922.0], [273.0, 4928.0], [272.0, 4914.0], [275.0, 4829.0], [274.0, 4980.0], [278.0, 4919.0], [282.0, 2816.0], [283.0, 2914.5], [287.0, 5324.0], [285.0, 5970.0], [284.0, 3724.0], [280.0, 4273.0], [301.0, 5469.0], [289.0, 3193.5], [288.0, 4698.0], [291.0, 2983.0], [290.0, 3032.0], [293.0, 2480.0], [292.0, 5009.0], [294.0, 4913.0], [295.0, 5561.0], [296.0, 3121.0], [297.0, 4181.0], [299.0, 4540.0], [298.0, 4489.0], [303.0, 4928.0], [302.0, 4674.0], [300.0, 4339.0], [319.0, 4155.0], [308.0, 2521.5], [309.0, 4130.0], [311.0, 4703.0], [305.0, 3825.0], [304.0, 4515.0], [307.0, 4318.0], [306.0, 3677.0], [310.0, 4107.0], [312.0, 2467.5], [316.0, 2218.666666666667], [318.0, 3968.0], [317.0, 3913.0], [315.0, 3598.0], [314.0, 3673.0], [313.0, 4216.0], [333.0, 2389.5], [323.0, 2496.5], [327.0, 4016.0], [320.0, 3922.0], [322.0, 5118.0], [321.0, 4979.0], [325.0, 824.6666666666666], [324.0, 5389.0], [326.0, 3652.6666666666665], [334.0, 2754.0], [335.0, 3790.0], [332.0, 3506.0], [331.0, 5377.0], [330.0, 4487.0], [329.0, 3728.0], [328.0, 3707.0], [337.0, 2554.0], [341.0, 2449.0], [340.0, 2359.5], [343.0, 2614.0], [336.0, 4733.0], [342.0, 3926.0], [345.0, 1804.6], [347.0, 1966.25], [346.0, 1802.25], [344.0, 2812.5], [351.0, 5878.0], [350.0, 4469.0], [349.0, 3868.0], [348.0, 4414.0], [339.0, 4516.0], [355.0, 1700.0], [354.0, 3147.0], [353.0, 5214.0], [352.0, 3768.0], [359.0, 5027.0], [358.0, 5003.0], [357.0, 2015.6], [356.0, 1889.2], [361.0, 2870.0], [363.0, 2453.0], [362.0, 3438.0], [365.0, 1907.4], [364.0, 3265.0], [366.0, 1949.0], [367.0, 2337.5], [369.0, 1958.75], [368.0, 2158.333333333333], [370.0, 1215.5], [372.0, 2330.666666666667], [373.0, 3951.0], [371.0, 3753.0], [374.0, 2028.6666666666665], [375.0, 2494.0], [378.0, 2119.0], [379.0, 2965.0], [377.0, 2158.666666666667], [380.0, 1700.75], [382.0, 1713.8], [383.0, 2632.0], [376.0, 4858.0], [381.0, 2463.0], [398.0, 2012.25], [387.0, 2263.0], [392.0, 2281.666666666667], [391.0, 3179.0], [384.0, 4552.0], [386.0, 4401.0], [385.0, 3684.0], [390.0, 5113.0], [389.0, 5482.0], [388.0, 3564.0], [397.0, 2191.5], [396.0, 2771.5], [399.0, 4215.0], [395.0, 4819.0], [394.0, 5590.0], [393.0, 3750.0], [415.0, 4087.0], [407.0, 3313.5], [403.0, 2907.0], [402.0, 3464.0], [401.0, 5091.0], [400.0, 4744.0], [406.0, 3063.5], [405.0, 3785.0], [404.0, 4940.0], [411.0, 2699.0], [414.0, 4507.0], [413.0, 4338.0], [410.0, 4542.0], [409.0, 4025.0], [408.0, 3523.0], [429.0, 4223.0], [416.0, 2966.5], [418.0, 2835.5], [417.0, 3991.0], [420.0, 2615.5], [421.0, 5158.0], [423.0, 4483.0], [422.0, 4555.0], [424.0, 2592.666666666667], [425.0, 4484.0], [431.0, 5470.0], [430.0, 5098.0], [428.0, 4768.0], [419.0, 4414.0], [427.0, 4036.0], [426.0, 4398.0], [439.0, 2511.25], [432.0, 2991.5], [435.0, 4213.0], [433.0, 5452.0], [437.0, 1180.75], [436.0, 2968.0], [438.0, 3214.0], [440.0, 2401.333333333333], [443.0, 2395.5], [442.0, 3390.0], [441.0, 3552.0], [445.0, 2342.5], [447.0, 1266.0], [446.0, 5037.0], [444.0, 2454.5], [462.0, 5924.0], [450.0, 2304.5], [448.0, 3097.6666666666665], [449.0, 5479.0], [451.0, 2120.5], [461.0, 3986.0], [460.0, 3317.0], [452.0, 2489.6666666666665], [454.0, 4841.0], [453.0, 4222.0], [455.0, 3063.0], [456.0, 3094.0], [459.0, 3073.0], [458.0, 4438.0], [457.0, 5165.0], [463.0, 4871.0], [478.0, 4898.0], [471.0, 2891.5], [464.0, 3114.0], [465.0, 3210.0], [467.0, 3953.0], [466.0, 4364.0], [469.0, 3103.666666666667], [468.0, 4140.0], [470.0, 4932.0], [479.0, 2993.0], [473.0, 5330.0], [472.0, 3805.0], [477.0, 3605.0], [476.0, 4624.0], [475.0, 4698.0], [474.0, 4918.0], [482.0, 2577.666666666667], [485.0, 2623.0], [484.0, 4266.0], [486.0, 2114.5], [487.0, 2901.0], [481.0, 5759.0], [480.0, 4323.0], [490.0, 1877.25], [491.0, 3187.0], [493.0, 2926.5], [492.0, 5127.0], [483.0, 3724.0], [495.0, 3622.0], [489.0, 3321.0], [488.0, 3796.0], [494.0, 4540.0], [509.0, 4306.0], [502.0, 1227.0], [501.0, 3025.5], [500.0, 2810.0], [507.0, 3219.5], [511.0, 3216.5], [510.0, 2762.0], [508.0, 2878.0], [499.0, 3761.0], [498.0, 5608.0], [497.0, 5520.0], [496.0, 5164.0], [503.0, 4327.0], [506.0, 3527.0], [505.0, 5052.0], [504.0, 4743.0], [540.0, 2167.8], [525.0, 3115.0], [513.0, 2820.0], [527.0, 5189.0], [512.0, 4187.0], [526.0, 4540.0], [536.0, 4605.0], [519.0, 4979.0], [518.0, 4684.0], [517.0, 3503.0], [516.0, 4302.0], [515.0, 3921.0], [514.0, 3186.0], [539.0, 4858.0], [538.0, 4475.0], [521.0, 1294.0], [520.0, 3271.0], [523.0, 3279.0], [522.0, 4343.5], [524.0, 4596.0], [528.0, 2990.5], [529.0, 3577.0], [531.0, 4624.0], [530.0, 5027.0], [533.0, 4150.0], [532.0, 4887.0], [535.0, 3904.0], [534.0, 4451.0], [542.0, 2028.0], [541.0, 2984.0], [543.0, 3683.0], [570.0, 2764.6666666666665], [556.0, 3030.0], [545.0, 2248.0], [547.0, 2216.5], [546.0, 4303.0], [549.0, 4860.0], [548.0, 3889.0], [551.0, 4128.0], [550.0, 4447.0], [569.0, 2694.0], [568.0, 2761.5], [571.0, 2592.6666666666665], [573.0, 3373.0], [575.0, 4199.0], [560.0, 4089.0], [574.0, 4872.0], [572.0, 2025.0], [553.0, 2351.333333333333], [552.0, 4763.0], [554.0, 3709.5], [555.0, 1943.4], [558.0, 3352.666666666667], [557.0, 4221.0], [559.0, 2434.0], [544.0, 3732.0], [562.0, 3148.0], [563.0, 4916.0], [564.0, 2657.6666666666665], [566.0, 1928.1666666666667], [565.0, 4383.0], [567.0, 2105.3333333333335], [561.0, 2887.0], [582.0, 2175.0], [590.0, 2452.25], [578.0, 2279.75], [576.0, 2857.666666666667], [577.0, 4748.0], [591.0, 2396.0], [581.0, 3401.5], [580.0, 4362.0], [579.0, 4364.0], [583.0, 2544.0], [601.0, 4425.0], [600.0, 4752.0], [602.0, 2179.5], [603.0, 1549.0], [605.0, 4032.0], [604.0, 4546.0], [607.0, 4049.0], [606.0, 4252.0], [592.0, 2645.5], [593.0, 3609.5], [595.0, 4643.0], [594.0, 4304.0], [596.0, 2167.5], [598.0, 3193.0], [597.0, 4170.0], [599.0, 4050.0], [584.0, 3244.6666666666665], [585.0, 3763.0], [587.0, 5453.0], [586.0, 5055.0], [588.0, 3094.5], [589.0, 2686.0], [633.0, 2648.125], [613.0, 2529.75], [610.0, 2983.0], [609.0, 4314.0], [611.0, 2718.0], [614.0, 2744.0], [612.0, 2333.3333333333335], [615.0, 3169.0], [623.0, 2922.3333333333335], [622.0, 4117.0], [621.0, 3628.0], [620.0, 4359.0], [619.0, 3056.0], [618.0, 4561.0], [617.0, 2877.0], [616.0, 4390.0], [625.0, 2673.0], [626.0, 2500.3333333333335], [627.0, 3918.0], [629.0, 4029.0], [628.0, 2916.0], [631.0, 3070.5], [630.0, 3312.5], [624.0, 1865.6], [635.0, 2635.5], [634.0, 3562.0], [637.0, 3804.0], [636.0, 3792.0], [639.0, 2944.0], [632.0, 3008.0], [666.0, 2382.1666666666665], [652.0, 3256.75], [640.0, 2668.6666666666665], [647.0, 3567.5], [646.0, 3816.0], [645.0, 3995.0], [644.0, 5307.0], [643.0, 4090.0], [642.0, 4095.0], [641.0, 4097.0], [665.0, 2788.4], [664.0, 1957.5], [668.0, 2777.5833333333335], [667.0, 2688.3333333333335], [669.0, 2063.2], [671.0, 3616.0], [656.0, 4001.0], [670.0, 4546.0], [649.0, 2605.5], [648.0, 5224.0], [651.0, 2483.5], [650.0, 2924.5], [653.0, 2298.777777777778], [654.0, 2579.714285714286], [655.0, 3772.0], [657.0, 2629.0], [662.0, 2470.25], [661.0, 5201.0], [660.0, 4239.0], [659.0, 4320.0], [658.0, 3118.0], [663.0, 2988.0], [696.0, 2933.5], [675.0, 2335.0], [673.0, 3274.3333333333335], [672.0, 3677.0], [687.0, 3375.0], [686.0, 3741.0], [676.0, 3097.6666666666665], [677.0, 4894.0], [674.0, 3169.3333333333335], [680.0, 2326.333333333333], [682.0, 4020.0], [681.0, 4172.0], [684.0, 4670.0], [683.0, 4888.0], [679.0, 2476.0], [697.0, 2560.5], [698.0, 2974.5], [699.0, 3049.0], [700.0, 3763.0], [701.0, 2734.5], [703.0, 3745.0], [688.0, 4225.0], [702.0, 4683.0], [689.0, 3016.5], [691.0, 3964.5], [690.0, 3310.0], [693.0, 4693.0], [692.0, 3999.0], [695.0, 2603.3333333333335], [694.0, 4052.0], [678.0, 2803.25], [685.0, 3503.5], [711.0, 2814.6], [707.0, 2692.0], [708.0, 2805.25], [706.0, 3267.5], [705.0, 3401.0], [704.0, 3245.0], [719.0, 3077.3333333333335], [718.0, 3262.0], [717.0, 3563.0], [710.0, 2626.75], [720.0, 2749.4], [735.0, 4085.0], [734.0, 3319.4], [733.0, 2915.0], [732.0, 2867.2], [731.0, 3028.75], [728.0, 2810.6250000000005], [729.0, 3473.5], [730.0, 2869.0], [721.0, 3025.166666666667], [722.0, 3357.5], [723.0, 2717.7999999999997], [725.0, 3006.583333333333], [726.0, 3110.5], [727.0, 2990.833333333333], [724.0, 2753.416666666667], [714.0, 2668.470588235294], [713.0, 2418.3571428571427], [712.0, 2566.090909090909], [715.0, 2235.2], [716.0, 2921.25], [709.0, 3309.5], [760.0, 2855.4], [765.0, 2682.5], [737.0, 3041.0], [748.0, 3311.0], [747.0, 3327.0], [746.0, 3989.0], [745.0, 3718.0], [744.0, 3204.0], [750.0, 3466.0], [751.0, 3464.0], [736.0, 3736.0], [749.0, 3423.0], [755.0, 3327.285714285714], [757.0, 3185.6666666666665], [756.0, 3126.5714285714284], [758.0, 3352.5], [759.0, 3482.0], [766.0, 2969.2], [752.0, 3000.0], [767.0, 2820.5], [754.0, 2919.0], [753.0, 3031.3333333333335], [764.0, 2802.25], [763.0, 3470.0], [762.0, 3283.3333333333335], [743.0, 4626.0], [742.0, 4016.0], [741.0, 3527.0], [740.0, 3038.0], [739.0, 3963.0], [738.0, 3928.0], [761.0, 3957.0], [792.0, 2617.285714285714], [769.0, 3309.0], [770.0, 3109.0], [771.0, 2941.0], [768.0, 3311.0], [772.0, 3217.0], [776.0, 3074.0], [777.0, 3313.0], [775.0, 3289.0], [774.0, 3011.0], [773.0, 4320.0], [793.0, 2945.0], [794.0, 3472.5], [798.0, 3329.5], [797.0, 3266.0], [796.0, 4054.0], [795.0, 4527.0], [799.0, 2076.0], [778.0, 3157.0], [782.0, 2752.0], [780.0, 3928.0], [779.0, 2906.0], [783.0, 3831.0], [784.0, 2766.0], [786.0, 3483.0], [785.0, 3390.0], [787.0, 3133.0], [788.0, 4433.5], [791.0, 3715.0], [790.0, 3923.0], [789.0, 3752.0], [806.0, 2745.5], [813.0, 3251.2], [802.0, 2587.5], [801.0, 3657.0], [800.0, 4345.5], [804.0, 3691.6666666666665], [803.0, 5299.0], [805.0, 4080.0], [808.0, 3700.5], [810.0, 3204.0], [809.0, 4050.0], [812.0, 2987.6666666666665], [811.0, 3222.6666666666665], [814.0, 3239.3333333333335], [815.0, 3311.3333333333335], [816.0, 3069.5], [817.0, 4625.0], [830.0, 2304.0], [829.0, 3766.0], [828.0, 4214.0], [827.0, 3387.0], [831.0, 3933.5], [824.0, 2817.25], [807.0, 3024.0], [825.0, 2702.0], [826.0, 2666.5], [819.0, 2800.5], [821.0, 2622.8571428571427], [820.0, 3172.0], [823.0, 2528.5], [822.0, 2713.8333333333335], [818.0, 2636.3333333333335], [859.0, 2616.75], [835.0, 2600.25], [839.0, 2312.6666666666665], [838.0, 3762.0], [837.0, 3151.0], [836.0, 2618.0], [856.0, 2917.1666666666665], [860.0, 2863.2], [861.0, 3020.8333333333335], [862.0, 3277.0], [863.0, 3029.0], [852.0, 3930.0], [851.0, 3365.0], [850.0, 4231.0], [849.0, 3413.0], [858.0, 2840.6666666666665], [857.0, 2956.6666666666665], [840.0, 2983.0], [842.0, 3850.0], [841.0, 3126.0], [843.0, 3105.5], [844.0, 3299.5], [845.0, 3858.0], [847.0, 3135.0], [832.0, 2689.0], [834.0, 3166.0], [833.0, 3174.0], [846.0, 3118.0], [853.0, 3131.0], [854.0, 3489.25], [855.0, 2963.5], [869.0, 3076.0], [864.0, 3099.6666666666665], [866.0, 2975.4], [867.0, 3336.75], [868.0, 2856.0], [865.0, 2953.714285714286], [870.0, 2855.3333333333335], [871.0, 4460.0], [888.0, 2777.6666666666665], [895.0, 3422.5], [894.0, 3314.75], [893.0, 3059.5], [892.0, 4044.0], [891.0, 4329.0], [890.0, 3591.0], [889.0, 3927.0], [880.0, 3057.6666666666665], [885.0, 3295.6666666666665], [887.0, 3661.0], [886.0, 4581.0], [884.0, 2945.6], [883.0, 3259.0], [882.0, 3708.0], [881.0, 4034.0], [872.0, 3400.0], [873.0, 3333.0], [877.0, 3366.6666666666665], [878.0, 2913.0], [879.0, 2698.4], [876.0, 2643.3333333333335], [875.0, 4191.0], [874.0, 2504.0], [903.0, 2903.75], [899.0, 3465.0], [901.0, 2724.230769230769], [902.0, 2951.3636363636365], [900.0, 3306.714285714286], [914.0, 3077.5], [913.0, 4145.0], [912.0, 3861.0], [916.0, 4084.0], [915.0, 4383.0], [926.0, 3596.3333333333335], [925.0, 3673.0], [927.0, 2901.0], [923.0, 3309.0], [924.0, 3725.0], [920.0, 3733.5], [921.0, 4372.0], [922.0, 3500.0], [917.0, 2757.0], [918.0, 2933.4], [919.0, 3722.0], [904.0, 2852.4285714285716], [905.0, 2655.3333333333335], [906.0, 3432.8888888888887], [907.0, 2987.8], [909.0, 3428.5], [908.0, 3393.5], [911.0, 3140.6666666666665], [896.0, 3971.0], [898.0, 2910.0], [897.0, 3761.0], [910.0, 2992.8], [953.0, 3309.5], [931.0, 3236.5], [929.0, 3210.0], [930.0, 3715.0], [943.0, 3292.0], [928.0, 3792.0], [932.0, 2650.0], [934.0, 3307.0], [933.0, 3216.0], [936.0, 2757.0], [935.0, 2984.0], [946.0, 2959.6666666666665], [949.0, 3390.25], [948.0, 3866.0], [947.0, 3538.0], [950.0, 2970.2], [951.0, 2913.0], [945.0, 2977.0], [944.0, 4091.0], [959.0, 4278.0], [958.0, 3220.0], [956.0, 3293.3333333333335], [955.0, 4447.0], [954.0, 3533.0], [957.0, 2898.5], [952.0, 3305.8999999999996], [939.0, 2987.25], [938.0, 3248.0], [937.0, 3867.0], [941.0, 2971.3333333333335], [940.0, 4474.0], [942.0, 3273.0], [984.0, 3126.0], [962.0, 3405.3333333333335], [961.0, 3214.6666666666665], [960.0, 4303.0], [965.0, 3238.5], [964.0, 3263.5], [968.0, 3488.75], [970.0, 4008.0], [969.0, 4157.0], [972.0, 3942.0], [971.0, 4572.0], [966.0, 3310.0], [967.0, 3013.0], [985.0, 3640.5], [987.0, 3628.0], [986.0, 3846.0], [989.0, 3650.0], [988.0, 3117.0], [991.0, 3515.0], [990.0, 3776.0], [973.0, 3551.5], [974.0, 3553.6666666666665], [975.0, 3711.5], [976.0, 3001.333333333333], [978.0, 3507.0], [981.0, 3652.5], [980.0, 3490.0], [979.0, 3167.0], [983.0, 2976.6666666666665], [982.0, 4454.0], [977.0, 3018.0], [1008.0, 4234.0], [1012.0, 3795.0], [1016.0, 3731.0], [999.0, 3590.0], [998.0, 4056.0], [997.0, 4564.0], [996.0, 3330.0], [995.0, 4158.0], [994.0, 3560.0], [993.0, 4146.0], [992.0, 4079.0], [1007.0, 3051.0], [1006.0, 4270.0], [1005.0, 3677.0], [1004.0, 2158.0], [1003.0, 3615.0], [1002.0, 4208.0], [1001.0, 3738.0], [1000.0, 3874.0], [1015.0, 3377.0], [1014.0, 3411.0], [1013.0, 3529.0], [1011.0, 3805.0], [1010.0, 3063.0], [1009.0, 3611.0], [1.0, 4493.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[579.4534999999994, 3208.0930000000035]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1016.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.54958352E12, "maxY": 13998.2, "series": [{"data": [[1.54958352E12, 13998.2]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958352E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3208.0930000000035, "minX": 1.54958352E12, "maxY": 3208.0930000000035, "series": [{"data": [[1.54958352E12, 3208.0930000000035]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958352E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3208.088499999998, "minX": 1.54958352E12, "maxY": 3208.088499999998, "series": [{"data": [[1.54958352E12, 3208.088499999998]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958352E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 59.49099999999985, "minX": 1.54958352E12, "maxY": 59.49099999999985, "series": [{"data": [[1.54958352E12, 59.49099999999985]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958352E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 194.0, "minX": 1.54958352E12, "maxY": 6219.0, "series": [{"data": [[1.54958352E12, 6219.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958352E12, 194.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958352E12, 4857.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958352E12, 5570.99]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958352E12, 5111.299999999997]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3344.0, "minX": 33.0, "maxY": 3344.0, "series": [{"data": [[33.0, 3344.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3344.0, "minX": 33.0, "maxY": 3344.0, "series": [{"data": [[33.0, 3344.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958352E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958352E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958352E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958352E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958352E12, "title": "Transactions Per Second"}},
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
