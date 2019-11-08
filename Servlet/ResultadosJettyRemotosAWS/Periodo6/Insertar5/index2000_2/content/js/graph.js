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
        data: {"result": {"minY": 130.0, "minX": 0.0, "maxY": 5745.0, "series": [{"data": [[0.0, 130.0], [0.1, 143.0], [0.2, 148.0], [0.3, 160.0], [0.4, 168.0], [0.5, 172.0], [0.6, 190.0], [0.7, 209.0], [0.8, 214.0], [0.9, 215.0], [1.0, 218.0], [1.1, 221.0], [1.2, 230.0], [1.3, 236.0], [1.4, 239.0], [1.5, 240.0], [1.6, 247.0], [1.7, 250.0], [1.8, 253.0], [1.9, 263.0], [2.0, 266.0], [2.1, 278.0], [2.2, 288.0], [2.3, 316.0], [2.4, 360.0], [2.5, 403.0], [2.6, 489.0], [2.7, 524.0], [2.8, 564.0], [2.9, 584.0], [3.0, 604.0], [3.1, 643.0], [3.2, 670.0], [3.3, 719.0], [3.4, 733.0], [3.5, 743.0], [3.6, 764.0], [3.7, 770.0], [3.8, 774.0], [3.9, 783.0], [4.0, 797.0], [4.1, 806.0], [4.2, 810.0], [4.3, 814.0], [4.4, 828.0], [4.5, 835.0], [4.6, 841.0], [4.7, 849.0], [4.8, 858.0], [4.9, 869.0], [5.0, 877.0], [5.1, 888.0], [5.2, 889.0], [5.3, 896.0], [5.4, 899.0], [5.5, 903.0], [5.6, 907.0], [5.7, 912.0], [5.8, 919.0], [5.9, 931.0], [6.0, 946.0], [6.1, 961.0], [6.2, 962.0], [6.3, 967.0], [6.4, 977.0], [6.5, 980.0], [6.6, 989.0], [6.7, 999.0], [6.8, 1002.0], [6.9, 1008.0], [7.0, 1010.0], [7.1, 1015.0], [7.2, 1028.0], [7.3, 1033.0], [7.4, 1035.0], [7.5, 1060.0], [7.6, 1069.0], [7.7, 1075.0], [7.8, 1080.0], [7.9, 1088.0], [8.0, 1104.0], [8.1, 1111.0], [8.2, 1122.0], [8.3, 1127.0], [8.4, 1146.0], [8.5, 1150.0], [8.6, 1152.0], [8.7, 1157.0], [8.8, 1159.0], [8.9, 1163.0], [9.0, 1171.0], [9.1, 1172.0], [9.2, 1174.0], [9.3, 1180.0], [9.4, 1188.0], [9.5, 1193.0], [9.6, 1203.0], [9.7, 1211.0], [9.8, 1214.0], [9.9, 1217.0], [10.0, 1225.0], [10.1, 1235.0], [10.2, 1247.0], [10.3, 1247.0], [10.4, 1248.0], [10.5, 1250.0], [10.6, 1252.0], [10.7, 1257.0], [10.8, 1261.0], [10.9, 1269.0], [11.0, 1280.0], [11.1, 1283.0], [11.2, 1289.0], [11.3, 1302.0], [11.4, 1317.0], [11.5, 1341.0], [11.6, 1348.0], [11.7, 1350.0], [11.8, 1355.0], [11.9, 1362.0], [12.0, 1368.0], [12.1, 1376.0], [12.2, 1380.0], [12.3, 1386.0], [12.4, 1391.0], [12.5, 1399.0], [12.6, 1406.0], [12.7, 1409.0], [12.8, 1413.0], [12.9, 1421.0], [13.0, 1427.0], [13.1, 1447.0], [13.2, 1450.0], [13.3, 1460.0], [13.4, 1468.0], [13.5, 1474.0], [13.6, 1476.0], [13.7, 1477.0], [13.8, 1478.0], [13.9, 1481.0], [14.0, 1487.0], [14.1, 1496.0], [14.2, 1500.0], [14.3, 1507.0], [14.4, 1520.0], [14.5, 1527.0], [14.6, 1536.0], [14.7, 1549.0], [14.8, 1555.0], [14.9, 1561.0], [15.0, 1563.0], [15.1, 1580.0], [15.2, 1587.0], [15.3, 1597.0], [15.4, 1619.0], [15.5, 1631.0], [15.6, 1634.0], [15.7, 1636.0], [15.8, 1644.0], [15.9, 1648.0], [16.0, 1653.0], [16.1, 1655.0], [16.2, 1667.0], [16.3, 1670.0], [16.4, 1672.0], [16.5, 1679.0], [16.6, 1700.0], [16.7, 1708.0], [16.8, 1714.0], [16.9, 1728.0], [17.0, 1735.0], [17.1, 1747.0], [17.2, 1752.0], [17.3, 1761.0], [17.4, 1768.0], [17.5, 1777.0], [17.6, 1783.0], [17.7, 1790.0], [17.8, 1793.0], [17.9, 1802.0], [18.0, 1806.0], [18.1, 1809.0], [18.2, 1828.0], [18.3, 1835.0], [18.4, 1837.0], [18.5, 1842.0], [18.6, 1846.0], [18.7, 1850.0], [18.8, 1852.0], [18.9, 1853.0], [19.0, 1858.0], [19.1, 1864.0], [19.2, 1868.0], [19.3, 1869.0], [19.4, 1875.0], [19.5, 1877.0], [19.6, 1882.0], [19.7, 1901.0], [19.8, 1908.0], [19.9, 1911.0], [20.0, 1917.0], [20.1, 1920.0], [20.2, 1928.0], [20.3, 1933.0], [20.4, 1934.0], [20.5, 1936.0], [20.6, 1942.0], [20.7, 1945.0], [20.8, 1955.0], [20.9, 1958.0], [21.0, 1967.0], [21.1, 1975.0], [21.2, 1983.0], [21.3, 1985.0], [21.4, 1987.0], [21.5, 1999.0], [21.6, 2005.0], [21.7, 2008.0], [21.8, 2013.0], [21.9, 2026.0], [22.0, 2032.0], [22.1, 2040.0], [22.2, 2042.0], [22.3, 2043.0], [22.4, 2048.0], [22.5, 2052.0], [22.6, 2056.0], [22.7, 2059.0], [22.8, 2061.0], [22.9, 2069.0], [23.0, 2070.0], [23.1, 2072.0], [23.2, 2080.0], [23.3, 2096.0], [23.4, 2106.0], [23.5, 2111.0], [23.6, 2113.0], [23.7, 2116.0], [23.8, 2118.0], [23.9, 2124.0], [24.0, 2129.0], [24.1, 2133.0], [24.2, 2139.0], [24.3, 2140.0], [24.4, 2141.0], [24.5, 2146.0], [24.6, 2148.0], [24.7, 2152.0], [24.8, 2153.0], [24.9, 2160.0], [25.0, 2162.0], [25.1, 2181.0], [25.2, 2190.0], [25.3, 2192.0], [25.4, 2196.0], [25.5, 2201.0], [25.6, 2202.0], [25.7, 2205.0], [25.8, 2221.0], [25.9, 2225.0], [26.0, 2237.0], [26.1, 2244.0], [26.2, 2246.0], [26.3, 2248.0], [26.4, 2253.0], [26.5, 2258.0], [26.6, 2265.0], [26.7, 2274.0], [26.8, 2280.0], [26.9, 2287.0], [27.0, 2289.0], [27.1, 2292.0], [27.2, 2293.0], [27.3, 2295.0], [27.4, 2295.0], [27.5, 2297.0], [27.6, 2306.0], [27.7, 2313.0], [27.8, 2319.0], [27.9, 2326.0], [28.0, 2332.0], [28.1, 2334.0], [28.2, 2339.0], [28.3, 2353.0], [28.4, 2357.0], [28.5, 2359.0], [28.6, 2362.0], [28.7, 2369.0], [28.8, 2373.0], [28.9, 2376.0], [29.0, 2380.0], [29.1, 2383.0], [29.2, 2394.0], [29.3, 2403.0], [29.4, 2403.0], [29.5, 2409.0], [29.6, 2412.0], [29.7, 2415.0], [29.8, 2419.0], [29.9, 2425.0], [30.0, 2427.0], [30.1, 2430.0], [30.2, 2432.0], [30.3, 2437.0], [30.4, 2441.0], [30.5, 2443.0], [30.6, 2453.0], [30.7, 2459.0], [30.8, 2462.0], [30.9, 2464.0], [31.0, 2466.0], [31.1, 2474.0], [31.2, 2476.0], [31.3, 2477.0], [31.4, 2480.0], [31.5, 2489.0], [31.6, 2493.0], [31.7, 2493.0], [31.8, 2498.0], [31.9, 2502.0], [32.0, 2506.0], [32.1, 2509.0], [32.2, 2510.0], [32.3, 2511.0], [32.4, 2512.0], [32.5, 2518.0], [32.6, 2522.0], [32.7, 2526.0], [32.8, 2532.0], [32.9, 2534.0], [33.0, 2544.0], [33.1, 2546.0], [33.2, 2550.0], [33.3, 2551.0], [33.4, 2555.0], [33.5, 2559.0], [33.6, 2562.0], [33.7, 2574.0], [33.8, 2577.0], [33.9, 2586.0], [34.0, 2588.0], [34.1, 2591.0], [34.2, 2596.0], [34.3, 2597.0], [34.4, 2601.0], [34.5, 2601.0], [34.6, 2603.0], [34.7, 2604.0], [34.8, 2604.0], [34.9, 2606.0], [35.0, 2611.0], [35.1, 2616.0], [35.2, 2624.0], [35.3, 2631.0], [35.4, 2641.0], [35.5, 2647.0], [35.6, 2647.0], [35.7, 2649.0], [35.8, 2652.0], [35.9, 2656.0], [36.0, 2656.0], [36.1, 2660.0], [36.2, 2667.0], [36.3, 2682.0], [36.4, 2700.0], [36.5, 2703.0], [36.6, 2708.0], [36.7, 2708.0], [36.8, 2716.0], [36.9, 2723.0], [37.0, 2729.0], [37.1, 2745.0], [37.2, 2746.0], [37.3, 2748.0], [37.4, 2751.0], [37.5, 2753.0], [37.6, 2757.0], [37.7, 2762.0], [37.8, 2769.0], [37.9, 2782.0], [38.0, 2791.0], [38.1, 2797.0], [38.2, 2798.0], [38.3, 2808.0], [38.4, 2819.0], [38.5, 2821.0], [38.6, 2824.0], [38.7, 2832.0], [38.8, 2845.0], [38.9, 2846.0], [39.0, 2851.0], [39.1, 2855.0], [39.2, 2860.0], [39.3, 2873.0], [39.4, 2875.0], [39.5, 2881.0], [39.6, 2883.0], [39.7, 2885.0], [39.8, 2892.0], [39.9, 2895.0], [40.0, 2898.0], [40.1, 2901.0], [40.2, 2911.0], [40.3, 2913.0], [40.4, 2916.0], [40.5, 2919.0], [40.6, 2921.0], [40.7, 2922.0], [40.8, 2926.0], [40.9, 2932.0], [41.0, 2935.0], [41.1, 2949.0], [41.2, 2953.0], [41.3, 2963.0], [41.4, 2965.0], [41.5, 2974.0], [41.6, 2979.0], [41.7, 2988.0], [41.8, 2992.0], [41.9, 2993.0], [42.0, 2996.0], [42.1, 3004.0], [42.2, 3007.0], [42.3, 3010.0], [42.4, 3016.0], [42.5, 3018.0], [42.6, 3021.0], [42.7, 3025.0], [42.8, 3026.0], [42.9, 3034.0], [43.0, 3035.0], [43.1, 3036.0], [43.2, 3037.0], [43.3, 3044.0], [43.4, 3048.0], [43.5, 3051.0], [43.6, 3053.0], [43.7, 3055.0], [43.8, 3057.0], [43.9, 3061.0], [44.0, 3063.0], [44.1, 3068.0], [44.2, 3074.0], [44.3, 3085.0], [44.4, 3094.0], [44.5, 3095.0], [44.6, 3097.0], [44.7, 3102.0], [44.8, 3102.0], [44.9, 3115.0], [45.0, 3116.0], [45.1, 3123.0], [45.2, 3132.0], [45.3, 3137.0], [45.4, 3139.0], [45.5, 3142.0], [45.6, 3143.0], [45.7, 3147.0], [45.8, 3151.0], [45.9, 3156.0], [46.0, 3158.0], [46.1, 3170.0], [46.2, 3174.0], [46.3, 3176.0], [46.4, 3183.0], [46.5, 3188.0], [46.6, 3192.0], [46.7, 3192.0], [46.8, 3194.0], [46.9, 3201.0], [47.0, 3207.0], [47.1, 3210.0], [47.2, 3218.0], [47.3, 3222.0], [47.4, 3234.0], [47.5, 3244.0], [47.6, 3249.0], [47.7, 3254.0], [47.8, 3260.0], [47.9, 3262.0], [48.0, 3263.0], [48.1, 3265.0], [48.2, 3268.0], [48.3, 3269.0], [48.4, 3275.0], [48.5, 3287.0], [48.6, 3295.0], [48.7, 3295.0], [48.8, 3304.0], [48.9, 3310.0], [49.0, 3318.0], [49.1, 3326.0], [49.2, 3328.0], [49.3, 3339.0], [49.4, 3340.0], [49.5, 3343.0], [49.6, 3349.0], [49.7, 3358.0], [49.8, 3362.0], [49.9, 3364.0], [50.0, 3373.0], [50.1, 3382.0], [50.2, 3397.0], [50.3, 3399.0], [50.4, 3402.0], [50.5, 3405.0], [50.6, 3408.0], [50.7, 3413.0], [50.8, 3414.0], [50.9, 3423.0], [51.0, 3431.0], [51.1, 3433.0], [51.2, 3435.0], [51.3, 3437.0], [51.4, 3441.0], [51.5, 3442.0], [51.6, 3449.0], [51.7, 3455.0], [51.8, 3462.0], [51.9, 3466.0], [52.0, 3479.0], [52.1, 3482.0], [52.2, 3486.0], [52.3, 3493.0], [52.4, 3497.0], [52.5, 3501.0], [52.6, 3510.0], [52.7, 3514.0], [52.8, 3516.0], [52.9, 3525.0], [53.0, 3539.0], [53.1, 3541.0], [53.2, 3544.0], [53.3, 3549.0], [53.4, 3551.0], [53.5, 3553.0], [53.6, 3555.0], [53.7, 3557.0], [53.8, 3563.0], [53.9, 3570.0], [54.0, 3577.0], [54.1, 3587.0], [54.2, 3595.0], [54.3, 3599.0], [54.4, 3602.0], [54.5, 3610.0], [54.6, 3613.0], [54.7, 3617.0], [54.8, 3624.0], [54.9, 3627.0], [55.0, 3629.0], [55.1, 3631.0], [55.2, 3634.0], [55.3, 3636.0], [55.4, 3641.0], [55.5, 3642.0], [55.6, 3642.0], [55.7, 3645.0], [55.8, 3649.0], [55.9, 3653.0], [56.0, 3656.0], [56.1, 3664.0], [56.2, 3665.0], [56.3, 3670.0], [56.4, 3670.0], [56.5, 3679.0], [56.6, 3680.0], [56.7, 3689.0], [56.8, 3694.0], [56.9, 3696.0], [57.0, 3705.0], [57.1, 3708.0], [57.2, 3713.0], [57.3, 3720.0], [57.4, 3723.0], [57.5, 3726.0], [57.6, 3728.0], [57.7, 3731.0], [57.8, 3737.0], [57.9, 3738.0], [58.0, 3741.0], [58.1, 3743.0], [58.2, 3746.0], [58.3, 3747.0], [58.4, 3749.0], [58.5, 3754.0], [58.6, 3758.0], [58.7, 3759.0], [58.8, 3762.0], [58.9, 3771.0], [59.0, 3772.0], [59.1, 3778.0], [59.2, 3785.0], [59.3, 3788.0], [59.4, 3794.0], [59.5, 3796.0], [59.6, 3800.0], [59.7, 3805.0], [59.8, 3806.0], [59.9, 3807.0], [60.0, 3809.0], [60.1, 3809.0], [60.2, 3813.0], [60.3, 3817.0], [60.4, 3820.0], [60.5, 3828.0], [60.6, 3832.0], [60.7, 3833.0], [60.8, 3835.0], [60.9, 3843.0], [61.0, 3854.0], [61.1, 3856.0], [61.2, 3863.0], [61.3, 3872.0], [61.4, 3874.0], [61.5, 3877.0], [61.6, 3880.0], [61.7, 3883.0], [61.8, 3886.0], [61.9, 3887.0], [62.0, 3893.0], [62.1, 3894.0], [62.2, 3896.0], [62.3, 3896.0], [62.4, 3902.0], [62.5, 3904.0], [62.6, 3906.0], [62.7, 3912.0], [62.8, 3917.0], [62.9, 3920.0], [63.0, 3923.0], [63.1, 3928.0], [63.2, 3933.0], [63.3, 3936.0], [63.4, 3939.0], [63.5, 3941.0], [63.6, 3943.0], [63.7, 3948.0], [63.8, 3949.0], [63.9, 3950.0], [64.0, 3951.0], [64.1, 3955.0], [64.2, 3955.0], [64.3, 3962.0], [64.4, 3969.0], [64.5, 3975.0], [64.6, 3982.0], [64.7, 3989.0], [64.8, 3990.0], [64.9, 3993.0], [65.0, 3996.0], [65.1, 3998.0], [65.2, 3999.0], [65.3, 4001.0], [65.4, 4003.0], [65.5, 4005.0], [65.6, 4016.0], [65.7, 4018.0], [65.8, 4021.0], [65.9, 4023.0], [66.0, 4028.0], [66.1, 4029.0], [66.2, 4030.0], [66.3, 4033.0], [66.4, 4037.0], [66.5, 4041.0], [66.6, 4047.0], [66.7, 4048.0], [66.8, 4058.0], [66.9, 4061.0], [67.0, 4063.0], [67.1, 4066.0], [67.2, 4070.0], [67.3, 4075.0], [67.4, 4076.0], [67.5, 4079.0], [67.6, 4079.0], [67.7, 4083.0], [67.8, 4083.0], [67.9, 4087.0], [68.0, 4088.0], [68.1, 4090.0], [68.2, 4096.0], [68.3, 4098.0], [68.4, 4099.0], [68.5, 4100.0], [68.6, 4104.0], [68.7, 4118.0], [68.8, 4126.0], [68.9, 4128.0], [69.0, 4131.0], [69.1, 4133.0], [69.2, 4135.0], [69.3, 4136.0], [69.4, 4141.0], [69.5, 4146.0], [69.6, 4146.0], [69.7, 4149.0], [69.8, 4153.0], [69.9, 4157.0], [70.0, 4158.0], [70.1, 4160.0], [70.2, 4162.0], [70.3, 4163.0], [70.4, 4166.0], [70.5, 4169.0], [70.6, 4169.0], [70.7, 4172.0], [70.8, 4179.0], [70.9, 4179.0], [71.0, 4185.0], [71.1, 4188.0], [71.2, 4189.0], [71.3, 4192.0], [71.4, 4195.0], [71.5, 4197.0], [71.6, 4201.0], [71.7, 4203.0], [71.8, 4207.0], [71.9, 4209.0], [72.0, 4211.0], [72.1, 4214.0], [72.2, 4220.0], [72.3, 4221.0], [72.4, 4223.0], [72.5, 4225.0], [72.6, 4229.0], [72.7, 4233.0], [72.8, 4235.0], [72.9, 4237.0], [73.0, 4239.0], [73.1, 4242.0], [73.2, 4244.0], [73.3, 4246.0], [73.4, 4249.0], [73.5, 4250.0], [73.6, 4251.0], [73.7, 4255.0], [73.8, 4256.0], [73.9, 4261.0], [74.0, 4263.0], [74.1, 4266.0], [74.2, 4270.0], [74.3, 4276.0], [74.4, 4277.0], [74.5, 4279.0], [74.6, 4281.0], [74.7, 4283.0], [74.8, 4283.0], [74.9, 4284.0], [75.0, 4284.0], [75.1, 4286.0], [75.2, 4290.0], [75.3, 4291.0], [75.4, 4293.0], [75.5, 4296.0], [75.6, 4299.0], [75.7, 4303.0], [75.8, 4307.0], [75.9, 4310.0], [76.0, 4312.0], [76.1, 4312.0], [76.2, 4315.0], [76.3, 4315.0], [76.4, 4316.0], [76.5, 4318.0], [76.6, 4319.0], [76.7, 4320.0], [76.8, 4322.0], [76.9, 4325.0], [77.0, 4326.0], [77.1, 4332.0], [77.2, 4334.0], [77.3, 4335.0], [77.4, 4345.0], [77.5, 4346.0], [77.6, 4348.0], [77.7, 4349.0], [77.8, 4349.0], [77.9, 4351.0], [78.0, 4353.0], [78.1, 4355.0], [78.2, 4359.0], [78.3, 4363.0], [78.4, 4367.0], [78.5, 4370.0], [78.6, 4375.0], [78.7, 4376.0], [78.8, 4378.0], [78.9, 4384.0], [79.0, 4386.0], [79.1, 4390.0], [79.2, 4392.0], [79.3, 4393.0], [79.4, 4398.0], [79.5, 4400.0], [79.6, 4400.0], [79.7, 4403.0], [79.8, 4405.0], [79.9, 4407.0], [80.0, 4410.0], [80.1, 4413.0], [80.2, 4414.0], [80.3, 4414.0], [80.4, 4415.0], [80.5, 4416.0], [80.6, 4418.0], [80.7, 4421.0], [80.8, 4421.0], [80.9, 4423.0], [81.0, 4426.0], [81.1, 4428.0], [81.2, 4431.0], [81.3, 4434.0], [81.4, 4436.0], [81.5, 4439.0], [81.6, 4439.0], [81.7, 4445.0], [81.8, 4448.0], [81.9, 4451.0], [82.0, 4451.0], [82.1, 4458.0], [82.2, 4460.0], [82.3, 4464.0], [82.4, 4466.0], [82.5, 4471.0], [82.6, 4471.0], [82.7, 4476.0], [82.8, 4481.0], [82.9, 4481.0], [83.0, 4483.0], [83.1, 4484.0], [83.2, 4487.0], [83.3, 4488.0], [83.4, 4492.0], [83.5, 4493.0], [83.6, 4500.0], [83.7, 4501.0], [83.8, 4502.0], [83.9, 4503.0], [84.0, 4506.0], [84.1, 4506.0], [84.2, 4519.0], [84.3, 4520.0], [84.4, 4523.0], [84.5, 4525.0], [84.6, 4530.0], [84.7, 4530.0], [84.8, 4538.0], [84.9, 4540.0], [85.0, 4542.0], [85.1, 4543.0], [85.2, 4549.0], [85.3, 4551.0], [85.4, 4555.0], [85.5, 4561.0], [85.6, 4563.0], [85.7, 4565.0], [85.8, 4569.0], [85.9, 4576.0], [86.0, 4577.0], [86.1, 4580.0], [86.2, 4581.0], [86.3, 4587.0], [86.4, 4594.0], [86.5, 4598.0], [86.6, 4598.0], [86.7, 4600.0], [86.8, 4604.0], [86.9, 4614.0], [87.0, 4617.0], [87.1, 4622.0], [87.2, 4625.0], [87.3, 4628.0], [87.4, 4630.0], [87.5, 4632.0], [87.6, 4640.0], [87.7, 4644.0], [87.8, 4647.0], [87.9, 4656.0], [88.0, 4665.0], [88.1, 4667.0], [88.2, 4669.0], [88.3, 4675.0], [88.4, 4678.0], [88.5, 4680.0], [88.6, 4681.0], [88.7, 4683.0], [88.8, 4686.0], [88.9, 4692.0], [89.0, 4692.0], [89.1, 4696.0], [89.2, 4697.0], [89.3, 4701.0], [89.4, 4708.0], [89.5, 4711.0], [89.6, 4716.0], [89.7, 4717.0], [89.8, 4719.0], [89.9, 4721.0], [90.0, 4725.0], [90.1, 4729.0], [90.2, 4730.0], [90.3, 4731.0], [90.4, 4732.0], [90.5, 4735.0], [90.6, 4738.0], [90.7, 4743.0], [90.8, 4745.0], [90.9, 4749.0], [91.0, 4757.0], [91.1, 4767.0], [91.2, 4771.0], [91.3, 4777.0], [91.4, 4783.0], [91.5, 4785.0], [91.6, 4789.0], [91.7, 4791.0], [91.8, 4797.0], [91.9, 4799.0], [92.0, 4801.0], [92.1, 4809.0], [92.2, 4814.0], [92.3, 4823.0], [92.4, 4831.0], [92.5, 4841.0], [92.6, 4860.0], [92.7, 4864.0], [92.8, 4877.0], [92.9, 4879.0], [93.0, 4885.0], [93.1, 4887.0], [93.2, 4891.0], [93.3, 4892.0], [93.4, 4895.0], [93.5, 4898.0], [93.6, 4902.0], [93.7, 4903.0], [93.8, 4905.0], [93.9, 4914.0], [94.0, 4916.0], [94.1, 4925.0], [94.2, 4931.0], [94.3, 4932.0], [94.4, 4941.0], [94.5, 4942.0], [94.6, 4957.0], [94.7, 4974.0], [94.8, 4977.0], [94.9, 4984.0], [95.0, 4995.0], [95.1, 4998.0], [95.2, 4999.0], [95.3, 5010.0], [95.4, 5031.0], [95.5, 5042.0], [95.6, 5053.0], [95.7, 5059.0], [95.8, 5059.0], [95.9, 5070.0], [96.0, 5077.0], [96.1, 5086.0], [96.2, 5091.0], [96.3, 5094.0], [96.4, 5105.0], [96.5, 5117.0], [96.6, 5121.0], [96.7, 5123.0], [96.8, 5134.0], [96.9, 5150.0], [97.0, 5153.0], [97.1, 5160.0], [97.2, 5168.0], [97.3, 5179.0], [97.4, 5190.0], [97.5, 5204.0], [97.6, 5205.0], [97.7, 5215.0], [97.8, 5225.0], [97.9, 5237.0], [98.0, 5255.0], [98.1, 5271.0], [98.2, 5289.0], [98.3, 5308.0], [98.4, 5310.0], [98.5, 5321.0], [98.6, 5345.0], [98.7, 5358.0], [98.8, 5392.0], [98.9, 5436.0], [99.0, 5446.0], [99.1, 5510.0], [99.2, 5528.0], [99.3, 5534.0], [99.4, 5550.0], [99.5, 5595.0], [99.6, 5647.0], [99.7, 5651.0], [99.8, 5698.0], [99.9, 5738.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 3.0, "minX": 100.0, "maxY": 82.0, "series": [{"data": [[600.0, 6.0], [700.0, 16.0], [800.0, 27.0], [900.0, 27.0], [1000.0, 24.0], [1100.0, 32.0], [1200.0, 33.0], [1300.0, 25.0], [1400.0, 33.0], [1500.0, 23.0], [1600.0, 25.0], [1700.0, 26.0], [1800.0, 36.0], [1900.0, 37.0], [2000.0, 36.0], [2100.0, 43.0], [2300.0, 35.0], [2200.0, 41.0], [2400.0, 52.0], [2500.0, 49.0], [2600.0, 41.0], [2700.0, 37.0], [2800.0, 37.0], [2900.0, 41.0], [3000.0, 52.0], [3100.0, 44.0], [3200.0, 37.0], [3300.0, 32.0], [3400.0, 43.0], [3500.0, 37.0], [3700.0, 53.0], [3600.0, 52.0], [3800.0, 56.0], [3900.0, 57.0], [4000.0, 64.0], [4100.0, 63.0], [4200.0, 81.0], [4300.0, 77.0], [4600.0, 52.0], [4400.0, 82.0], [4500.0, 62.0], [4800.0, 32.0], [4700.0, 53.0], [4900.0, 34.0], [5000.0, 23.0], [5100.0, 21.0], [5200.0, 16.0], [5300.0, 13.0], [5400.0, 4.0], [5500.0, 9.0], [5600.0, 6.0], [5700.0, 3.0], [100.0, 13.0], [200.0, 32.0], [300.0, 5.0], [400.0, 3.0], [500.0, 7.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 53.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1716.0, "series": [{"data": [[1.0, 231.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 53.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1716.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 572.2699999999999, "minX": 1.5495837E12, "maxY": 572.2699999999999, "series": [{"data": [[1.5495837E12, 572.2699999999999]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495837E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 187.0, "minX": 1.0, "maxY": 5738.0, "series": [{"data": [[3.0, 4385.0], [4.0, 4376.0], [5.0, 4616.5], [7.0, 4397.5], [8.0, 4349.0], [9.0, 4263.0], [10.0, 4244.0], [11.0, 4423.0], [12.0, 4284.0], [14.0, 4465.0], [15.0, 4403.0], [16.0, 4346.5], [17.0, 4669.0], [18.0, 4299.0], [20.0, 4402.5], [21.0, 4949.0], [23.0, 4644.5], [24.0, 4399.0], [26.0, 4455.5], [27.0, 4319.0], [28.0, 4192.0], [30.0, 4891.5], [31.0, 4315.0], [33.0, 2249.5], [32.0, 4675.0], [35.0, 798.25], [34.0, 744.6999999999999], [37.0, 2627.25], [39.0, 2265.0], [38.0, 204.5], [41.0, 1301.0], [40.0, 1707.3333333333333], [43.0, 1278.5], [42.0, 1047.4], [45.0, 1000.0], [44.0, 1222.5], [46.0, 1317.25], [47.0, 2222.0], [49.0, 187.0], [48.0, 2413.0], [51.0, 4187.0], [50.0, 4768.0], [53.0, 4706.0], [55.0, 4293.0], [54.0, 4587.0], [57.0, 4472.0], [59.0, 4744.0], [58.0, 4163.0], [61.0, 4857.0], [60.0, 4628.0], [63.0, 4577.0], [62.0, 4877.0], [67.0, 4781.0], [66.0, 4512.0], [64.0, 4157.0], [71.0, 5086.0], [70.0, 4464.0], [69.0, 4711.0], [68.0, 4239.0], [75.0, 4436.0], [74.0, 4319.0], [73.0, 4332.0], [72.0, 4367.0], [79.0, 4729.0], [78.0, 4127.0], [77.0, 4503.0], [76.0, 4165.0], [82.0, 4163.0], [81.0, 4902.0], [80.0, 4207.0], [87.0, 4710.0], [86.0, 4221.0], [85.0, 4698.5], [84.0, 4360.0], [91.0, 4500.0], [90.0, 4160.0], [89.0, 4348.0], [88.0, 4135.0], [95.0, 4513.0], [94.0, 4346.0], [93.0, 5117.0], [92.0, 4179.0], [99.0, 4282.0], [98.0, 4237.0], [97.0, 4345.0], [96.0, 4169.0], [102.0, 4376.0], [101.0, 4631.0], [100.0, 4190.0], [107.0, 4415.0], [106.0, 5250.0], [105.0, 4667.0], [104.0, 4980.5], [110.0, 4581.0], [109.0, 4263.0], [115.0, 4277.0], [114.0, 4893.0], [113.0, 4225.0], [112.0, 4682.0], [119.0, 4730.0], [118.0, 4172.0], [117.0, 4058.0], [116.0, 4414.0], [123.0, 4325.0], [122.0, 4090.0], [121.0, 4128.0], [120.0, 4445.0], [127.0, 4485.0], [126.0, 4519.0], [125.0, 4307.0], [124.0, 4357.0], [135.0, 4133.0], [134.0, 5694.0], [133.0, 4183.0], [132.0, 4286.0], [131.0, 4283.0], [130.0, 4433.0], [129.0, 4677.0], [128.0, 4196.0], [143.0, 4506.0], [142.0, 4519.0], [141.0, 4104.0], [140.0, 4169.0], [139.0, 4977.0], [138.0, 5273.0], [137.0, 4148.0], [136.0, 4087.0], [151.0, 5289.0], [150.0, 5203.0], [149.0, 4640.0], [148.0, 5369.0], [147.0, 5392.0], [146.0, 4723.0], [145.0, 4683.0], [144.0, 4538.0], [159.0, 4375.0], [158.0, 4063.0], [157.0, 5277.5], [155.0, 3992.0], [154.0, 4520.0], [153.0, 4649.0], [152.0, 4690.0], [167.0, 5705.0], [166.0, 4019.0], [165.0, 4767.0], [164.0, 4264.0], [163.0, 4349.0], [162.0, 5118.0], [161.0, 4594.0], [160.0, 4569.0], [175.0, 4474.0], [174.0, 5446.0], [173.0, 4390.0], [172.0, 4335.0], [171.0, 5077.0], [170.0, 4390.0], [169.0, 4434.0], [168.0, 4725.0], [183.0, 4627.0], [182.0, 4413.0], [181.0, 4549.0], [180.0, 4073.0], [179.0, 4166.0], [178.0, 4411.0], [177.0, 4203.0], [176.0, 4445.0], [191.0, 4153.0], [190.0, 4189.0], [189.0, 5106.0], [188.0, 5510.0], [187.0, 4678.0], [186.0, 4502.0], [185.0, 5631.0], [184.0, 4833.0], [199.0, 4427.0], [198.0, 4283.0], [197.0, 4227.0], [196.0, 4189.0], [195.0, 4801.0], [194.0, 4476.0], [193.0, 4450.0], [192.0, 4378.0], [207.0, 2037.0], [206.0, 1724.75], [205.0, 4284.0], [204.0, 4083.0], [203.0, 4159.0], [202.0, 4984.0], [201.0, 4268.0], [200.0, 4403.0], [211.0, 1751.0], [210.0, 2715.5], [214.0, 2748.0], [215.0, 4192.0], [213.0, 3877.0], [212.0, 4658.0], [209.0, 4732.0], [208.0, 4234.0], [217.0, 2689.5], [216.0, 2951.5], [218.0, 1751.0], [219.0, 2962.5], [222.0, 2664.5], [223.0, 4757.0], [221.0, 4229.0], [220.0, 4729.0], [225.0, 1775.25], [231.0, 4686.5], [229.0, 5010.0], [228.0, 4665.0], [227.0, 4270.0], [226.0, 4599.0], [224.0, 4738.0], [239.0, 4345.0], [237.0, 4250.0], [236.0, 5548.0], [235.0, 4121.5], [233.0, 4604.0], [232.0, 4735.0], [240.0, 3159.5], [244.0, 2656.0], [247.0, 5452.5], [245.0, 4335.0], [243.0, 4539.5], [241.0, 4501.0], [248.0, 1976.0], [249.0, 977.0], [255.0, 2052.666666666667], [254.0, 5019.5], [252.0, 4503.0], [251.0, 4878.0], [250.0, 4500.5], [271.0, 5315.0], [263.0, 2880.5], [262.0, 4717.0], [261.0, 4419.0], [260.0, 3880.0], [267.0, 2933.0], [270.0, 4572.0], [269.0, 4995.0], [268.0, 5255.0], [259.0, 5496.0], [258.0, 4931.0], [257.0, 5150.0], [256.0, 4083.0], [266.0, 4751.0], [265.0, 5525.0], [264.0, 4576.0], [285.0, 2149.333333333333], [275.0, 2940.5], [279.0, 2963.5], [272.0, 4791.0], [274.0, 4488.0], [273.0, 3932.0], [278.0, 5321.0], [277.0, 4197.0], [276.0, 5698.0], [283.0, 1825.25], [284.0, 2231.333333333333], [282.0, 1705.0], [286.0, 5335.0], [281.0, 4712.0], [280.0, 4931.0], [291.0, 2261.333333333333], [289.0, 3253.0], [290.0, 1527.2], [292.0, 1781.0], [293.0, 1888.75], [294.0, 1499.4], [295.0, 4048.0], [288.0, 5257.0], [296.0, 2912.0], [297.0, 2405.0], [299.0, 5190.0], [298.0, 4905.0], [300.0, 2462.0], [301.0, 5237.0], [302.0, 1010.0], [303.0, 4295.5], [316.0, 2572.5], [306.0, 2015.75], [307.0, 2090.25], [311.0, 2349.5], [305.0, 5563.0], [304.0, 4749.0], [310.0, 638.0], [309.0, 2172.0], [308.0, 5091.0], [312.0, 2577.666666666667], [315.0, 2551.333333333333], [314.0, 3933.0], [313.0, 3954.0], [318.0, 3190.5], [317.0, 4083.0], [319.0, 2989.0], [327.0, 1352.125], [323.0, 1833.6666666666667], [322.0, 4891.0], [321.0, 4398.0], [320.0, 4923.0], [324.0, 984.5], [325.0, 2495.8], [326.0, 1792.0], [329.0, 2777.0], [328.0, 2378.0], [331.0, 2922.0], [330.0, 4415.0], [333.0, 2601.5], [334.0, 1720.2], [335.0, 1919.6666666666667], [332.0, 3301.5], [339.0, 1937.8], [337.0, 1818.75], [336.0, 2170.333333333333], [338.0, 2010.5], [340.0, 2227.0], [342.0, 4310.0], [341.0, 4558.0], [343.0, 3262.0], [344.0, 3339.5], [345.0, 4902.0], [347.0, 4220.0], [346.0, 5225.0], [351.0, 4731.0], [350.0, 5122.0], [349.0, 3832.0], [348.0, 4647.0], [364.0, 3324.5], [352.0, 2504.5], [354.0, 2912.5], [353.0, 4334.0], [355.0, 5160.0], [358.0, 2825.5], [357.0, 4680.0], [356.0, 5234.0], [359.0, 4783.0], [362.0, 3091.5], [367.0, 3679.6666666666665], [365.0, 4087.0], [363.0, 4771.0], [361.0, 4745.0], [360.0, 4062.0], [382.0, 4789.0], [375.0, 2191.0], [370.0, 3567.6666666666665], [368.0, 5528.0], [371.0, 5128.0], [374.0, 2857.0], [373.0, 4393.0], [372.0, 4312.0], [383.0, 4997.0], [377.0, 3746.0], [376.0, 4242.0], [381.0, 4240.0], [380.0, 4293.0], [379.0, 5059.0], [378.0, 5647.0], [398.0, 4942.0], [386.0, 2781.0], [385.0, 2117.333333333333], [384.0, 4368.0], [387.0, 1058.5], [388.0, 3479.333333333333], [390.0, 4999.0], [389.0, 3747.0], [391.0, 2562.5], [399.0, 5159.0], [393.0, 4907.0], [392.0, 4630.0], [395.0, 3835.0], [394.0, 5153.0], [397.0, 5189.0], [396.0, 4330.0], [402.0, 3045.0], [404.0, 1136.5], [405.0, 3113.0], [407.0, 2652.0], [401.0, 4435.0], [400.0, 4502.0], [406.0, 4352.0], [408.0, 2990.5], [409.0, 2707.0], [411.0, 4598.0], [410.0, 4692.0], [415.0, 2238.0], [414.0, 4561.0], [413.0, 4736.0], [412.0, 4487.0], [403.0, 5121.0], [429.0, 2526.5], [424.0, 1059.0], [420.0, 2583.5], [422.0, 3887.0], [421.0, 3903.0], [425.0, 3598.6666666666665], [431.0, 4010.0], [430.0, 4041.0], [428.0, 4538.0], [419.0, 3759.0], [418.0, 5738.0], [417.0, 4287.0], [416.0, 4699.0], [423.0, 4697.0], [427.0, 3923.0], [426.0, 4577.0], [444.0, 2305.0], [434.0, 2977.5], [433.0, 2579.5], [439.0, 4079.0], [432.0, 3489.0], [435.0, 2027.3333333333335], [438.0, 2751.5], [437.0, 3482.0], [440.0, 2251.0], [443.0, 2802.5], [442.0, 5059.0], [441.0, 4097.0], [446.0, 2318.3333333333335], [445.0, 4831.0], [447.0, 4785.0], [450.0, 3111.0], [455.0, 2957.0], [449.0, 4731.0], [448.0, 4721.0], [454.0, 4235.0], [453.0, 3705.0], [452.0, 4614.0], [459.0, 3600.3333333333335], [462.0, 3194.5], [463.0, 4523.0], [461.0, 3908.0], [460.0, 4790.0], [451.0, 3235.0], [457.0, 4325.0], [456.0, 4625.0], [478.0, 2542.6666666666665], [465.0, 3133.5], [467.0, 2907.5], [466.0, 4032.0], [477.0, 4681.0], [476.0, 3349.0], [469.0, 2172.0], [468.0, 4801.0], [470.0, 1972.3333333333335], [471.0, 3418.0], [464.0, 4315.0], [475.0, 2635.0], [474.0, 2832.5], [479.0, 1936.75], [473.0, 4414.0], [472.0, 5173.0], [494.0, 4414.0], [481.0, 3110.0], [480.0, 2708.0], [482.0, 2995.0], [487.0, 2533.5], [486.0, 4158.0], [485.0, 4745.0], [484.0, 4338.0], [495.0, 2176.3333333333335], [489.0, 4075.0], [488.0, 4600.0], [493.0, 4929.5], [483.0, 5094.0], [491.0, 4681.0], [490.0, 3995.0], [511.0, 4483.0], [498.0, 2646.0], [496.0, 2602.0], [497.0, 4421.0], [504.0, 2789.0], [505.0, 3955.0], [503.0, 2697.25], [502.0, 4669.0], [501.0, 3455.0], [500.0, 4717.0], [510.0, 4733.0], [509.0, 4219.0], [508.0, 4417.0], [499.0, 3835.0], [507.0, 4256.0], [506.0, 4439.0], [541.0, 3679.5], [519.0, 2371.0], [516.0, 2445.6666666666665], [515.0, 3164.0], [526.0, 4841.0], [513.0, 4529.0], [512.0, 4185.0], [514.0, 3085.0], [518.0, 2474.333333333333], [517.0, 3624.0], [523.0, 2995.0], [522.0, 3817.0], [521.0, 4916.0], [520.0, 3598.0], [524.0, 4882.0], [525.0, 2931.0], [529.0, 2318.6666666666665], [528.0, 3947.5], [531.0, 4721.0], [530.0, 3690.0], [533.0, 4141.0], [532.0, 3095.0], [535.0, 3957.0], [534.0, 4770.0], [540.0, 3665.0], [539.0, 3996.0], [538.0, 4483.0], [537.0, 4680.0], [536.0, 3980.0], [542.0, 4146.0], [543.0, 2726.5], [550.0, 3190.5], [570.0, 2749.0], [544.0, 2624.5], [549.0, 4047.0], [548.0, 4363.0], [547.0, 3920.0], [546.0, 4494.0], [545.0, 4492.0], [551.0, 5595.0], [569.0, 3343.0], [568.0, 4155.0], [552.0, 2292.0], [553.0, 4421.5], [554.0, 2552.0], [559.0, 3446.0], [558.0, 3912.0], [557.0, 5088.0], [556.0, 4743.0], [555.0, 3645.0], [563.0, 2984.5], [566.0, 3526.6666666666665], [564.0, 4974.0], [567.0, 3882.0], [572.0, 2351.75], [573.0, 2837.0], [574.0, 2775.0], [575.0, 2555.3333333333335], [562.0, 4119.5], [560.0, 3623.0], [571.0, 2224.666666666667], [583.0, 2640.2], [589.0, 2919.5], [577.0, 3080.5], [576.0, 3896.0], [578.0, 2709.5], [593.0, 2502.0], [607.0, 4033.0], [592.0, 4296.0], [600.0, 2037.0], [601.0, 4099.0], [603.0, 4100.0], [602.0, 3828.0], [605.0, 2889.5], [604.0, 3364.0], [606.0, 2440.0], [595.0, 3021.3333333333335], [597.0, 3360.3333333333335], [598.0, 2884.5], [599.0, 3741.0], [596.0, 2654.0], [594.0, 2742.75], [582.0, 1604.0], [581.0, 3539.0], [580.0, 4377.0], [579.0, 4936.0], [585.0, 2508.0], [584.0, 2692.3333333333335], [588.0, 2507.3333333333335], [587.0, 4378.0], [586.0, 4423.0], [590.0, 2109.5], [591.0, 3175.5], [633.0, 3568.5], [621.0, 2972.0], [609.0, 2530.0], [616.0, 1592.6666666666667], [617.0, 4652.5], [615.0, 3163.5], [614.0, 4312.0], [613.0, 3631.0], [612.0, 4078.0], [611.0, 4632.0], [610.0, 4885.0], [632.0, 4493.0], [634.0, 2681.3333333333335], [635.0, 3456.5], [637.0, 2527.0], [636.0, 3244.0], [639.0, 3049.6], [638.0, 4162.0], [618.0, 2778.4], [619.0, 2213.2], [620.0, 4407.0], [623.0, 2433.75], [608.0, 3462.0], [622.0, 2394.5], [624.0, 2800.0], [625.0, 2922.5], [626.0, 2770.5], [627.0, 2282.6666666666665], [629.0, 2293.25], [631.0, 3599.0], [630.0, 4742.0], [628.0, 2612.0], [643.0, 2269.0], [641.0, 2678.4], [640.0, 2493.0], [655.0, 2560.3333333333335], [654.0, 3103.6666666666665], [652.0, 2136.0], [653.0, 3270.0], [650.0, 3340.0], [651.0, 3120.5], [642.0, 2693.6666666666665], [644.0, 2401.6666666666665], [645.0, 2645.3333333333335], [646.0, 2277.0], [648.0, 2147.3333333333335], [649.0, 3474.0], [647.0, 2645.6666666666665], [656.0, 2249.5], [657.0, 3051.0], [671.0, 2523.0], [670.0, 2878.6], [667.0, 3164.5], [666.0, 4489.0], [665.0, 4316.0], [664.0, 2921.0], [668.0, 2805.6666666666665], [669.0, 3060.0], [658.0, 3278.0], [661.0, 3189.8], [660.0, 3914.0], [659.0, 4246.0], [662.0, 2559.6153846153848], [663.0, 2732.5], [698.0, 2958.5], [673.0, 2567.25], [672.0, 2660.75], [674.0, 2572.1666666666665], [675.0, 3705.5], [688.0, 2643.714285714286], [703.0, 3160.5], [701.0, 2594.75], [702.0, 2579.125], [699.0, 2532.5], [700.0, 2772.375], [697.0, 2412.75], [696.0, 3293.3333333333335], [679.0, 4506.0], [678.0, 3188.0], [677.0, 4018.0], [676.0, 4096.0], [689.0, 2845.6666666666665], [690.0, 3242.0], [692.0, 3333.0], [691.0, 3943.0], [694.0, 3564.0], [695.0, 2661.3333333333335], [693.0, 2221.5], [687.0, 2827.5], [686.0, 2375.0], [685.0, 2656.4], [684.0, 2967.5], [683.0, 4131.0], [682.0, 3949.0], [681.0, 4076.0], [680.0, 5204.0], [711.0, 3120.3333333333335], [718.0, 2402.5], [708.0, 2963.6666666666665], [707.0, 2428.0], [719.0, 2688.9999999999995], [705.0, 3897.0], [704.0, 3696.0], [706.0, 3998.0], [709.0, 2801.2], [710.0, 4116.0], [722.0, 2398.272727272727], [724.0, 2557.625], [723.0, 2689.5714285714284], [725.0, 3367.25], [727.0, 3033.3333333333335], [726.0, 3026.0], [721.0, 2729.75], [720.0, 2552.5], [729.0, 2700.0], [732.0, 3525.0], [731.0, 3202.0], [730.0, 3352.5], [733.0, 2884.6], [734.0, 3381.0], [735.0, 2994.5], [728.0, 3990.5], [712.0, 3244.3333333333335], [714.0, 3441.0], [713.0, 2362.0], [716.0, 2924.0], [715.0, 5053.0], [717.0, 3131.3333333333335], [743.0, 2694.5], [739.0, 3022.666666666667], [736.0, 2336.5], [751.0, 3989.0], [750.0, 3642.0], [737.0, 2113.75], [738.0, 3292.3333333333335], [741.0, 2633.4444444444443], [742.0, 2758.6666666666665], [740.0, 2959.0], [744.0, 3172.6666666666665], [746.0, 3555.0], [745.0, 3985.0], [748.0, 3771.0], [747.0, 4251.0], [749.0, 3015.3333333333335], [752.0, 2805.6], [766.0, 3719.5], [765.0, 4448.0], [764.0, 4348.0], [763.0, 3793.0], [767.0, 2525.0], [760.0, 3256.0], [761.0, 2839.75], [762.0, 3412.5], [753.0, 3134.75], [755.0, 2551.0], [754.0, 4400.0], [757.0, 3670.0], [756.0, 4243.0], [759.0, 3762.0], [758.0, 4070.0], [774.0, 3228.5], [770.0, 3016.0], [768.0, 3045.5], [769.0, 3941.0], [783.0, 3843.0], [772.0, 3230.6], [771.0, 2891.3333333333335], [773.0, 2897.0], [787.0, 3026.0], [789.0, 2855.6666666666665], [791.0, 2866.6666666666665], [790.0, 3340.5], [788.0, 3162.0], [786.0, 3122.5], [785.0, 3794.0], [784.0, 4045.0], [799.0, 2352.833333333333], [798.0, 4814.0], [796.0, 3160.6666666666665], [797.0, 3136.5], [794.0, 3037.0], [795.0, 2783.75], [793.0, 2703.75], [792.0, 2712.5], [775.0, 3552.0], [778.0, 2831.0], [777.0, 4798.0], [776.0, 3402.0], [779.0, 3035.25], [781.0, 2725.428571428571], [780.0, 3072.1666666666665], [782.0, 3036.0], [827.0, 2596.0], [813.0, 2932.8333333333335], [801.0, 2480.3333333333335], [800.0, 3664.0], [802.0, 3987.0], [803.0, 2955.0], [806.0, 3839.5], [805.0, 3948.0], [804.0, 3741.0], [824.0, 4484.0], [807.0, 2855.0], [826.0, 3249.5], [825.0, 3051.0], [828.0, 3475.5], [829.0, 3656.0], [831.0, 3296.0], [817.0, 3940.0], [816.0, 4121.0], [830.0, 2655.6666666666665], [818.0, 3139.5], [819.0, 2730.0], [820.0, 3429.5], [822.0, 3300.3333333333335], [823.0, 3505.0], [821.0, 3040.3333333333335], [808.0, 4287.5], [809.0, 4348.0], [810.0, 3467.5], [812.0, 2509.0], [814.0, 2560.6], [815.0, 3589.0], [811.0, 3473.3333333333335], [859.0, 3082.0], [833.0, 3539.5], [832.0, 2655.6666666666665], [835.0, 3488.5], [834.0, 3904.0], [837.0, 3896.0], [836.0, 3893.0], [839.0, 3518.0], [856.0, 3628.0], [858.0, 3516.0], [857.0, 3558.0], [862.0, 3460.8], [863.0, 2978.3333333333335], [848.0, 3687.0], [861.0, 2794.0], [860.0, 3714.0], [838.0, 2976.25], [844.0, 3282.3333333333335], [843.0, 2830.5], [842.0, 4001.0], [841.0, 3423.0], [840.0, 3646.0], [846.0, 3323.5], [845.0, 3785.0], [847.0, 4266.0], [849.0, 3107.3333333333335], [850.0, 3239.4], [851.0, 3438.6666666666665], [854.0, 2692.5], [855.0, 4099.5], [853.0, 3600.0], [852.0, 4410.0], [870.0, 3085.0], [866.0, 3135.5], [868.0, 2892.0], [869.0, 2824.0], [867.0, 4028.6666666666665], [871.0, 2912.0], [888.0, 4436.0], [889.0, 3425.5], [890.0, 2903.3333333333335], [892.0, 2867.3333333333335], [891.0, 3759.0], [894.0, 2587.8571428571427], [895.0, 2790.285714285714], [880.0, 3277.5], [893.0, 3122.3333333333335], [882.0, 3089.0], [881.0, 3204.571428571429], [883.0, 2852.4444444444443], [884.0, 3053.8], [885.0, 3587.0], [887.0, 3209.3333333333335], [886.0, 3102.5], [872.0, 3428.5], [873.0, 3195.3333333333335], [875.0, 2762.6], [876.0, 3431.0], [878.0, 2819.25], [865.0, 3641.0], [864.0, 3449.0], [877.0, 2900.0], [874.0, 2883.0], [920.0, 3442.3333333333335], [897.0, 2531.0], [896.0, 3515.5], [911.0, 4349.0], [899.0, 3468.3333333333335], [898.0, 3329.5], [902.0, 2735.0], [903.0, 2849.0], [921.0, 3799.0], [922.0, 3143.0], [924.0, 2952.5], [925.0, 3173.6666666666665], [927.0, 3966.0], [926.0, 3811.0], [923.0, 3000.5], [912.0, 2985.6666666666665], [918.0, 2970.0], [919.0, 3320.5], [917.0, 3139.3333333333335], [916.0, 3955.0], [915.0, 3605.0], [914.0, 4542.0], [913.0, 3744.0], [901.0, 3750.0], [900.0, 3654.0], [904.0, 3264.5], [905.0, 3410.0], [908.0, 3278.25], [906.0, 3772.0], [909.0, 4245.0], [910.0, 3088.0], [935.0, 3372.5], [931.0, 3487.0], [928.0, 3388.0], [943.0, 3194.0], [929.0, 3011.0], [930.0, 3221.0], [932.0, 3050.6666666666665], [933.0, 2757.2], [934.0, 2885.5], [947.0, 3125.5], [946.0, 3989.0], [945.0, 4172.0], [944.0, 3134.0], [948.0, 3035.0], [959.0, 3154.5], [958.0, 3883.0], [957.0, 3428.0], [956.0, 3096.0], [954.0, 2945.8], [955.0, 3266.75], [953.0, 3128.3333333333335], [952.0, 3676.3333333333335], [949.0, 3135.5], [951.0, 2574.0], [950.0, 3159.5], [937.0, 2976.3333333333335], [936.0, 3674.0], [939.0, 4451.0], [938.0, 3063.0], [941.0, 3116.0], [940.0, 4295.0], [942.0, 3299.5], [965.0, 3397.6666666666665], [961.0, 3427.6666666666665], [960.0, 3339.25], [974.0, 3895.0], [973.0, 2892.0], [972.0, 3358.0], [971.0, 3342.0], [962.0, 3013.75], [964.0, 2990.714285714286], [963.0, 3369.6666666666665], [966.0, 3192.25], [984.0, 3433.0], [967.0, 4098.0], [986.0, 3347.0], [985.0, 3147.0], [988.0, 3340.0], [987.0, 4157.0], [991.0, 3412.0], [977.0, 3917.0], [976.0, 3486.0], [979.0, 3772.0], [978.0, 3814.0], [981.0, 3602.0], [980.0, 4318.0], [983.0, 3723.0], [982.0, 3300.0], [990.0, 3464.5], [970.0, 3149.8], [969.0, 2791.0], [968.0, 3528.6666666666665], [1016.0, 3653.0], [1020.0, 3653.0], [1021.0, 3962.0], [1009.0, 3610.0], [1008.0, 4029.0], [1011.0, 3635.0], [1010.0, 4126.0], [1019.0, 3731.0], [1018.0, 3779.0], [1017.0, 4209.0], [1007.0, 4492.0], [992.0, 4016.0], [994.0, 2905.0], [993.0, 3884.0], [997.0, 3911.0], [995.0, 3423.0], [999.0, 3373.0], [998.0, 3413.0], [1006.0, 3833.0], [1005.0, 2979.0], [1004.0, 3670.0], [1003.0, 4540.0], [1002.0, 3094.0], [1001.0, 3488.0], [1015.0, 3863.0], [1014.0, 3265.0], [1013.0, 2991.0], [1012.0, 4079.0], [1.0, 4596.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[572.2699999999999, 3177.2425000000035]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1021.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.5495837E12, "maxY": 13998.116666666667, "series": [{"data": [[1.5495837E12, 13998.116666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495837E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495837E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3177.2425000000035, "minX": 1.5495837E12, "maxY": 3177.2425000000035, "series": [{"data": [[1.5495837E12, 3177.2425000000035]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495837E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3177.2330000000034, "minX": 1.5495837E12, "maxY": 3177.2330000000034, "series": [{"data": [[1.5495837E12, 3177.2330000000034]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495837E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 52.83300000000012, "minX": 1.5495837E12, "maxY": 52.83300000000012, "series": [{"data": [[1.5495837E12, 52.83300000000012]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495837E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 130.0, "minX": 1.5495837E12, "maxY": 5745.0, "series": [{"data": [[1.5495837E12, 5745.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495837E12, 130.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495837E12, 4724.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495837E12, 5445.92]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495837E12, 4995.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495837E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3373.0, "minX": 33.0, "maxY": 3373.0, "series": [{"data": [[33.0, 3373.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3373.0, "minX": 33.0, "maxY": 3373.0, "series": [{"data": [[33.0, 3373.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
