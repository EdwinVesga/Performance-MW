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
        data: {"result": {"minY": 113.0, "minX": 0.0, "maxY": 6374.0, "series": [{"data": [[0.0, 113.0], [0.1, 151.0], [0.2, 156.0], [0.3, 186.0], [0.4, 225.0], [0.5, 233.0], [0.6, 250.0], [0.7, 283.0], [0.8, 313.0], [0.9, 353.0], [1.0, 491.0], [1.1, 494.0], [1.2, 511.0], [1.3, 530.0], [1.4, 545.0], [1.5, 570.0], [1.6, 579.0], [1.7, 588.0], [1.8, 593.0], [1.9, 627.0], [2.0, 632.0], [2.1, 646.0], [2.2, 668.0], [2.3, 668.0], [2.4, 685.0], [2.5, 691.0], [2.6, 713.0], [2.7, 722.0], [2.8, 726.0], [2.9, 736.0], [3.0, 743.0], [3.1, 750.0], [3.2, 755.0], [3.3, 760.0], [3.4, 762.0], [3.5, 766.0], [3.6, 773.0], [3.7, 786.0], [3.8, 800.0], [3.9, 801.0], [4.0, 807.0], [4.1, 819.0], [4.2, 827.0], [4.3, 831.0], [4.4, 834.0], [4.5, 849.0], [4.6, 852.0], [4.7, 858.0], [4.8, 860.0], [4.9, 868.0], [5.0, 873.0], [5.1, 883.0], [5.2, 885.0], [5.3, 887.0], [5.4, 891.0], [5.5, 893.0], [5.6, 899.0], [5.7, 909.0], [5.8, 912.0], [5.9, 922.0], [6.0, 931.0], [6.1, 935.0], [6.2, 945.0], [6.3, 951.0], [6.4, 952.0], [6.5, 955.0], [6.6, 960.0], [6.7, 974.0], [6.8, 979.0], [6.9, 983.0], [7.0, 992.0], [7.1, 1001.0], [7.2, 1007.0], [7.3, 1010.0], [7.4, 1013.0], [7.5, 1018.0], [7.6, 1022.0], [7.7, 1026.0], [7.8, 1030.0], [7.9, 1037.0], [8.0, 1052.0], [8.1, 1054.0], [8.2, 1060.0], [8.3, 1062.0], [8.4, 1071.0], [8.5, 1083.0], [8.6, 1097.0], [8.7, 1100.0], [8.8, 1106.0], [8.9, 1109.0], [9.0, 1112.0], [9.1, 1112.0], [9.2, 1120.0], [9.3, 1125.0], [9.4, 1130.0], [9.5, 1138.0], [9.6, 1154.0], [9.7, 1163.0], [9.8, 1177.0], [9.9, 1181.0], [10.0, 1183.0], [10.1, 1202.0], [10.2, 1204.0], [10.3, 1217.0], [10.4, 1223.0], [10.5, 1228.0], [10.6, 1240.0], [10.7, 1246.0], [10.8, 1253.0], [10.9, 1260.0], [11.0, 1282.0], [11.1, 1290.0], [11.2, 1304.0], [11.3, 1306.0], [11.4, 1316.0], [11.5, 1330.0], [11.6, 1335.0], [11.7, 1351.0], [11.8, 1357.0], [11.9, 1372.0], [12.0, 1373.0], [12.1, 1375.0], [12.2, 1385.0], [12.3, 1388.0], [12.4, 1392.0], [12.5, 1395.0], [12.6, 1395.0], [12.7, 1399.0], [12.8, 1416.0], [12.9, 1426.0], [13.0, 1432.0], [13.1, 1445.0], [13.2, 1446.0], [13.3, 1450.0], [13.4, 1464.0], [13.5, 1465.0], [13.6, 1469.0], [13.7, 1489.0], [13.8, 1510.0], [13.9, 1522.0], [14.0, 1526.0], [14.1, 1532.0], [14.2, 1535.0], [14.3, 1541.0], [14.4, 1547.0], [14.5, 1560.0], [14.6, 1564.0], [14.7, 1578.0], [14.8, 1588.0], [14.9, 1596.0], [15.0, 1629.0], [15.1, 1633.0], [15.2, 1646.0], [15.3, 1652.0], [15.4, 1664.0], [15.5, 1666.0], [15.6, 1678.0], [15.7, 1679.0], [15.8, 1683.0], [15.9, 1691.0], [16.0, 1696.0], [16.1, 1710.0], [16.2, 1715.0], [16.3, 1721.0], [16.4, 1724.0], [16.5, 1734.0], [16.6, 1737.0], [16.7, 1739.0], [16.8, 1749.0], [16.9, 1770.0], [17.0, 1784.0], [17.1, 1786.0], [17.2, 1788.0], [17.3, 1792.0], [17.4, 1794.0], [17.5, 1802.0], [17.6, 1813.0], [17.7, 1816.0], [17.8, 1819.0], [17.9, 1827.0], [18.0, 1828.0], [18.1, 1829.0], [18.2, 1834.0], [18.3, 1835.0], [18.4, 1840.0], [18.5, 1854.0], [18.6, 1865.0], [18.7, 1874.0], [18.8, 1877.0], [18.9, 1891.0], [19.0, 1895.0], [19.1, 1900.0], [19.2, 1907.0], [19.3, 1911.0], [19.4, 1917.0], [19.5, 1924.0], [19.6, 1931.0], [19.7, 1934.0], [19.8, 1938.0], [19.9, 1943.0], [20.0, 1951.0], [20.1, 1953.0], [20.2, 1956.0], [20.3, 1961.0], [20.4, 1965.0], [20.5, 1973.0], [20.6, 1978.0], [20.7, 1981.0], [20.8, 1986.0], [20.9, 1987.0], [21.0, 1989.0], [21.1, 1990.0], [21.2, 1992.0], [21.3, 1994.0], [21.4, 1998.0], [21.5, 2000.0], [21.6, 2012.0], [21.7, 2016.0], [21.8, 2022.0], [21.9, 2028.0], [22.0, 2028.0], [22.1, 2033.0], [22.2, 2036.0], [22.3, 2053.0], [22.4, 2065.0], [22.5, 2067.0], [22.6, 2069.0], [22.7, 2072.0], [22.8, 2074.0], [22.9, 2078.0], [23.0, 2079.0], [23.1, 2086.0], [23.2, 2088.0], [23.3, 2090.0], [23.4, 2096.0], [23.5, 2101.0], [23.6, 2113.0], [23.7, 2114.0], [23.8, 2124.0], [23.9, 2126.0], [24.0, 2131.0], [24.1, 2133.0], [24.2, 2135.0], [24.3, 2137.0], [24.4, 2144.0], [24.5, 2145.0], [24.6, 2156.0], [24.7, 2163.0], [24.8, 2168.0], [24.9, 2170.0], [25.0, 2178.0], [25.1, 2190.0], [25.2, 2193.0], [25.3, 2195.0], [25.4, 2199.0], [25.5, 2209.0], [25.6, 2212.0], [25.7, 2218.0], [25.8, 2233.0], [25.9, 2237.0], [26.0, 2240.0], [26.1, 2246.0], [26.2, 2253.0], [26.3, 2259.0], [26.4, 2261.0], [26.5, 2265.0], [26.6, 2269.0], [26.7, 2272.0], [26.8, 2276.0], [26.9, 2278.0], [27.0, 2281.0], [27.1, 2282.0], [27.2, 2288.0], [27.3, 2291.0], [27.4, 2299.0], [27.5, 2308.0], [27.6, 2312.0], [27.7, 2315.0], [27.8, 2323.0], [27.9, 2325.0], [28.0, 2328.0], [28.1, 2338.0], [28.2, 2343.0], [28.3, 2345.0], [28.4, 2347.0], [28.5, 2352.0], [28.6, 2361.0], [28.7, 2364.0], [28.8, 2369.0], [28.9, 2373.0], [29.0, 2381.0], [29.1, 2382.0], [29.2, 2388.0], [29.3, 2389.0], [29.4, 2391.0], [29.5, 2398.0], [29.6, 2406.0], [29.7, 2411.0], [29.8, 2412.0], [29.9, 2416.0], [30.0, 2419.0], [30.1, 2425.0], [30.2, 2426.0], [30.3, 2427.0], [30.4, 2427.0], [30.5, 2429.0], [30.6, 2431.0], [30.7, 2443.0], [30.8, 2445.0], [30.9, 2457.0], [31.0, 2459.0], [31.1, 2463.0], [31.2, 2463.0], [31.3, 2467.0], [31.4, 2468.0], [31.5, 2469.0], [31.6, 2474.0], [31.7, 2476.0], [31.8, 2478.0], [31.9, 2485.0], [32.0, 2486.0], [32.1, 2498.0], [32.2, 2509.0], [32.3, 2514.0], [32.4, 2520.0], [32.5, 2527.0], [32.6, 2533.0], [32.7, 2538.0], [32.8, 2543.0], [32.9, 2546.0], [33.0, 2553.0], [33.1, 2563.0], [33.2, 2570.0], [33.3, 2572.0], [33.4, 2579.0], [33.5, 2583.0], [33.6, 2587.0], [33.7, 2589.0], [33.8, 2593.0], [33.9, 2594.0], [34.0, 2595.0], [34.1, 2602.0], [34.2, 2619.0], [34.3, 2623.0], [34.4, 2630.0], [34.5, 2636.0], [34.6, 2640.0], [34.7, 2654.0], [34.8, 2660.0], [34.9, 2672.0], [35.0, 2672.0], [35.1, 2675.0], [35.2, 2676.0], [35.3, 2678.0], [35.4, 2679.0], [35.5, 2694.0], [35.6, 2697.0], [35.7, 2703.0], [35.8, 2707.0], [35.9, 2710.0], [36.0, 2716.0], [36.1, 2722.0], [36.2, 2723.0], [36.3, 2731.0], [36.4, 2732.0], [36.5, 2734.0], [36.6, 2738.0], [36.7, 2742.0], [36.8, 2747.0], [36.9, 2747.0], [37.0, 2754.0], [37.1, 2757.0], [37.2, 2762.0], [37.3, 2766.0], [37.4, 2778.0], [37.5, 2782.0], [37.6, 2783.0], [37.7, 2788.0], [37.8, 2790.0], [37.9, 2794.0], [38.0, 2796.0], [38.1, 2796.0], [38.2, 2797.0], [38.3, 2799.0], [38.4, 2800.0], [38.5, 2804.0], [38.6, 2806.0], [38.7, 2806.0], [38.8, 2808.0], [38.9, 2812.0], [39.0, 2819.0], [39.1, 2821.0], [39.2, 2821.0], [39.3, 2826.0], [39.4, 2841.0], [39.5, 2842.0], [39.6, 2852.0], [39.7, 2853.0], [39.8, 2855.0], [39.9, 2857.0], [40.0, 2865.0], [40.1, 2868.0], [40.2, 2869.0], [40.3, 2872.0], [40.4, 2873.0], [40.5, 2875.0], [40.6, 2876.0], [40.7, 2877.0], [40.8, 2879.0], [40.9, 2881.0], [41.0, 2883.0], [41.1, 2885.0], [41.2, 2887.0], [41.3, 2898.0], [41.4, 2902.0], [41.5, 2903.0], [41.6, 2907.0], [41.7, 2908.0], [41.8, 2915.0], [41.9, 2920.0], [42.0, 2925.0], [42.1, 2932.0], [42.2, 2940.0], [42.3, 2943.0], [42.4, 2948.0], [42.5, 2952.0], [42.6, 2953.0], [42.7, 2956.0], [42.8, 2960.0], [42.9, 2962.0], [43.0, 2970.0], [43.1, 2974.0], [43.2, 2979.0], [43.3, 2981.0], [43.4, 2986.0], [43.5, 2989.0], [43.6, 2989.0], [43.7, 2991.0], [43.8, 2995.0], [43.9, 3002.0], [44.0, 3005.0], [44.1, 3005.0], [44.2, 3006.0], [44.3, 3013.0], [44.4, 3024.0], [44.5, 3026.0], [44.6, 3028.0], [44.7, 3033.0], [44.8, 3035.0], [44.9, 3037.0], [45.0, 3042.0], [45.1, 3044.0], [45.2, 3047.0], [45.3, 3051.0], [45.4, 3053.0], [45.5, 3057.0], [45.6, 3067.0], [45.7, 3069.0], [45.8, 3071.0], [45.9, 3076.0], [46.0, 3086.0], [46.1, 3092.0], [46.2, 3094.0], [46.3, 3097.0], [46.4, 3101.0], [46.5, 3102.0], [46.6, 3116.0], [46.7, 3123.0], [46.8, 3138.0], [46.9, 3140.0], [47.0, 3143.0], [47.1, 3152.0], [47.2, 3161.0], [47.3, 3166.0], [47.4, 3167.0], [47.5, 3173.0], [47.6, 3175.0], [47.7, 3179.0], [47.8, 3181.0], [47.9, 3185.0], [48.0, 3194.0], [48.1, 3195.0], [48.2, 3197.0], [48.3, 3204.0], [48.4, 3211.0], [48.5, 3215.0], [48.6, 3224.0], [48.7, 3226.0], [48.8, 3228.0], [48.9, 3229.0], [49.0, 3231.0], [49.1, 3236.0], [49.2, 3242.0], [49.3, 3244.0], [49.4, 3244.0], [49.5, 3253.0], [49.6, 3255.0], [49.7, 3261.0], [49.8, 3266.0], [49.9, 3270.0], [50.0, 3273.0], [50.1, 3274.0], [50.2, 3275.0], [50.3, 3280.0], [50.4, 3285.0], [50.5, 3286.0], [50.6, 3288.0], [50.7, 3293.0], [50.8, 3294.0], [50.9, 3298.0], [51.0, 3301.0], [51.1, 3305.0], [51.2, 3310.0], [51.3, 3311.0], [51.4, 3314.0], [51.5, 3314.0], [51.6, 3316.0], [51.7, 3317.0], [51.8, 3319.0], [51.9, 3323.0], [52.0, 3330.0], [52.1, 3332.0], [52.2, 3336.0], [52.3, 3340.0], [52.4, 3342.0], [52.5, 3346.0], [52.6, 3353.0], [52.7, 3355.0], [52.8, 3361.0], [52.9, 3367.0], [53.0, 3375.0], [53.1, 3378.0], [53.2, 3383.0], [53.3, 3389.0], [53.4, 3394.0], [53.5, 3400.0], [53.6, 3402.0], [53.7, 3408.0], [53.8, 3412.0], [53.9, 3414.0], [54.0, 3419.0], [54.1, 3425.0], [54.2, 3426.0], [54.3, 3431.0], [54.4, 3439.0], [54.5, 3444.0], [54.6, 3448.0], [54.7, 3459.0], [54.8, 3462.0], [54.9, 3466.0], [55.0, 3470.0], [55.1, 3473.0], [55.2, 3477.0], [55.3, 3484.0], [55.4, 3488.0], [55.5, 3492.0], [55.6, 3494.0], [55.7, 3500.0], [55.8, 3502.0], [55.9, 3512.0], [56.0, 3513.0], [56.1, 3519.0], [56.2, 3524.0], [56.3, 3528.0], [56.4, 3530.0], [56.5, 3534.0], [56.6, 3540.0], [56.7, 3541.0], [56.8, 3544.0], [56.9, 3546.0], [57.0, 3549.0], [57.1, 3553.0], [57.2, 3556.0], [57.3, 3558.0], [57.4, 3563.0], [57.5, 3570.0], [57.6, 3574.0], [57.7, 3577.0], [57.8, 3580.0], [57.9, 3580.0], [58.0, 3583.0], [58.1, 3586.0], [58.2, 3588.0], [58.3, 3597.0], [58.4, 3597.0], [58.5, 3598.0], [58.6, 3602.0], [58.7, 3603.0], [58.8, 3604.0], [58.9, 3608.0], [59.0, 3613.0], [59.1, 3615.0], [59.2, 3617.0], [59.3, 3620.0], [59.4, 3627.0], [59.5, 3634.0], [59.6, 3635.0], [59.7, 3638.0], [59.8, 3644.0], [59.9, 3655.0], [60.0, 3667.0], [60.1, 3670.0], [60.2, 3675.0], [60.3, 3679.0], [60.4, 3682.0], [60.5, 3691.0], [60.6, 3696.0], [60.7, 3698.0], [60.8, 3701.0], [60.9, 3703.0], [61.0, 3706.0], [61.1, 3713.0], [61.2, 3716.0], [61.3, 3719.0], [61.4, 3720.0], [61.5, 3722.0], [61.6, 3727.0], [61.7, 3738.0], [61.8, 3742.0], [61.9, 3746.0], [62.0, 3748.0], [62.1, 3753.0], [62.2, 3758.0], [62.3, 3761.0], [62.4, 3766.0], [62.5, 3769.0], [62.6, 3772.0], [62.7, 3776.0], [62.8, 3785.0], [62.9, 3795.0], [63.0, 3796.0], [63.1, 3804.0], [63.2, 3810.0], [63.3, 3813.0], [63.4, 3817.0], [63.5, 3822.0], [63.6, 3827.0], [63.7, 3828.0], [63.8, 3833.0], [63.9, 3836.0], [64.0, 3837.0], [64.1, 3839.0], [64.2, 3844.0], [64.3, 3845.0], [64.4, 3849.0], [64.5, 3849.0], [64.6, 3852.0], [64.7, 3854.0], [64.8, 3865.0], [64.9, 3870.0], [65.0, 3874.0], [65.1, 3878.0], [65.2, 3882.0], [65.3, 3883.0], [65.4, 3890.0], [65.5, 3892.0], [65.6, 3894.0], [65.7, 3895.0], [65.8, 3898.0], [65.9, 3902.0], [66.0, 3909.0], [66.1, 3913.0], [66.2, 3915.0], [66.3, 3918.0], [66.4, 3919.0], [66.5, 3921.0], [66.6, 3921.0], [66.7, 3925.0], [66.8, 3928.0], [66.9, 3930.0], [67.0, 3934.0], [67.1, 3935.0], [67.2, 3935.0], [67.3, 3943.0], [67.4, 3945.0], [67.5, 3947.0], [67.6, 3949.0], [67.7, 3950.0], [67.8, 3953.0], [67.9, 3955.0], [68.0, 3956.0], [68.1, 3958.0], [68.2, 3961.0], [68.3, 3963.0], [68.4, 3966.0], [68.5, 3968.0], [68.6, 3972.0], [68.7, 3974.0], [68.8, 3976.0], [68.9, 3978.0], [69.0, 3981.0], [69.1, 3983.0], [69.2, 3985.0], [69.3, 3990.0], [69.4, 3991.0], [69.5, 3992.0], [69.6, 3993.0], [69.7, 3997.0], [69.8, 3998.0], [69.9, 3999.0], [70.0, 4002.0], [70.1, 4006.0], [70.2, 4008.0], [70.3, 4009.0], [70.4, 4014.0], [70.5, 4017.0], [70.6, 4021.0], [70.7, 4024.0], [70.8, 4028.0], [70.9, 4031.0], [71.0, 4034.0], [71.1, 4035.0], [71.2, 4036.0], [71.3, 4037.0], [71.4, 4039.0], [71.5, 4045.0], [71.6, 4046.0], [71.7, 4049.0], [71.8, 4051.0], [71.9, 4056.0], [72.0, 4062.0], [72.1, 4064.0], [72.2, 4066.0], [72.3, 4067.0], [72.4, 4071.0], [72.5, 4075.0], [72.6, 4078.0], [72.7, 4080.0], [72.8, 4082.0], [72.9, 4083.0], [73.0, 4085.0], [73.1, 4085.0], [73.2, 4086.0], [73.3, 4088.0], [73.4, 4091.0], [73.5, 4094.0], [73.6, 4096.0], [73.7, 4098.0], [73.8, 4099.0], [73.9, 4100.0], [74.0, 4102.0], [74.1, 4104.0], [74.2, 4106.0], [74.3, 4109.0], [74.4, 4113.0], [74.5, 4119.0], [74.6, 4120.0], [74.7, 4122.0], [74.8, 4123.0], [74.9, 4125.0], [75.0, 4126.0], [75.1, 4127.0], [75.2, 4130.0], [75.3, 4133.0], [75.4, 4138.0], [75.5, 4140.0], [75.6, 4144.0], [75.7, 4149.0], [75.8, 4152.0], [75.9, 4155.0], [76.0, 4157.0], [76.1, 4159.0], [76.2, 4166.0], [76.3, 4169.0], [76.4, 4172.0], [76.5, 4175.0], [76.6, 4180.0], [76.7, 4184.0], [76.8, 4186.0], [76.9, 4188.0], [77.0, 4194.0], [77.1, 4198.0], [77.2, 4201.0], [77.3, 4203.0], [77.4, 4204.0], [77.5, 4204.0], [77.6, 4206.0], [77.7, 4207.0], [77.8, 4214.0], [77.9, 4214.0], [78.0, 4217.0], [78.1, 4221.0], [78.2, 4223.0], [78.3, 4228.0], [78.4, 4235.0], [78.5, 4242.0], [78.6, 4243.0], [78.7, 4246.0], [78.8, 4249.0], [78.9, 4250.0], [79.0, 4255.0], [79.1, 4258.0], [79.2, 4258.0], [79.3, 4260.0], [79.4, 4264.0], [79.5, 4272.0], [79.6, 4275.0], [79.7, 4283.0], [79.8, 4285.0], [79.9, 4289.0], [80.0, 4292.0], [80.1, 4295.0], [80.2, 4300.0], [80.3, 4303.0], [80.4, 4307.0], [80.5, 4309.0], [80.6, 4311.0], [80.7, 4315.0], [80.8, 4321.0], [80.9, 4325.0], [81.0, 4327.0], [81.1, 4328.0], [81.2, 4331.0], [81.3, 4332.0], [81.4, 4333.0], [81.5, 4333.0], [81.6, 4339.0], [81.7, 4341.0], [81.8, 4346.0], [81.9, 4346.0], [82.0, 4348.0], [82.1, 4351.0], [82.2, 4353.0], [82.3, 4356.0], [82.4, 4361.0], [82.5, 4365.0], [82.6, 4368.0], [82.7, 4370.0], [82.8, 4372.0], [82.9, 4377.0], [83.0, 4380.0], [83.1, 4383.0], [83.2, 4389.0], [83.3, 4394.0], [83.4, 4399.0], [83.5, 4402.0], [83.6, 4404.0], [83.7, 4406.0], [83.8, 4408.0], [83.9, 4412.0], [84.0, 4414.0], [84.1, 4415.0], [84.2, 4417.0], [84.3, 4418.0], [84.4, 4420.0], [84.5, 4422.0], [84.6, 4424.0], [84.7, 4426.0], [84.8, 4428.0], [84.9, 4432.0], [85.0, 4436.0], [85.1, 4439.0], [85.2, 4444.0], [85.3, 4448.0], [85.4, 4456.0], [85.5, 4462.0], [85.6, 4466.0], [85.7, 4467.0], [85.8, 4469.0], [85.9, 4473.0], [86.0, 4474.0], [86.1, 4478.0], [86.2, 4480.0], [86.3, 4488.0], [86.4, 4489.0], [86.5, 4492.0], [86.6, 4494.0], [86.7, 4494.0], [86.8, 4495.0], [86.9, 4499.0], [87.0, 4506.0], [87.1, 4508.0], [87.2, 4512.0], [87.3, 4514.0], [87.4, 4518.0], [87.5, 4520.0], [87.6, 4525.0], [87.7, 4532.0], [87.8, 4534.0], [87.9, 4547.0], [88.0, 4552.0], [88.1, 4555.0], [88.2, 4560.0], [88.3, 4563.0], [88.4, 4569.0], [88.5, 4572.0], [88.6, 4578.0], [88.7, 4583.0], [88.8, 4587.0], [88.9, 4593.0], [89.0, 4597.0], [89.1, 4601.0], [89.2, 4605.0], [89.3, 4608.0], [89.4, 4614.0], [89.5, 4621.0], [89.6, 4622.0], [89.7, 4625.0], [89.8, 4628.0], [89.9, 4635.0], [90.0, 4638.0], [90.1, 4645.0], [90.2, 4646.0], [90.3, 4652.0], [90.4, 4655.0], [90.5, 4656.0], [90.6, 4660.0], [90.7, 4670.0], [90.8, 4675.0], [90.9, 4678.0], [91.0, 4682.0], [91.1, 4688.0], [91.2, 4691.0], [91.3, 4694.0], [91.4, 4695.0], [91.5, 4698.0], [91.6, 4701.0], [91.7, 4707.0], [91.8, 4713.0], [91.9, 4721.0], [92.0, 4723.0], [92.1, 4729.0], [92.2, 4739.0], [92.3, 4744.0], [92.4, 4750.0], [92.5, 4756.0], [92.6, 4758.0], [92.7, 4769.0], [92.8, 4771.0], [92.9, 4777.0], [93.0, 4790.0], [93.1, 4796.0], [93.2, 4816.0], [93.3, 4821.0], [93.4, 4827.0], [93.5, 4838.0], [93.6, 4844.0], [93.7, 4850.0], [93.8, 4855.0], [93.9, 4868.0], [94.0, 4870.0], [94.1, 4874.0], [94.2, 4887.0], [94.3, 4893.0], [94.4, 4895.0], [94.5, 4899.0], [94.6, 4904.0], [94.7, 4910.0], [94.8, 4924.0], [94.9, 4929.0], [95.0, 4941.0], [95.1, 4945.0], [95.2, 4973.0], [95.3, 4994.0], [95.4, 5004.0], [95.5, 5011.0], [95.6, 5015.0], [95.7, 5019.0], [95.8, 5027.0], [95.9, 5042.0], [96.0, 5048.0], [96.1, 5061.0], [96.2, 5071.0], [96.3, 5075.0], [96.4, 5088.0], [96.5, 5139.0], [96.6, 5160.0], [96.7, 5165.0], [96.8, 5172.0], [96.9, 5175.0], [97.0, 5179.0], [97.1, 5191.0], [97.2, 5222.0], [97.3, 5226.0], [97.4, 5249.0], [97.5, 5278.0], [97.6, 5293.0], [97.7, 5299.0], [97.8, 5324.0], [97.9, 5337.0], [98.0, 5344.0], [98.1, 5354.0], [98.2, 5360.0], [98.3, 5368.0], [98.4, 5388.0], [98.5, 5407.0], [98.6, 5416.0], [98.7, 5435.0], [98.8, 5439.0], [98.9, 5465.0], [99.0, 5507.0], [99.1, 5566.0], [99.2, 5620.0], [99.3, 5659.0], [99.4, 5738.0], [99.5, 5798.0], [99.6, 5813.0], [99.7, 5882.0], [99.8, 6050.0], [99.9, 6122.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 82.0, "series": [{"data": [[600.0, 16.0], [700.0, 24.0], [800.0, 37.0], [900.0, 29.0], [1000.0, 32.0], [1100.0, 28.0], [1200.0, 20.0], [1300.0, 32.0], [1400.0, 20.0], [1500.0, 24.0], [1600.0, 22.0], [1700.0, 29.0], [1800.0, 32.0], [1900.0, 48.0], [2000.0, 40.0], [2100.0, 39.0], [2200.0, 41.0], [2300.0, 41.0], [2400.0, 52.0], [2500.0, 38.0], [2600.0, 32.0], [2700.0, 55.0], [2800.0, 61.0], [2900.0, 49.0], [3000.0, 50.0], [3100.0, 39.0], [3200.0, 54.0], [3300.0, 50.0], [3400.0, 44.0], [3500.0, 57.0], [3600.0, 45.0], [3700.0, 46.0], [3800.0, 55.0], [3900.0, 82.0], [4000.0, 79.0], [4200.0, 61.0], [4100.0, 65.0], [4300.0, 65.0], [4600.0, 50.0], [4500.0, 43.0], [4400.0, 70.0], [4700.0, 31.0], [4800.0, 28.0], [4900.0, 17.0], [5000.0, 21.0], [5100.0, 15.0], [5200.0, 11.0], [5300.0, 14.0], [5400.0, 11.0], [5600.0, 4.0], [5500.0, 3.0], [5800.0, 4.0], [5700.0, 4.0], [6000.0, 3.0], [6100.0, 1.0], [6300.0, 1.0], [100.0, 7.0], [200.0, 8.0], [300.0, 4.0], [400.0, 4.0], [500.0, 13.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 6300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 23.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1726.0, "series": [{"data": [[1.0, 251.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 23.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1726.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 577.383, "minX": 1.54958322E12, "maxY": 577.383, "series": [{"data": [[1.54958322E12, 577.383]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 735.0, "minX": 1.0, "maxY": 6122.0, "series": [{"data": [[2.0, 4375.0], [3.0, 4071.0], [5.0, 4192.0], [6.0, 4408.0], [7.0, 4399.0], [9.0, 4142.0], [10.0, 4532.0], [11.0, 4079.0], [12.0, 4622.0], [13.0, 4478.0], [15.0, 4534.0], [16.0, 4260.0], [18.0, 4366.5], [20.0, 4321.5], [21.0, 4096.0], [22.0, 4422.0], [23.0, 4496.0], [24.0, 4184.0], [25.0, 4009.0], [26.0, 4685.0], [27.0, 4223.0], [29.0, 4197.5], [30.0, 4621.0], [31.0, 4674.0], [33.0, 4036.0], [32.0, 4474.0], [35.0, 4659.0], [34.0, 4394.0], [37.0, 4229.0], [36.0, 4257.0], [39.0, 4447.0], [38.0, 4130.0], [41.0, 1630.3333333333333], [40.0, 1579.0], [42.0, 2165.5], [43.0, 4207.0], [45.0, 2395.5], [44.0, 1498.0], [47.0, 2192.5], [46.0, 2304.5], [49.0, 2266.5], [48.0, 2276.5], [50.0, 2473.5], [51.0, 4608.0], [53.0, 4285.0], [52.0, 3993.0], [55.0, 4325.0], [54.0, 4524.0], [57.0, 4091.0], [56.0, 4512.0], [59.0, 4102.0], [58.0, 4494.0], [60.0, 4067.0], [63.0, 4250.0], [62.0, 4375.5], [67.0, 4327.0], [66.0, 4636.0], [65.0, 4272.0], [71.0, 4253.0], [70.0, 4083.0], [69.0, 4696.0], [68.0, 4753.0], [75.0, 4675.0], [74.0, 4572.0], [73.0, 3971.0], [72.0, 4095.0], [79.0, 4596.0], [78.0, 4742.0], [77.0, 4410.5], [83.0, 4628.0], [82.0, 4945.0], [80.0, 5291.0], [87.0, 4285.5], [85.0, 4152.0], [84.0, 4563.0], [91.0, 4031.0], [90.0, 4386.0], [89.0, 4094.0], [88.0, 4155.0], [95.0, 3966.0], [94.0, 4372.5], [92.0, 3918.0], [99.0, 4638.0], [98.0, 4059.0], [97.0, 4368.0], [96.0, 4123.0], [103.0, 4339.0], [102.0, 4467.0], [101.0, 4474.0], [100.0, 4300.0], [107.0, 4080.0], [106.0, 4740.5], [104.0, 4045.0], [111.0, 3920.0], [110.0, 4383.0], [109.0, 4423.0], [108.0, 3930.0], [115.0, 4221.0], [114.0, 4202.5], [112.0, 3974.0], [119.0, 4712.0], [118.0, 4646.0], [117.0, 4140.0], [116.0, 4835.0], [123.0, 4622.0], [122.0, 4688.0], [121.0, 4670.0], [120.0, 4625.0], [127.0, 4101.0], [126.0, 4520.0], [125.0, 4012.0], [124.0, 3982.0], [135.0, 4125.0], [134.0, 4994.0], [133.0, 4560.0], [132.0, 4723.0], [131.0, 4333.0], [130.0, 5255.5], [128.0, 4366.0], [143.0, 4630.5], [141.0, 5369.0], [140.0, 4435.0], [139.0, 3928.0], [138.0, 4105.0], [137.0, 4383.0], [136.0, 5278.0], [150.0, 3830.0], [149.0, 4668.0], [147.0, 4307.0], [146.0, 4660.0], [145.0, 4534.0], [144.0, 4424.0], [159.0, 4166.0], [158.0, 4285.0], [157.0, 4120.0], [156.0, 4196.0], [154.0, 4243.0], [153.0, 4725.0], [152.0, 4252.0], [167.0, 3844.0], [166.0, 4113.0], [165.0, 4603.0], [164.0, 4044.5], [162.0, 4816.0], [161.0, 4487.0], [160.0, 4206.0], [175.0, 4133.0], [174.0, 4292.0], [173.0, 5299.0], [172.0, 4982.0], [171.0, 5071.0], [170.0, 4053.0], [169.0, 3978.0], [168.0, 4062.0], [182.0, 1890.3333333333333], [180.0, 1971.6666666666667], [179.0, 2068.0], [183.0, 3921.0], [181.0, 4184.0], [178.0, 3839.0], [177.0, 3766.0], [176.0, 4008.0], [186.0, 2716.0], [185.0, 1248.857142857143], [184.0, 1413.2], [188.0, 2482.0], [189.0, 2460.5], [191.0, 5123.0], [190.0, 3746.0], [187.0, 4691.0], [194.0, 2935.5], [193.0, 2444.0], [199.0, 4499.0], [198.0, 5798.0], [197.0, 3710.0], [196.0, 5659.0], [195.0, 4473.0], [192.0, 4853.0], [202.0, 952.0], [206.0, 4377.0], [205.0, 5438.0], [204.0, 4283.0], [203.0, 5068.0], [201.0, 4099.0], [200.0, 4478.0], [210.0, 3108.0], [215.0, 3872.0], [214.0, 5191.0], [213.0, 3828.0], [212.0, 4194.0], [211.0, 4224.0], [209.0, 3960.0], [208.0, 4320.0], [219.0, 842.0], [218.0, 2603.0], [221.0, 2307.0], [223.0, 2627.0], [222.0, 5018.0], [220.0, 4813.0], [217.0, 3985.0], [216.0, 4408.0], [225.0, 1607.6], [226.0, 3145.5], [227.0, 2429.5], [230.0, 960.3333333333334], [231.0, 4337.5], [229.0, 4694.0], [228.0, 4078.0], [224.0, 4200.0], [236.0, 2539.333333333333], [237.0, 1885.0], [239.0, 2812.5], [238.0, 4480.0], [235.0, 3775.0], [234.0, 6122.0], [233.0, 4533.0], [240.0, 1899.0], [246.0, 735.0], [247.0, 3257.0], [245.0, 4170.0], [244.0, 4502.0], [243.0, 5077.0], [242.0, 3716.0], [241.0, 3804.0], [248.0, 2180.0], [249.0, 2999.5], [250.0, 2353.0], [255.0, 4926.0], [254.0, 3827.0], [253.0, 5566.0], [252.0, 4184.0], [251.0, 5088.0], [269.0, 2694.5], [260.0, 2824.5], [262.0, 4340.0], [261.0, 3844.0], [263.0, 2111.25], [264.0, 1493.1666666666667], [265.0, 5296.0], [267.0, 2160.666666666667], [266.0, 2050.333333333333], [268.0, 3164.0], [259.0, 3675.0], [258.0, 4744.0], [257.0, 3909.0], [256.0, 4140.0], [271.0, 2606.0], [270.0, 5042.0], [279.0, 1640.6666666666667], [276.0, 2958.0], [277.0, 2533.0], [278.0, 1913.3333333333333], [280.0, 1349.142857142857], [287.0, 2090.666666666667], [281.0, 1036.1538461538462], [283.0, 870.5], [282.0, 1136.4], [286.0, 2057.666666666667], [285.0, 2463.0], [284.0, 2906.6666666666665], [275.0, 5342.0], [274.0, 4838.0], [273.0, 5180.0], [272.0, 4167.0], [301.0, 1871.6666666666667], [293.0, 779.6666666666666], [292.0, 4411.0], [294.0, 2983.3333333333335], [297.0, 2364.0], [296.0, 4341.0], [298.0, 1651.25], [299.0, 1573.75], [300.0, 2195.0], [295.0, 4228.0], [288.0, 3549.0], [290.0, 4127.0], [289.0, 3706.0], [291.0, 4414.0], [302.0, 1390.0], [303.0, 3362.75], [316.0, 2610.5], [304.0, 2356.0], [306.0, 2884.0], [307.0, 4402.0], [305.0, 3725.0], [308.0, 1941.6666666666667], [310.0, 4518.0], [309.0, 3587.0], [311.0, 3949.0], [315.0, 2114.5], [314.0, 4492.0], [313.0, 3818.0], [312.0, 5226.0], [317.0, 2407.666666666667], [319.0, 2598.5], [318.0, 4425.0], [332.0, 1982.0], [327.0, 2378.333333333333], [321.0, 5169.0], [320.0, 4217.0], [323.0, 4649.0], [322.0, 4704.0], [328.0, 2547.5], [330.0, 2466.5], [335.0, 3144.3333333333335], [333.0, 4456.0], [331.0, 4416.0], [329.0, 5321.0], [326.0, 4157.0], [325.0, 3617.0], [324.0, 5139.0], [351.0, 4654.0], [341.0, 2170.5], [340.0, 4259.0], [342.0, 5012.0], [346.0, 2310.333333333333], [350.0, 5163.0], [349.0, 4154.0], [348.0, 4662.0], [339.0, 4942.0], [338.0, 3681.0], [337.0, 4995.0], [336.0, 5388.0], [343.0, 4695.0], [347.0, 4085.0], [345.0, 5358.0], [344.0, 3963.0], [364.0, 2824.5], [354.0, 3137.0], [355.0, 4639.0], [353.0, 2121.5], [358.0, 3132.5], [357.0, 4436.0], [356.0, 4083.0], [359.0, 5793.0], [352.0, 4827.0], [360.0, 2665.5], [363.0, 2362.666666666667], [362.0, 6050.0], [361.0, 4286.0], [367.0, 4272.0], [366.0, 4406.0], [365.0, 4973.0], [383.0, 3698.0], [370.0, 2581.0], [375.0, 2606.5], [369.0, 4750.0], [368.0, 4421.0], [374.0, 3892.0], [373.0, 5473.0], [372.0, 4513.0], [377.0, 3747.0], [376.0, 4924.0], [378.0, 2230.0], [379.0, 2570.0], [380.0, 2957.5], [371.0, 5192.0], [382.0, 5177.0], [381.0, 3894.0], [398.0, 2384.666666666667], [388.0, 2352.666666666667], [389.0, 3020.5], [393.0, 1972.25], [394.0, 2104.0], [399.0, 2091.666666666667], [392.0, 4401.0], [397.0, 4845.0], [396.0, 3140.0], [391.0, 4506.0], [387.0, 4868.0], [386.0, 4346.0], [385.0, 4862.0], [384.0, 4955.0], [390.0, 5022.0], [395.0, 3540.0], [402.0, 2579.0], [401.0, 2796.5], [400.0, 4311.0], [408.0, 2666.5], [407.0, 2736.0], [406.0, 4201.0], [405.0, 4353.0], [404.0, 3945.0], [415.0, 4104.0], [414.0, 4056.0], [413.0, 4562.0], [412.0, 4478.0], [403.0, 4896.0], [411.0, 3882.0], [410.0, 3958.5], [430.0, 4040.0], [425.0, 2470.5], [423.0, 2428.0], [417.0, 5004.0], [416.0, 4203.0], [419.0, 3925.0], [418.0, 4337.0], [422.0, 4688.0], [421.0, 3026.0], [420.0, 3955.0], [426.0, 1891.75], [431.0, 2205.3333333333335], [429.0, 3958.0], [428.0, 3991.0], [427.0, 4514.0], [424.0, 4598.0], [445.0, 2325.6666666666665], [444.0, 2920.5], [435.0, 4510.0], [434.0, 4172.0], [433.0, 3851.0], [432.0, 4159.0], [447.0, 5324.0], [446.0, 4906.0], [443.0, 4245.5], [441.0, 4646.0], [440.0, 4315.0], [439.0, 4349.0], [438.0, 3894.0], [437.0, 4235.0], [436.0, 4769.0], [449.0, 2333.333333333333], [454.0, 1632.3333333333335], [453.0, 2297.0], [452.0, 4597.0], [456.0, 2580.0], [455.0, 2228.3333333333335], [448.0, 4085.0], [461.0, 1859.0], [462.0, 2318.666666666667], [460.0, 3204.0], [451.0, 4246.0], [450.0, 4874.0], [459.0, 4504.5], [457.0, 4679.0], [467.0, 2826.0], [468.0, 2326.5], [469.0, 4874.0], [470.0, 2918.0], [471.0, 3507.5], [464.0, 4704.0], [466.0, 4405.0], [465.0, 3845.0], [473.0, 2639.0], [474.0, 2229.0], [475.0, 4844.0], [477.0, 2986.5], [476.0, 3854.0], [478.0, 2506.5], [479.0, 4508.0], [472.0, 3546.0], [494.0, 4149.0], [487.0, 2271.0], [481.0, 2811.0], [480.0, 4063.0], [483.0, 3893.0], [482.0, 4617.0], [484.0, 2629.5], [486.0, 3766.0], [485.0, 4506.0], [495.0, 4348.0], [488.0, 4204.0], [493.0, 4107.0], [492.0, 3644.0], [491.0, 4175.0], [490.0, 4529.0], [510.0, 3953.0], [505.0, 1514.5], [499.0, 3617.5], [498.0, 5813.0], [497.0, 3323.0], [496.0, 4327.0], [503.0, 4624.0], [502.0, 4280.0], [500.0, 3999.0], [507.0, 3504.0], [506.0, 3427.75], [511.0, 4471.0], [509.0, 3600.0], [508.0, 3619.0], [504.0, 5507.0], [536.0, 3322.0], [513.0, 2458.5], [512.0, 3256.0], [516.0, 2673.5], [515.0, 4175.0], [514.0, 3929.0], [517.0, 4127.0], [519.0, 4258.0], [518.0, 4404.0], [540.0, 2272.0], [539.0, 3655.0], [538.0, 4583.0], [537.0, 3422.0], [541.0, 4051.0], [543.0, 4372.0], [529.0, 4583.0], [528.0, 4593.0], [531.0, 5344.0], [530.0, 4208.0], [542.0, 4362.0], [521.0, 3247.5], [520.0, 3975.0], [523.0, 5293.0], [522.0, 4759.0], [525.0, 4945.0], [524.0, 3772.0], [526.0, 3206.5], [527.0, 3601.5], [532.0, 3967.5], [534.0, 2180.0], [533.0, 3849.0], [535.0, 3905.0], [550.0, 2767.0], [548.0, 2202.5], [544.0, 2543.0], [547.0, 5273.0], [546.0, 3270.0], [545.0, 3776.0], [559.0, 4417.0], [549.0, 3012.5], [557.0, 2614.5], [556.0, 3896.0], [555.0, 4107.5], [553.0, 4354.0], [552.0, 3667.0], [558.0, 2645.6666666666665], [560.0, 2589.0], [575.0, 2288.0], [572.0, 3456.6666666666665], [573.0, 2903.5], [574.0, 2131.0], [568.0, 2707.3333333333335], [551.0, 4034.0], [570.0, 3889.0], [569.0, 4014.0], [571.0, 1599.0], [561.0, 3364.0], [565.0, 3388.6666666666665], [564.0, 3907.0], [562.0, 5432.0], [566.0, 3659.5], [567.0, 4085.0], [580.0, 2672.0], [577.0, 2900.5], [579.0, 4904.0], [578.0, 4000.0], [591.0, 3176.0], [576.0, 5006.0], [581.0, 2105.0], [582.0, 4790.0], [584.0, 3231.0], [585.0, 5414.0], [583.0, 2670.5], [586.0, 1812.75], [587.0, 2977.3333333333335], [589.0, 4632.5], [590.0, 3062.0], [592.0, 1965.6], [594.0, 4769.0], [593.0, 3913.0], [607.0, 4122.0], [605.0, 2575.3333333333335], [604.0, 4125.0], [603.0, 4034.0], [606.0, 2413.0], [602.0, 2542.3333333333335], [601.0, 2712.6666666666665], [600.0, 2802.5], [596.0, 3695.3333333333335], [598.0, 3047.5], [597.0, 3226.0], [599.0, 3236.0], [614.0, 2967.3333333333335], [610.0, 2246.0], [609.0, 3096.5], [608.0, 4655.0], [622.0, 2994.3333333333335], [623.0, 3950.0], [611.0, 3798.0], [612.0, 2685.2], [613.0, 2683.0], [615.0, 2627.75], [632.0, 3243.5], [638.0, 2494.666666666667], [637.0, 5360.0], [636.0, 3282.0], [635.0, 4756.0], [634.0, 4138.0], [633.0, 4088.0], [639.0, 3233.5], [624.0, 2958.0], [626.0, 2949.5], [625.0, 3614.0], [627.0, 4021.0], [628.0, 2599.25], [630.0, 2712.25], [631.0, 3214.5], [629.0, 3105.0], [616.0, 2282.375], [617.0, 2449.0], [618.0, 2120.5499999999997], [620.0, 2169.6], [619.0, 2656.75], [621.0, 2356.625], [647.0, 3538.0], [643.0, 2778.8], [640.0, 2944.3333333333335], [642.0, 4488.0], [641.0, 2953.0], [644.0, 2641.8], [646.0, 2885.6], [645.0, 3584.0], [656.0, 2417.0], [657.0, 4289.0], [671.0, 2299.4], [668.0, 3104.6666666666665], [667.0, 1943.25], [666.0, 4311.0], [669.0, 3295.75], [670.0, 2585.0], [664.0, 2645.5], [665.0, 2582.3333333333335], [659.0, 2258.0], [662.0, 2077.9], [663.0, 3334.0], [661.0, 2313.75], [660.0, 2969.8333333333335], [658.0, 2450.0], [649.0, 2544.5], [648.0, 4122.0], [650.0, 4126.0], [651.0, 2276.2], [652.0, 3072.0], [654.0, 3121.6666666666665], [653.0, 3541.0], [655.0, 3224.0], [675.0, 2725.4], [685.0, 2120.0], [673.0, 2721.75], [672.0, 2623.5714285714284], [686.0, 2162.1666666666665], [687.0, 2787.6666666666665], [674.0, 2582.5714285714284], [676.0, 2733.4], [678.0, 3179.0], [677.0, 2821.0], [696.0, 3322.666666666667], [679.0, 4461.0], [697.0, 3124.625], [698.0, 2536.0], [699.0, 2544.0], [700.0, 2932.75], [701.0, 2807.6], [702.0, 2995.3333333333335], [703.0, 3629.5], [688.0, 3643.0], [689.0, 2101.0], [690.0, 2539.8], [691.0, 3406.6666666666665], [693.0, 2721.6666666666665], [695.0, 2785.3333333333335], [694.0, 3796.0], [692.0, 2598.4], [683.0, 2333.769230769231], [682.0, 2556.222222222222], [681.0, 2304.0], [680.0, 2821.25], [684.0, 2500.8888888888887], [710.0, 3059.0], [705.0, 3389.0], [704.0, 3130.0], [719.0, 2967.5], [707.0, 2760.923076923077], [708.0, 2338.818181818182], [709.0, 3314.6666666666665], [706.0, 4186.0], [721.0, 3394.0], [722.0, 2529.0], [723.0, 3620.0], [725.0, 4147.0], [724.0, 4915.0], [727.0, 2970.5], [726.0, 5179.0], [720.0, 2931.0], [735.0, 2877.25], [734.0, 3552.0], [733.0, 4245.0], [732.0, 3235.6666666666665], [731.0, 3004.0], [730.0, 2974.0], [729.0, 3036.0], [728.0, 4701.0], [711.0, 3935.0], [717.0, 2667.5], [716.0, 2756.3333333333335], [715.0, 2630.6666666666665], [714.0, 3961.0], [713.0, 3194.0], [712.0, 3701.0], [718.0, 2956.6666666666665], [743.0, 2535.5], [738.0, 3230.5], [736.0, 3065.0], [737.0, 3634.0], [751.0, 2483.0], [749.0, 3208.5], [750.0, 2988.6666666666665], [741.0, 2371.0], [742.0, 3314.0], [740.0, 2750.5], [739.0, 3320.0], [745.0, 2524.625], [744.0, 2759.6666666666665], [752.0, 3940.5], [754.0, 4067.0], [753.0, 3798.0], [756.0, 3882.0], [755.0, 4221.0], [758.0, 3006.0], [757.0, 3534.0], [767.0, 2755.375], [766.0, 2814.3333333333335], [765.0, 5063.0], [762.0, 2993.25], [761.0, 3205.0], [760.0, 4636.5], [763.0, 3105.3333333333335], [764.0, 2799.5], [748.0, 2891.0], [747.0, 2763.5], [746.0, 4045.0], [795.0, 3193.0], [769.0, 3064.1666666666665], [768.0, 2323.3333333333335], [783.0, 2874.285714285714], [770.0, 2702.8], [772.0, 2964.0], [771.0, 3698.0], [774.0, 2500.0], [773.0, 3194.0], [775.0, 3816.5], [778.0, 2752.25], [777.0, 3836.5], [776.0, 4177.0], [781.0, 3120.3333333333335], [780.0, 3588.0], [779.0, 5027.0], [782.0, 2866.0], [784.0, 3032.4444444444443], [799.0, 2776.25], [798.0, 3014.5], [797.0, 3925.0], [796.0, 3679.0], [793.0, 3259.5], [792.0, 3462.0], [794.0, 2978.5], [785.0, 2575.2857142857147], [787.0, 2726.0], [788.0, 2895.5], [789.0, 2901.5], [791.0, 2787.25], [790.0, 2913.4285714285716], [786.0, 2529.714285714286], [805.0, 3320.0], [800.0, 2897.8], [802.0, 2853.0], [801.0, 2096.0], [804.0, 3473.0], [803.0, 2891.0], [807.0, 2920.5], [806.0, 3199.0], [808.0, 2759.5], [809.0, 4351.0], [810.0, 3362.5], [813.0, 3594.3333333333335], [811.0, 4900.0], [814.0, 3348.0], [815.0, 3018.6666666666665], [816.0, 2963.0], [819.0, 3530.5], [817.0, 4713.0], [831.0, 3086.5], [830.0, 2752.0], [827.0, 3107.0], [826.0, 4258.0], [825.0, 3713.5], [828.0, 3978.0], [829.0, 3279.5], [820.0, 3487.0], [821.0, 2781.0], [822.0, 2795.5], [823.0, 3096.5], [835.0, 3108.0], [833.0, 3290.0], [832.0, 4323.0], [834.0, 3472.0], [836.0, 2545.0], [837.0, 2876.0], [839.0, 3237.0], [838.0, 3353.0], [857.0, 3273.0], [856.0, 3075.0], [858.0, 2704.0], [863.0, 2707.25], [849.0, 2808.0], [848.0, 3937.0], [862.0, 3312.0], [861.0, 3005.0], [860.0, 3413.0], [859.0, 3431.0], [842.0, 2525.0], [841.0, 3270.0], [840.0, 3637.0], [843.0, 3597.0], [844.0, 2950.5], [847.0, 2658.75], [846.0, 3047.0], [845.0, 2911.0], [850.0, 3262.6666666666665], [852.0, 2743.3333333333335], [855.0, 3516.0], [854.0, 3053.0], [853.0, 3026.0], [851.0, 2686.0], [889.0, 2805.5], [865.0, 2815.4], [864.0, 2696.5], [879.0, 2904.2], [867.0, 3185.0], [866.0, 4186.0], [868.0, 3918.0], [870.0, 3228.0], [869.0, 4467.0], [871.0, 3131.0], [873.0, 3049.6666666666665], [872.0, 3229.0], [874.0, 3198.0], [877.0, 2661.8333333333335], [876.0, 3716.0], [875.0, 3934.0], [878.0, 2825.6], [881.0, 2871.6666666666665], [883.0, 3241.3333333333335], [882.0, 2986.0], [884.0, 2916.0], [887.0, 3098.0], [886.0, 2703.1111111111113], [885.0, 2883.0], [880.0, 3678.5], [892.0, 2754.5], [894.0, 3849.0], [893.0, 3310.0], [895.0, 2905.0], [891.0, 2418.5], [890.0, 3141.2], [888.0, 2790.0], [924.0, 3879.0], [927.0, 3448.0], [913.0, 3287.0], [912.0, 4149.0], [915.0, 3932.0], [914.0, 3028.0], [917.0, 3255.0], [916.0, 3288.0], [926.0, 3613.0], [925.0, 3434.0], [923.0, 3722.0], [922.0, 3957.0], [921.0, 4309.0], [920.0, 3071.0], [911.0, 3006.0], [897.0, 2945.0], [896.0, 3762.0], [899.0, 3822.0], [898.0, 3854.0], [901.0, 3742.0], [900.0, 4739.0], [903.0, 3997.0], [902.0, 3051.0], [910.0, 3720.0], [909.0, 3998.0], [907.0, 2804.0], [906.0, 2885.0], [905.0, 3955.0], [904.0, 3748.0], [919.0, 3414.0], [918.0, 2908.0], [956.0, 2887.0], [959.0, 4218.0], [945.0, 3691.0], [944.0, 3771.0], [947.0, 4299.0], [946.0, 2980.0], [949.0, 3375.0], [948.0, 3528.0], [958.0, 2981.0], [957.0, 3119.0], [955.0, 2869.0], [954.0, 2948.0], [953.0, 3275.0], [952.0, 4214.0], [943.0, 3828.0], [929.0, 3332.0], [928.0, 3580.0], [931.0, 2836.0], [930.0, 3837.0], [933.0, 3244.0], [932.0, 3263.0], [935.0, 3553.0], [934.0, 3033.0], [942.0, 4035.0], [941.0, 3460.0], [940.0, 2693.0], [939.0, 2976.0], [938.0, 3297.0], [937.0, 3375.0], [936.0, 2989.0], [951.0, 3849.0], [950.0, 3742.0], [988.0, 2654.0], [991.0, 3692.0], [977.0, 3913.0], [976.0, 2703.0], [979.0, 3833.0], [978.0, 3439.0], [981.0, 3293.0], [980.0, 2842.0], [990.0, 3033.0], [989.0, 3448.0], [987.0, 3699.0], [986.0, 3025.0], [985.0, 3057.0], [984.0, 3571.0], [975.0, 3575.0], [961.0, 2768.0], [960.0, 4007.0], [963.0, 3795.0], [962.0, 3402.0], [965.0, 3720.0], [964.0, 4049.0], [967.0, 3311.0], [966.0, 3280.0], [974.0, 3727.0], [973.0, 3615.0], [972.0, 3301.0], [971.0, 3242.0], [970.0, 4258.0], [969.0, 3616.0], [968.0, 3244.0], [983.0, 3320.0], [982.0, 2995.0], [1020.0, 3143.0], [1023.0, 3986.0], [1009.0, 3606.0], [1008.0, 2967.5], [1011.0, 3197.0], [1010.0, 3577.0], [1013.0, 3669.0], [1012.0, 3166.0], [1022.0, 3359.0], [1021.0, 4133.0], [1019.0, 2847.0], [1018.0, 3543.0], [1017.0, 3294.0], [1016.0, 3443.0], [1006.0, 3298.0], [993.0, 3101.0], [992.0, 3902.0], [995.0, 3102.0], [994.0, 3747.0], [997.0, 3293.0], [996.0, 2876.0], [999.0, 3456.0], [998.0, 4300.0], [1005.0, 3170.0], [1004.0, 3228.0], [1003.0, 2557.0], [1002.0, 3470.0], [1001.0, 4346.0], [1000.0, 3597.0], [1015.0, 2594.0], [1014.0, 3101.0], [1032.0, 4031.0], [1078.0, 3462.0], [1076.0, 3558.0], [1074.0, 4415.0], [1072.0, 3878.0], [1038.0, 3267.0], [1036.0, 3477.0], [1034.0, 4119.0], [1030.0, 3044.0], [1028.0, 3759.0], [1026.0, 3286.0], [1024.0, 3274.0], [1054.0, 2633.0], [1052.0, 3533.0], [1050.0, 2852.0], [1048.0, 3256.0], [1046.0, 3255.0], [1044.0, 3043.0], [1042.0, 3753.0], [1040.0, 3123.0], [1056.0, 3361.0], [1058.0, 3094.0], [1060.0, 3847.0], [1062.0, 3973.0], [1064.0, 3608.0], [1066.0, 2915.0], [1068.0, 3602.0], [1070.0, 3185.0], [1086.0, 3699.0], [1084.0, 3716.0], [1082.0, 3875.0], [1080.0, 3047.0], [1092.0, 3193.4], [1094.0, 3897.0], [1090.0, 3512.75], [1088.0, 3512.0], [1031.0, 2733.0], [1075.0, 3570.0], [1083.0, 3266.3333333333335], [1077.0, 3040.0], [1073.0, 3804.0], [1039.0, 3181.0], [1035.0, 4645.0], [1033.0, 3367.0], [1029.0, 3135.0], [1027.0, 3815.0], [1025.0, 3535.0], [1055.0, 2940.0], [1053.0, 4049.0], [1051.0, 3721.0], [1049.0, 3139.0], [1047.0, 3166.0], [1045.0, 3660.0], [1043.0, 2237.0], [1041.0, 2989.0], [1087.0, 3254.0], [1057.0, 3965.0], [1059.0, 3577.0], [1061.0, 3486.0], [1063.0, 2233.0], [1065.0, 2992.0], [1067.0, 3317.0], [1069.0, 3182.0], [1071.0, 3266.0], [1081.0, 3831.3333333333335], [1079.0, 3316.0], [1091.0, 3196.666666666667], [1093.0, 3841.0], [1095.0, 3365.0], [1089.0, 3860.0], [1.0, 4427.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[577.3835000000013, 3125.470999999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1095.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.54958322E12, "maxY": 13998.433333333332, "series": [{"data": [[1.54958322E12, 13998.433333333332]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958322E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3125.470999999999, "minX": 1.54958322E12, "maxY": 3125.470999999999, "series": [{"data": [[1.54958322E12, 3125.470999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3125.4610000000007, "minX": 1.54958322E12, "maxY": 3125.4610000000007, "series": [{"data": [[1.54958322E12, 3125.4610000000007]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 117.79600000000005, "minX": 1.54958322E12, "maxY": 117.79600000000005, "series": [{"data": [[1.54958322E12, 117.79600000000005]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 113.0, "minX": 1.54958322E12, "maxY": 6374.0, "series": [{"data": [[1.54958322E12, 6374.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958322E12, 113.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958322E12, 4637.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958322E12, 5506.66]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958322E12, 4940.749999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3271.5, "minX": 33.0, "maxY": 3271.5, "series": [{"data": [[33.0, 3271.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3271.5, "minX": 33.0, "maxY": 3271.5, "series": [{"data": [[33.0, 3271.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958322E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958322E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958322E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958322E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958322E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958322E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Transactions Per Second"}},
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
