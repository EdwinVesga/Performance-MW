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
        data: {"result": {"minY": 137.0, "minX": 0.0, "maxY": 5935.0, "series": [{"data": [[0.0, 137.0], [0.1, 171.0], [0.2, 189.0], [0.3, 197.0], [0.4, 207.0], [0.5, 209.0], [0.6, 210.0], [0.7, 212.0], [0.8, 216.0], [0.9, 217.0], [1.0, 225.0], [1.1, 229.0], [1.2, 235.0], [1.3, 240.0], [1.4, 242.0], [1.5, 247.0], [1.6, 252.0], [1.7, 254.0], [1.8, 254.0], [1.9, 255.0], [2.0, 258.0], [2.1, 262.0], [2.2, 263.0], [2.3, 264.0], [2.4, 267.0], [2.5, 270.0], [2.6, 270.0], [2.7, 275.0], [2.8, 277.0], [2.9, 279.0], [3.0, 280.0], [3.1, 285.0], [3.2, 288.0], [3.3, 289.0], [3.4, 290.0], [3.5, 291.0], [3.6, 291.0], [3.7, 294.0], [3.8, 295.0], [3.9, 296.0], [4.0, 301.0], [4.1, 302.0], [4.2, 305.0], [4.3, 308.0], [4.4, 315.0], [4.5, 319.0], [4.6, 324.0], [4.7, 325.0], [4.8, 325.0], [4.9, 328.0], [5.0, 333.0], [5.1, 337.0], [5.2, 342.0], [5.3, 343.0], [5.4, 345.0], [5.5, 345.0], [5.6, 347.0], [5.7, 348.0], [5.8, 351.0], [5.9, 353.0], [6.0, 355.0], [6.1, 356.0], [6.2, 360.0], [6.3, 362.0], [6.4, 367.0], [6.5, 371.0], [6.6, 373.0], [6.7, 374.0], [6.8, 375.0], [6.9, 377.0], [7.0, 378.0], [7.1, 380.0], [7.2, 381.0], [7.3, 386.0], [7.4, 388.0], [7.5, 393.0], [7.6, 397.0], [7.7, 400.0], [7.8, 401.0], [7.9, 402.0], [8.0, 404.0], [8.1, 406.0], [8.2, 406.0], [8.3, 410.0], [8.4, 410.0], [8.5, 413.0], [8.6, 419.0], [8.7, 422.0], [8.8, 428.0], [8.9, 428.0], [9.0, 431.0], [9.1, 440.0], [9.2, 447.0], [9.3, 453.0], [9.4, 457.0], [9.5, 458.0], [9.6, 465.0], [9.7, 466.0], [9.8, 473.0], [9.9, 477.0], [10.0, 483.0], [10.1, 490.0], [10.2, 495.0], [10.3, 498.0], [10.4, 503.0], [10.5, 505.0], [10.6, 522.0], [10.7, 531.0], [10.8, 546.0], [10.9, 555.0], [11.0, 564.0], [11.1, 597.0], [11.2, 618.0], [11.3, 686.0], [11.4, 746.0], [11.5, 789.0], [11.6, 910.0], [11.7, 921.0], [11.8, 1005.0], [11.9, 1032.0], [12.0, 1037.0], [12.1, 1039.0], [12.2, 1040.0], [12.3, 1052.0], [12.4, 1072.0], [12.5, 1083.0], [12.6, 1084.0], [12.7, 1088.0], [12.8, 1091.0], [12.9, 1096.0], [13.0, 1110.0], [13.1, 1123.0], [13.2, 1127.0], [13.3, 1145.0], [13.4, 1150.0], [13.5, 1162.0], [13.6, 1162.0], [13.7, 1168.0], [13.8, 1171.0], [13.9, 1173.0], [14.0, 1175.0], [14.1, 1187.0], [14.2, 1198.0], [14.3, 1207.0], [14.4, 1210.0], [14.5, 1219.0], [14.6, 1227.0], [14.7, 1232.0], [14.8, 1246.0], [14.9, 1251.0], [15.0, 1256.0], [15.1, 1265.0], [15.2, 1268.0], [15.3, 1271.0], [15.4, 1280.0], [15.5, 1287.0], [15.6, 1290.0], [15.7, 1301.0], [15.8, 1307.0], [15.9, 1313.0], [16.0, 1315.0], [16.1, 1328.0], [16.2, 1331.0], [16.3, 1333.0], [16.4, 1337.0], [16.5, 1338.0], [16.6, 1342.0], [16.7, 1344.0], [16.8, 1356.0], [16.9, 1362.0], [17.0, 1368.0], [17.1, 1382.0], [17.2, 1386.0], [17.3, 1394.0], [17.4, 1397.0], [17.5, 1404.0], [17.6, 1407.0], [17.7, 1417.0], [17.8, 1421.0], [17.9, 1433.0], [18.0, 1436.0], [18.1, 1445.0], [18.2, 1452.0], [18.3, 1457.0], [18.4, 1466.0], [18.5, 1468.0], [18.6, 1485.0], [18.7, 1497.0], [18.8, 1500.0], [18.9, 1514.0], [19.0, 1522.0], [19.1, 1532.0], [19.2, 1532.0], [19.3, 1536.0], [19.4, 1543.0], [19.5, 1546.0], [19.6, 1550.0], [19.7, 1560.0], [19.8, 1567.0], [19.9, 1572.0], [20.0, 1576.0], [20.1, 1590.0], [20.2, 1593.0], [20.3, 1595.0], [20.4, 1604.0], [20.5, 1608.0], [20.6, 1621.0], [20.7, 1628.0], [20.8, 1641.0], [20.9, 1648.0], [21.0, 1668.0], [21.1, 1668.0], [21.2, 1674.0], [21.3, 1686.0], [21.4, 1690.0], [21.5, 1700.0], [21.6, 1708.0], [21.7, 1709.0], [21.8, 1714.0], [21.9, 1719.0], [22.0, 1728.0], [22.1, 1738.0], [22.2, 1742.0], [22.3, 1749.0], [22.4, 1754.0], [22.5, 1754.0], [22.6, 1762.0], [22.7, 1767.0], [22.8, 1773.0], [22.9, 1774.0], [23.0, 1777.0], [23.1, 1782.0], [23.2, 1789.0], [23.3, 1795.0], [23.4, 1798.0], [23.5, 1806.0], [23.6, 1818.0], [23.7, 1820.0], [23.8, 1821.0], [23.9, 1827.0], [24.0, 1831.0], [24.1, 1837.0], [24.2, 1843.0], [24.3, 1844.0], [24.4, 1856.0], [24.5, 1861.0], [24.6, 1868.0], [24.7, 1872.0], [24.8, 1879.0], [24.9, 1882.0], [25.0, 1890.0], [25.1, 1898.0], [25.2, 1900.0], [25.3, 1905.0], [25.4, 1908.0], [25.5, 1913.0], [25.6, 1919.0], [25.7, 1928.0], [25.8, 1939.0], [25.9, 1942.0], [26.0, 1946.0], [26.1, 1951.0], [26.2, 1959.0], [26.3, 1962.0], [26.4, 1967.0], [26.5, 1970.0], [26.6, 1972.0], [26.7, 1972.0], [26.8, 1976.0], [26.9, 1982.0], [27.0, 1986.0], [27.1, 1989.0], [27.2, 1996.0], [27.3, 2005.0], [27.4, 2008.0], [27.5, 2027.0], [27.6, 2030.0], [27.7, 2035.0], [27.8, 2042.0], [27.9, 2046.0], [28.0, 2050.0], [28.1, 2055.0], [28.2, 2061.0], [28.3, 2062.0], [28.4, 2064.0], [28.5, 2071.0], [28.6, 2073.0], [28.7, 2078.0], [28.8, 2080.0], [28.9, 2083.0], [29.0, 2084.0], [29.1, 2085.0], [29.2, 2086.0], [29.3, 2098.0], [29.4, 2100.0], [29.5, 2104.0], [29.6, 2108.0], [29.7, 2110.0], [29.8, 2113.0], [29.9, 2116.0], [30.0, 2119.0], [30.1, 2122.0], [30.2, 2125.0], [30.3, 2128.0], [30.4, 2134.0], [30.5, 2136.0], [30.6, 2142.0], [30.7, 2149.0], [30.8, 2153.0], [30.9, 2157.0], [31.0, 2158.0], [31.1, 2162.0], [31.2, 2170.0], [31.3, 2178.0], [31.4, 2180.0], [31.5, 2181.0], [31.6, 2184.0], [31.7, 2184.0], [31.8, 2189.0], [31.9, 2193.0], [32.0, 2201.0], [32.1, 2221.0], [32.2, 2242.0], [32.3, 2252.0], [32.4, 2254.0], [32.5, 2265.0], [32.6, 2268.0], [32.7, 2273.0], [32.8, 2278.0], [32.9, 2282.0], [33.0, 2287.0], [33.1, 2289.0], [33.2, 2292.0], [33.3, 2294.0], [33.4, 2298.0], [33.5, 2303.0], [33.6, 2308.0], [33.7, 2311.0], [33.8, 2315.0], [33.9, 2319.0], [34.0, 2330.0], [34.1, 2339.0], [34.2, 2345.0], [34.3, 2353.0], [34.4, 2353.0], [34.5, 2358.0], [34.6, 2364.0], [34.7, 2368.0], [34.8, 2373.0], [34.9, 2377.0], [35.0, 2382.0], [35.1, 2387.0], [35.2, 2387.0], [35.3, 2391.0], [35.4, 2394.0], [35.5, 2395.0], [35.6, 2397.0], [35.7, 2398.0], [35.8, 2404.0], [35.9, 2417.0], [36.0, 2419.0], [36.1, 2431.0], [36.2, 2432.0], [36.3, 2435.0], [36.4, 2436.0], [36.5, 2436.0], [36.6, 2442.0], [36.7, 2448.0], [36.8, 2453.0], [36.9, 2460.0], [37.0, 2466.0], [37.1, 2471.0], [37.2, 2476.0], [37.3, 2487.0], [37.4, 2492.0], [37.5, 2496.0], [37.6, 2505.0], [37.7, 2509.0], [37.8, 2512.0], [37.9, 2513.0], [38.0, 2518.0], [38.1, 2528.0], [38.2, 2529.0], [38.3, 2533.0], [38.4, 2536.0], [38.5, 2538.0], [38.6, 2544.0], [38.7, 2547.0], [38.8, 2548.0], [38.9, 2553.0], [39.0, 2558.0], [39.1, 2561.0], [39.2, 2561.0], [39.3, 2565.0], [39.4, 2566.0], [39.5, 2567.0], [39.6, 2575.0], [39.7, 2576.0], [39.8, 2578.0], [39.9, 2579.0], [40.0, 2583.0], [40.1, 2593.0], [40.2, 2602.0], [40.3, 2604.0], [40.4, 2608.0], [40.5, 2625.0], [40.6, 2627.0], [40.7, 2630.0], [40.8, 2637.0], [40.9, 2639.0], [41.0, 2644.0], [41.1, 2652.0], [41.2, 2655.0], [41.3, 2655.0], [41.4, 2663.0], [41.5, 2668.0], [41.6, 2680.0], [41.7, 2684.0], [41.8, 2687.0], [41.9, 2689.0], [42.0, 2690.0], [42.1, 2692.0], [42.2, 2696.0], [42.3, 2697.0], [42.4, 2703.0], [42.5, 2706.0], [42.6, 2717.0], [42.7, 2722.0], [42.8, 2727.0], [42.9, 2737.0], [43.0, 2740.0], [43.1, 2748.0], [43.2, 2754.0], [43.3, 2756.0], [43.4, 2762.0], [43.5, 2763.0], [43.6, 2767.0], [43.7, 2776.0], [43.8, 2781.0], [43.9, 2783.0], [44.0, 2790.0], [44.1, 2791.0], [44.2, 2796.0], [44.3, 2809.0], [44.4, 2811.0], [44.5, 2812.0], [44.6, 2816.0], [44.7, 2819.0], [44.8, 2821.0], [44.9, 2825.0], [45.0, 2829.0], [45.1, 2834.0], [45.2, 2840.0], [45.3, 2845.0], [45.4, 2847.0], [45.5, 2848.0], [45.6, 2858.0], [45.7, 2862.0], [45.8, 2873.0], [45.9, 2876.0], [46.0, 2879.0], [46.1, 2880.0], [46.2, 2890.0], [46.3, 2891.0], [46.4, 2892.0], [46.5, 2895.0], [46.6, 2906.0], [46.7, 2910.0], [46.8, 2911.0], [46.9, 2912.0], [47.0, 2914.0], [47.1, 2916.0], [47.2, 2922.0], [47.3, 2924.0], [47.4, 2927.0], [47.5, 2932.0], [47.6, 2938.0], [47.7, 2940.0], [47.8, 2940.0], [47.9, 2943.0], [48.0, 2946.0], [48.1, 2952.0], [48.2, 2958.0], [48.3, 2959.0], [48.4, 2961.0], [48.5, 2967.0], [48.6, 2968.0], [48.7, 2973.0], [48.8, 2974.0], [48.9, 2977.0], [49.0, 2978.0], [49.1, 2994.0], [49.2, 2995.0], [49.3, 2997.0], [49.4, 3005.0], [49.5, 3009.0], [49.6, 3010.0], [49.7, 3013.0], [49.8, 3020.0], [49.9, 3023.0], [50.0, 3023.0], [50.1, 3025.0], [50.2, 3030.0], [50.3, 3035.0], [50.4, 3039.0], [50.5, 3043.0], [50.6, 3050.0], [50.7, 3063.0], [50.8, 3065.0], [50.9, 3065.0], [51.0, 3070.0], [51.1, 3076.0], [51.2, 3078.0], [51.3, 3081.0], [51.4, 3089.0], [51.5, 3094.0], [51.6, 3101.0], [51.7, 3102.0], [51.8, 3105.0], [51.9, 3110.0], [52.0, 3116.0], [52.1, 3119.0], [52.2, 3124.0], [52.3, 3125.0], [52.4, 3133.0], [52.5, 3138.0], [52.6, 3141.0], [52.7, 3149.0], [52.8, 3160.0], [52.9, 3161.0], [53.0, 3167.0], [53.1, 3169.0], [53.2, 3176.0], [53.3, 3183.0], [53.4, 3190.0], [53.5, 3196.0], [53.6, 3201.0], [53.7, 3202.0], [53.8, 3205.0], [53.9, 3207.0], [54.0, 3210.0], [54.1, 3224.0], [54.2, 3227.0], [54.3, 3235.0], [54.4, 3244.0], [54.5, 3246.0], [54.6, 3249.0], [54.7, 3255.0], [54.8, 3256.0], [54.9, 3258.0], [55.0, 3270.0], [55.1, 3274.0], [55.2, 3275.0], [55.3, 3281.0], [55.4, 3283.0], [55.5, 3287.0], [55.6, 3297.0], [55.7, 3305.0], [55.8, 3314.0], [55.9, 3320.0], [56.0, 3329.0], [56.1, 3337.0], [56.2, 3340.0], [56.3, 3346.0], [56.4, 3348.0], [56.5, 3349.0], [56.6, 3350.0], [56.7, 3353.0], [56.8, 3357.0], [56.9, 3360.0], [57.0, 3361.0], [57.1, 3369.0], [57.2, 3377.0], [57.3, 3394.0], [57.4, 3396.0], [57.5, 3400.0], [57.6, 3412.0], [57.7, 3416.0], [57.8, 3424.0], [57.9, 3434.0], [58.0, 3437.0], [58.1, 3445.0], [58.2, 3457.0], [58.3, 3472.0], [58.4, 3476.0], [58.5, 3490.0], [58.6, 3492.0], [58.7, 3494.0], [58.8, 3494.0], [58.9, 3495.0], [59.0, 3501.0], [59.1, 3504.0], [59.2, 3510.0], [59.3, 3518.0], [59.4, 3519.0], [59.5, 3523.0], [59.6, 3526.0], [59.7, 3529.0], [59.8, 3536.0], [59.9, 3539.0], [60.0, 3543.0], [60.1, 3545.0], [60.2, 3551.0], [60.3, 3555.0], [60.4, 3558.0], [60.5, 3566.0], [60.6, 3574.0], [60.7, 3579.0], [60.8, 3581.0], [60.9, 3582.0], [61.0, 3583.0], [61.1, 3587.0], [61.2, 3588.0], [61.3, 3589.0], [61.4, 3596.0], [61.5, 3598.0], [61.6, 3606.0], [61.7, 3607.0], [61.8, 3611.0], [61.9, 3613.0], [62.0, 3617.0], [62.1, 3618.0], [62.2, 3622.0], [62.3, 3628.0], [62.4, 3631.0], [62.5, 3635.0], [62.6, 3639.0], [62.7, 3641.0], [62.8, 3644.0], [62.9, 3654.0], [63.0, 3660.0], [63.1, 3665.0], [63.2, 3670.0], [63.3, 3676.0], [63.4, 3679.0], [63.5, 3685.0], [63.6, 3688.0], [63.7, 3692.0], [63.8, 3711.0], [63.9, 3711.0], [64.0, 3715.0], [64.1, 3717.0], [64.2, 3725.0], [64.3, 3730.0], [64.4, 3732.0], [64.5, 3737.0], [64.6, 3741.0], [64.7, 3746.0], [64.8, 3750.0], [64.9, 3752.0], [65.0, 3754.0], [65.1, 3757.0], [65.2, 3758.0], [65.3, 3760.0], [65.4, 3767.0], [65.5, 3769.0], [65.6, 3773.0], [65.7, 3775.0], [65.8, 3780.0], [65.9, 3782.0], [66.0, 3787.0], [66.1, 3789.0], [66.2, 3795.0], [66.3, 3796.0], [66.4, 3801.0], [66.5, 3802.0], [66.6, 3805.0], [66.7, 3807.0], [66.8, 3807.0], [66.9, 3808.0], [67.0, 3819.0], [67.1, 3821.0], [67.2, 3823.0], [67.3, 3824.0], [67.4, 3825.0], [67.5, 3828.0], [67.6, 3835.0], [67.7, 3837.0], [67.8, 3842.0], [67.9, 3846.0], [68.0, 3847.0], [68.1, 3850.0], [68.2, 3853.0], [68.3, 3857.0], [68.4, 3861.0], [68.5, 3864.0], [68.6, 3873.0], [68.7, 3878.0], [68.8, 3883.0], [68.9, 3884.0], [69.0, 3884.0], [69.1, 3886.0], [69.2, 3889.0], [69.3, 3891.0], [69.4, 3895.0], [69.5, 3897.0], [69.6, 3900.0], [69.7, 3901.0], [69.8, 3904.0], [69.9, 3907.0], [70.0, 3911.0], [70.1, 3916.0], [70.2, 3918.0], [70.3, 3922.0], [70.4, 3923.0], [70.5, 3926.0], [70.6, 3929.0], [70.7, 3932.0], [70.8, 3935.0], [70.9, 3939.0], [71.0, 3943.0], [71.1, 3946.0], [71.2, 3948.0], [71.3, 3950.0], [71.4, 3951.0], [71.5, 3956.0], [71.6, 3957.0], [71.7, 3958.0], [71.8, 3960.0], [71.9, 3962.0], [72.0, 3963.0], [72.1, 3966.0], [72.2, 3967.0], [72.3, 3971.0], [72.4, 3974.0], [72.5, 3980.0], [72.6, 3985.0], [72.7, 3987.0], [72.8, 3995.0], [72.9, 3997.0], [73.0, 3998.0], [73.1, 3999.0], [73.2, 3999.0], [73.3, 4003.0], [73.4, 4004.0], [73.5, 4006.0], [73.6, 4010.0], [73.7, 4011.0], [73.8, 4019.0], [73.9, 4023.0], [74.0, 4025.0], [74.1, 4027.0], [74.2, 4028.0], [74.3, 4033.0], [74.4, 4036.0], [74.5, 4040.0], [74.6, 4041.0], [74.7, 4042.0], [74.8, 4046.0], [74.9, 4048.0], [75.0, 4054.0], [75.1, 4058.0], [75.2, 4061.0], [75.3, 4064.0], [75.4, 4069.0], [75.5, 4073.0], [75.6, 4078.0], [75.7, 4080.0], [75.8, 4084.0], [75.9, 4095.0], [76.0, 4098.0], [76.1, 4100.0], [76.2, 4103.0], [76.3, 4105.0], [76.4, 4114.0], [76.5, 4119.0], [76.6, 4122.0], [76.7, 4124.0], [76.8, 4126.0], [76.9, 4127.0], [77.0, 4132.0], [77.1, 4137.0], [77.2, 4138.0], [77.3, 4142.0], [77.4, 4145.0], [77.5, 4147.0], [77.6, 4151.0], [77.7, 4155.0], [77.8, 4157.0], [77.9, 4161.0], [78.0, 4164.0], [78.1, 4171.0], [78.2, 4172.0], [78.3, 4177.0], [78.4, 4179.0], [78.5, 4186.0], [78.6, 4188.0], [78.7, 4190.0], [78.8, 4192.0], [78.9, 4194.0], [79.0, 4197.0], [79.1, 4205.0], [79.2, 4210.0], [79.3, 4214.0], [79.4, 4216.0], [79.5, 4223.0], [79.6, 4229.0], [79.7, 4233.0], [79.8, 4234.0], [79.9, 4237.0], [80.0, 4240.0], [80.1, 4246.0], [80.2, 4250.0], [80.3, 4254.0], [80.4, 4257.0], [80.5, 4258.0], [80.6, 4262.0], [80.7, 4263.0], [80.8, 4264.0], [80.9, 4265.0], [81.0, 4268.0], [81.1, 4270.0], [81.2, 4278.0], [81.3, 4282.0], [81.4, 4286.0], [81.5, 4289.0], [81.6, 4290.0], [81.7, 4295.0], [81.8, 4302.0], [81.9, 4304.0], [82.0, 4309.0], [82.1, 4312.0], [82.2, 4314.0], [82.3, 4317.0], [82.4, 4318.0], [82.5, 4321.0], [82.6, 4327.0], [82.7, 4331.0], [82.8, 4333.0], [82.9, 4338.0], [83.0, 4344.0], [83.1, 4346.0], [83.2, 4348.0], [83.3, 4351.0], [83.4, 4353.0], [83.5, 4355.0], [83.6, 4358.0], [83.7, 4361.0], [83.8, 4362.0], [83.9, 4364.0], [84.0, 4366.0], [84.1, 4370.0], [84.2, 4374.0], [84.3, 4379.0], [84.4, 4381.0], [84.5, 4382.0], [84.6, 4386.0], [84.7, 4396.0], [84.8, 4402.0], [84.9, 4408.0], [85.0, 4410.0], [85.1, 4411.0], [85.2, 4415.0], [85.3, 4420.0], [85.4, 4422.0], [85.5, 4434.0], [85.6, 4436.0], [85.7, 4438.0], [85.8, 4440.0], [85.9, 4444.0], [86.0, 4447.0], [86.1, 4452.0], [86.2, 4452.0], [86.3, 4452.0], [86.4, 4457.0], [86.5, 4458.0], [86.6, 4461.0], [86.7, 4463.0], [86.8, 4475.0], [86.9, 4481.0], [87.0, 4484.0], [87.1, 4485.0], [87.2, 4485.0], [87.3, 4487.0], [87.4, 4488.0], [87.5, 4490.0], [87.6, 4491.0], [87.7, 4495.0], [87.8, 4497.0], [87.9, 4501.0], [88.0, 4505.0], [88.1, 4507.0], [88.2, 4510.0], [88.3, 4513.0], [88.4, 4517.0], [88.5, 4525.0], [88.6, 4528.0], [88.7, 4531.0], [88.8, 4533.0], [88.9, 4535.0], [89.0, 4539.0], [89.1, 4541.0], [89.2, 4548.0], [89.3, 4552.0], [89.4, 4554.0], [89.5, 4556.0], [89.6, 4560.0], [89.7, 4563.0], [89.8, 4565.0], [89.9, 4572.0], [90.0, 4578.0], [90.1, 4583.0], [90.2, 4594.0], [90.3, 4596.0], [90.4, 4600.0], [90.5, 4602.0], [90.6, 4604.0], [90.7, 4608.0], [90.8, 4609.0], [90.9, 4611.0], [91.0, 4611.0], [91.1, 4617.0], [91.2, 4622.0], [91.3, 4628.0], [91.4, 4630.0], [91.5, 4631.0], [91.6, 4634.0], [91.7, 4643.0], [91.8, 4649.0], [91.9, 4652.0], [92.0, 4658.0], [92.1, 4659.0], [92.2, 4662.0], [92.3, 4668.0], [92.4, 4671.0], [92.5, 4683.0], [92.6, 4692.0], [92.7, 4699.0], [92.8, 4705.0], [92.9, 4711.0], [93.0, 4720.0], [93.1, 4724.0], [93.2, 4730.0], [93.3, 4731.0], [93.4, 4743.0], [93.5, 4748.0], [93.6, 4756.0], [93.7, 4760.0], [93.8, 4768.0], [93.9, 4772.0], [94.0, 4774.0], [94.1, 4776.0], [94.2, 4779.0], [94.3, 4787.0], [94.4, 4787.0], [94.5, 4789.0], [94.6, 4794.0], [94.7, 4805.0], [94.8, 4820.0], [94.9, 4828.0], [95.0, 4835.0], [95.1, 4843.0], [95.2, 4863.0], [95.3, 4870.0], [95.4, 4878.0], [95.5, 4881.0], [95.6, 4891.0], [95.7, 4894.0], [95.8, 4901.0], [95.9, 4907.0], [96.0, 4911.0], [96.1, 4954.0], [96.2, 4963.0], [96.3, 4975.0], [96.4, 4981.0], [96.5, 4988.0], [96.6, 4993.0], [96.7, 5012.0], [96.8, 5022.0], [96.9, 5027.0], [97.0, 5031.0], [97.1, 5036.0], [97.2, 5041.0], [97.3, 5071.0], [97.4, 5072.0], [97.5, 5081.0], [97.6, 5099.0], [97.7, 5106.0], [97.8, 5117.0], [97.9, 5120.0], [98.0, 5141.0], [98.1, 5146.0], [98.2, 5160.0], [98.3, 5171.0], [98.4, 5173.0], [98.5, 5206.0], [98.6, 5218.0], [98.7, 5238.0], [98.8, 5246.0], [98.9, 5308.0], [99.0, 5349.0], [99.1, 5397.0], [99.2, 5405.0], [99.3, 5426.0], [99.4, 5479.0], [99.5, 5514.0], [99.6, 5545.0], [99.7, 5614.0], [99.8, 5751.0], [99.9, 5914.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 74.0, "series": [{"data": [[600.0, 4.0], [700.0, 4.0], [800.0, 1.0], [900.0, 4.0], [1000.0, 23.0], [1100.0, 26.0], [1200.0, 29.0], [1300.0, 36.0], [1400.0, 26.0], [1500.0, 31.0], [1600.0, 23.0], [1700.0, 39.0], [1800.0, 34.0], [1900.0, 42.0], [2000.0, 42.0], [2100.0, 53.0], [2300.0, 45.0], [2200.0, 30.0], [2400.0, 36.0], [2500.0, 54.0], [2600.0, 43.0], [2800.0, 45.0], [2700.0, 39.0], [2900.0, 56.0], [3000.0, 45.0], [3100.0, 40.0], [3200.0, 41.0], [3300.0, 37.0], [3400.0, 30.0], [3500.0, 52.0], [3600.0, 44.0], [3700.0, 52.0], [3800.0, 64.0], [3900.0, 73.0], [4000.0, 57.0], [4200.0, 55.0], [4100.0, 59.0], [4300.0, 59.0], [4400.0, 63.0], [4500.0, 49.0], [4600.0, 48.0], [4700.0, 38.0], [4800.0, 23.0], [4900.0, 17.0], [5000.0, 20.0], [5100.0, 17.0], [5300.0, 6.0], [5200.0, 7.0], [5500.0, 5.0], [5400.0, 6.0], [5600.0, 1.0], [5700.0, 3.0], [5900.0, 2.0], [100.0, 7.0], [200.0, 73.0], [300.0, 74.0], [400.0, 52.0], [500.0, 16.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 169.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1624.0, "series": [{"data": [[1.0, 169.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 207.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1624.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 524.1619999999999, "minX": 1.5495834E12, "maxY": 524.1619999999999, "series": [{"data": [[1.5495834E12, 524.1619999999999]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 256.0, "minX": 1.0, "maxY": 5935.0, "series": [{"data": [[2.0, 4098.0], [3.0, 4205.0], [5.0, 4163.5], [6.0, 4240.0], [7.0, 4662.0], [9.0, 4363.5], [10.0, 4760.0], [11.0, 4346.0], [12.0, 4396.0], [13.0, 4787.0], [14.0, 4126.0], [16.0, 4569.5], [18.0, 4490.5], [19.0, 3978.0], [20.0, 5751.0], [21.0, 3999.0], [22.0, 4457.0], [23.0, 4495.0], [24.0, 4602.0], [25.0, 4552.0], [26.0, 4611.0], [27.0, 4630.0], [28.0, 4699.0], [29.0, 4064.0], [30.0, 4415.0], [31.0, 4800.0], [33.0, 4408.0], [32.0, 3930.0], [35.0, 4040.0], [34.0, 4268.0], [37.0, 4220.0], [36.0, 3948.0], [39.0, 4205.0], [38.0, 3985.0], [41.0, 4772.0], [40.0, 4458.0], [43.0, 4289.0], [42.0, 4531.0], [44.0, 4418.0], [46.0, 4249.0], [49.0, 810.6], [48.0, 2172.75], [51.0, 1107.1666666666667], [50.0, 855.875], [52.0, 1873.3333333333333], [53.0, 2082.0], [55.0, 2268.5], [54.0, 972.125], [57.0, 1679.3333333333333], [56.0, 1053.8], [59.0, 1805.0], [58.0, 1211.75], [61.0, 1048.0], [60.0, 1170.8], [63.0, 755.7777777777778], [62.0, 635.2857142857143], [67.0, 3458.6666666666665], [66.0, 416.5], [65.0, 1337.125], [64.0, 314.0], [71.0, 1649.0], [70.0, 1125.2], [69.0, 882.25], [68.0, 1641.0], [74.0, 2959.3333333333335], [73.0, 285.0], [72.0, 1416.0], [75.0, 3904.0], [79.0, 1652.6666666666667], [77.0, 256.0], [76.0, 1374.75], [78.0, 4375.0], [83.0, 773.4444444444445], [81.0, 1615.4285714285716], [82.0, 1646.3333333333333], [80.0, 320.5], [84.0, 821.375], [85.0, 918.0], [86.0, 2354.0], [87.0, 4115.0], [90.0, 2084.0], [91.0, 3864.0], [89.0, 4362.0], [88.0, 4187.0], [93.0, 2325.0], [94.0, 1234.25], [95.0, 849.7142857142857], [92.0, 4730.0], [97.0, 1175.8], [96.0, 951.7142857142857], [98.0, 2257.5], [99.0, 2467.5], [101.0, 1297.25], [103.0, 5141.0], [102.0, 4350.0], [100.0, 4357.0], [104.0, 2448.0], [105.0, 1540.5], [107.0, 4171.0], [106.0, 3939.0], [110.0, 1003.3333333333333], [111.0, 1595.6666666666667], [109.0, 4486.0], [108.0, 4241.0], [112.0, 1614.6666666666667], [113.0, 2100.0], [114.0, 1833.6666666666667], [115.0, 2378.0], [116.0, 480.5], [118.0, 1565.0], [119.0, 1267.3333333333335], [117.0, 4582.0], [120.0, 1664.6666666666667], [122.0, 1608.3333333333333], [121.0, 1542.0], [123.0, 4028.0], [125.0, 2526.0], [126.0, 2234.0], [127.0, 5723.0], [124.0, 4498.0], [129.0, 2117.5], [132.0, 2110.5], [131.0, 1267.6], [135.0, 5332.0], [134.0, 3943.0], [133.0, 4491.0], [130.0, 4216.0], [128.0, 4662.0], [138.0, 2238.5], [141.0, 2437.5], [143.0, 2464.0], [142.0, 2559.5], [140.0, 3892.0], [139.0, 4461.0], [137.0, 4438.0], [136.0, 4120.0], [146.0, 1076.1666666666667], [147.0, 2183.0], [149.0, 2034.6666666666667], [148.0, 2524.0], [150.0, 2644.0], [151.0, 4084.0], [145.0, 4051.0], [144.0, 4993.0], [159.0, 4104.0], [158.0, 4600.0], [157.0, 3789.0], [156.0, 4409.0], [155.0, 3958.0], [154.0, 5081.0], [153.0, 4439.0], [152.0, 3980.0], [167.0, 3906.0], [166.0, 4446.0], [165.0, 4258.0], [164.0, 4078.0], [163.0, 4630.0], [162.0, 3962.0], [161.0, 4954.0], [160.0, 3884.0], [175.0, 4167.0], [174.0, 3961.0], [173.0, 3807.0], [172.0, 4004.0], [171.0, 4059.0], [170.0, 3819.0], [169.0, 4560.0], [168.0, 4452.0], [183.0, 4257.0], [182.0, 4137.0], [181.0, 4510.0], [180.0, 4377.0], [179.0, 4312.0], [178.0, 4331.0], [177.0, 4197.0], [176.0, 5788.0], [191.0, 3835.0], [190.0, 3911.0], [189.0, 3861.0], [188.0, 4027.0], [187.0, 5349.0], [186.0, 4186.0], [185.0, 3842.0], [184.0, 3824.0], [199.0, 3981.0], [198.0, 5173.0], [197.0, 5244.0], [196.0, 3751.0], [195.0, 3837.0], [194.0, 3922.0], [193.0, 4896.0], [192.0, 5514.0], [207.0, 3660.0], [206.0, 4452.0], [205.0, 3920.5], [203.0, 4379.0], [202.0, 4135.0], [201.0, 4911.0], [200.0, 4058.0], [215.0, 4310.0], [214.0, 4401.0], [213.0, 3737.0], [212.0, 4192.0], [211.0, 4468.0], [210.0, 4620.0], [209.0, 4457.0], [208.0, 4189.0], [223.0, 4422.0], [222.0, 4025.0], [221.0, 3999.0], [220.0, 5614.0], [219.0, 3916.0], [218.0, 3821.0], [217.0, 4776.0], [216.0, 4629.0], [231.0, 4061.0], [230.0, 4484.0], [229.0, 3824.0], [228.0, 4634.0], [227.0, 5012.0], [226.0, 4338.0], [225.0, 3728.0], [224.0, 5207.0], [239.0, 4440.0], [238.0, 4194.0], [237.0, 4099.0], [236.0, 4033.0], [235.0, 3878.0], [234.0, 5106.0], [233.0, 5232.0], [232.0, 3848.0], [247.0, 4825.0], [246.0, 4254.0], [245.0, 3928.0], [244.0, 3808.0], [243.0, 3752.0], [242.0, 4028.0], [240.0, 5527.0], [255.0, 4092.0], [254.0, 3639.0], [253.0, 3907.0], [252.0, 5218.0], [251.0, 4366.0], [250.0, 4052.5], [249.0, 5026.0], [270.0, 4038.0], [271.0, 4643.0], [269.0, 4879.0], [268.0, 4373.0], [266.0, 4279.0], [265.0, 4607.0], [264.0, 4262.0], [263.0, 3735.0], [257.0, 5426.0], [256.0, 3688.0], [259.0, 4975.0], [258.0, 5412.0], [262.0, 5171.0], [261.0, 4829.0], [260.0, 3889.0], [286.0, 4080.0], [287.0, 3891.0], [285.0, 4495.0], [284.0, 4290.0], [283.0, 4362.0], [282.0, 3932.0], [281.0, 5001.0], [280.0, 4386.0], [279.0, 4966.0], [273.0, 4787.0], [272.0, 4756.0], [275.0, 3957.0], [274.0, 4322.0], [278.0, 4282.0], [277.0, 5143.0], [276.0, 3769.0], [302.0, 4498.0], [303.0, 4321.0], [300.0, 5074.0], [291.0, 4650.0], [290.0, 4789.0], [289.0, 3644.0], [288.0, 4041.0], [299.0, 5159.0], [298.0, 5455.0], [297.0, 4630.5], [295.0, 4454.5], [293.0, 5397.0], [292.0, 4660.0], [318.0, 4828.0], [319.0, 4379.0], [317.0, 3607.0], [316.0, 3846.0], [315.0, 4692.0], [314.0, 3770.0], [313.0, 3587.0], [312.0, 3541.0], [311.0, 3850.0], [305.0, 4578.0], [304.0, 5036.0], [307.0, 5031.0], [306.0, 5300.0], [310.0, 4609.0], [309.0, 4157.0], [308.0, 5117.0], [322.0, 1651.6666666666665], [324.0, 1725.75], [325.0, 3582.0], [323.0, 1727.75], [321.0, 3014.0], [326.0, 3145.0], [327.0, 2273.5], [320.0, 4454.0], [328.0, 2285.5], [331.0, 5206.0], [330.0, 5160.0], [329.0, 3545.0], [335.0, 5238.0], [332.0, 1873.5], [333.0, 2164.3333333333335], [334.0, 1784.8], [350.0, 3023.5], [351.0, 4234.0], [349.0, 4146.0], [348.0, 4792.0], [347.0, 5022.0], [346.0, 4757.0], [345.0, 3510.0], [344.0, 3959.0], [343.0, 4364.0], [337.0, 3920.0], [336.0, 4835.0], [339.0, 5071.0], [338.0, 4214.0], [342.0, 4907.0], [341.0, 4110.0], [365.0, 1909.5], [354.0, 2817.5], [353.0, 4355.0], [352.0, 3950.0], [359.0, 4471.5], [357.0, 4162.0], [355.0, 3217.5], [362.0, 1978.25], [363.0, 1643.2857142857142], [364.0, 1558.4285714285716], [366.0, 3101.5], [367.0, 2865.5], [361.0, 5132.0], [360.0, 4699.0], [370.0, 3077.5], [372.0, 2366.0], [371.0, 2220.5], [374.0, 1674.7142857142858], [373.0, 2398.333333333333], [375.0, 2607.666666666667], [369.0, 4158.5], [378.0, 2882.0], [377.0, 4628.0], [376.0, 3304.0], [379.0, 5370.0], [380.0, 2927.5], [383.0, 5038.0], [382.0, 5072.0], [381.0, 4157.0], [396.0, 1766.8749999999998], [389.0, 2869.0], [388.0, 4012.0], [391.0, 3029.0], [385.0, 4154.0], [384.0, 4264.0], [387.0, 5099.0], [386.0, 4223.0], [390.0, 2777.0], [393.0, 2915.0], [395.0, 3360.5], [394.0, 3652.0], [397.0, 2053.3333333333335], [399.0, 4317.0], [392.0, 4405.0], [398.0, 4278.0], [412.0, 2908.5], [401.0, 2328.6666666666665], [403.0, 4668.0], [402.0, 5029.0], [400.0, 2292.666666666667], [406.0, 2625.0], [407.0, 4551.0], [405.0, 3024.5], [404.0, 4286.0], [410.0, 2098.3333333333335], [409.0, 4517.0], [408.0, 4410.0], [411.0, 4054.0], [413.0, 2755.5], [415.0, 4485.0], [414.0, 4596.0], [429.0, 3105.0], [416.0, 2358.333333333333], [417.0, 2445.666666666667], [419.0, 2667.0], [418.0, 4789.0], [428.0, 4509.0], [421.0, 2695.0], [420.0, 3884.0], [422.0, 3851.0], [423.0, 4041.0], [427.0, 3078.5], [426.0, 3062.5], [430.0, 1571.0], [431.0, 3803.5], [425.0, 4032.0], [424.0, 4837.0], [444.0, 3045.5], [440.0, 3041.0], [437.0, 2648.0], [436.0, 5195.0], [439.0, 3396.0], [433.0, 4683.0], [432.0, 3013.0], [435.0, 3935.0], [434.0, 4617.0], [438.0, 5092.0], [442.0, 2127.25], [443.0, 1967.5], [445.0, 2280.0], [447.0, 4318.0], [446.0, 4370.0], [441.0, 4381.0], [462.0, 3232.0], [457.0, 2731.5], [459.0, 2762.5], [460.0, 2807.5], [451.0, 4179.0], [450.0, 4572.0], [449.0, 4178.0], [448.0, 4302.0], [463.0, 2436.3333333333335], [458.0, 4565.0], [456.0, 4745.0], [455.0, 4289.0], [454.0, 3781.0], [453.0, 4119.0], [452.0, 3730.0], [478.0, 3007.5], [464.0, 2841.0], [466.0, 4555.0], [465.0, 4724.0], [471.0, 4490.0], [470.0, 3902.0], [469.0, 3102.0], [468.0, 5545.0], [467.0, 2209.0], [474.0, 2256.666666666667], [475.0, 2818.5], [479.0, 4528.0], [477.0, 3161.0], [476.0, 3676.0], [473.0, 4670.0], [472.0, 5935.0], [493.0, 4142.0], [480.0, 2179.5], [482.0, 2973.0], [481.0, 2341.0], [486.0, 3133.0], [485.0, 3839.0], [484.0, 3620.0], [487.0, 3886.0], [488.0, 3316.0], [489.0, 2617.0], [491.0, 4721.0], [490.0, 4022.0], [495.0, 3677.0], [494.0, 3834.0], [492.0, 3740.0], [483.0, 3998.0], [509.0, 1150.0], [498.0, 3167.0], [500.0, 2042.0], [501.0, 3583.0], [499.0, 2748.0], [508.0, 5146.0], [504.0, 2271.25], [503.0, 2723.0], [497.0, 4320.0], [496.0, 4008.0], [502.0, 3534.5], [505.0, 3213.5], [507.0, 4102.0], [506.0, 3664.0], [510.0, 3436.6666666666665], [511.0, 3853.0], [536.0, 2589.75], [514.0, 2372.0], [512.0, 2367.25], [515.0, 2832.5], [517.0, 4423.0], [516.0, 4073.0], [513.0, 2950.5], [518.0, 3195.5], [519.0, 2374.3333333333335], [538.0, 2928.0], [537.0, 3597.0], [539.0, 3235.0], [541.0, 3080.0], [540.0, 4314.0], [543.0, 4233.0], [529.0, 3607.0], [528.0, 3338.0], [542.0, 3495.0], [530.0, 3213.0], [531.0, 2899.5], [532.0, 3752.0], [533.0, 2621.5], [535.0, 3956.0], [534.0, 4563.0], [520.0, 2138.8], [521.0, 3584.5], [522.0, 2670.5], [523.0, 5173.0], [525.0, 3805.0], [524.0, 4340.0], [527.0, 3566.0], [526.0, 3206.0], [569.0, 3243.5], [556.0, 2546.0], [551.0, 2922.0], [559.0, 3907.0], [544.0, 4075.0], [546.0, 3767.0], [545.0, 4602.0], [548.0, 3967.0], [547.0, 4535.0], [550.0, 4344.0], [549.0, 3284.0], [558.0, 3207.0], [557.0, 3596.0], [568.0, 4892.0], [552.0, 3023.3333333333335], [553.0, 4047.0], [554.0, 2557.0], [555.0, 2829.0], [563.0, 2617.0], [564.0, 3172.5], [565.0, 3575.0], [567.0, 2404.0], [566.0, 3530.0], [575.0, 3394.0], [560.0, 4096.0], [562.0, 3900.0], [561.0, 3437.0], [574.0, 4535.0], [573.0, 3169.0], [572.0, 4731.0], [571.0, 3658.0], [570.0, 3823.0], [600.0, 2707.0], [577.0, 3163.5], [576.0, 2407.0], [591.0, 4600.0], [578.0, 2756.5], [579.0, 4870.0], [581.0, 3361.0], [580.0, 4081.0], [582.0, 2803.5], [584.0, 1953.0], [583.0, 2877.5], [592.0, 2860.5], [607.0, 4285.0], [604.0, 3477.0], [603.0, 3247.0], [602.0, 3725.0], [601.0, 3757.0], [605.0, 4440.0], [606.0, 2512.0], [593.0, 2333.0], [594.0, 2409.3333333333335], [596.0, 2256.0], [595.0, 4003.0], [597.0, 2582.75], [598.0, 1359.0], [599.0, 4067.0], [586.0, 3155.0], [585.0, 2475.0], [587.0, 3147.5], [589.0, 3622.0], [588.0, 4525.0], [590.0, 2791.5], [633.0, 2734.3333333333335], [619.0, 1954.1666666666667], [608.0, 2709.5], [609.0, 3461.5], [610.0, 3128.0], [612.0, 4881.0], [611.0, 4608.0], [614.0, 3758.0], [613.0, 4539.0], [632.0, 4556.0], [615.0, 3813.0], [634.0, 2425.0], [635.0, 4562.0], [637.0, 3249.0], [636.0, 3041.0], [638.0, 2528.3333333333335], [639.0, 3588.0], [624.0, 3035.0], [626.0, 4652.0], [625.0, 4463.0], [628.0, 2294.0], [627.0, 2220.833333333333], [617.0, 2589.5], [616.0, 2238.3333333333335], [618.0, 2011.8], [622.0, 2308.666666666667], [621.0, 3065.0], [620.0, 4563.0], [630.0, 2797.5], [631.0, 2911.0], [629.0, 3017.5], [665.0, 2591.3333333333335], [641.0, 2447.5], [642.0, 2536.0], [643.0, 3687.0], [645.0, 3784.0], [644.0, 3998.0], [648.0, 2426.75], [647.0, 3090.0], [664.0, 2825.0], [666.0, 2603.3333333333335], [667.0, 2676.5], [669.0, 2977.0], [668.0, 3679.0], [670.0, 2884.5], [671.0, 3579.0], [646.0, 2321.0], [649.0, 2575.25], [654.0, 2951.5], [653.0, 3635.0], [652.0, 2945.0], [651.0, 4462.0], [650.0, 3526.0], [655.0, 2748.0], [640.0, 4609.0], [656.0, 2764.5], [658.0, 1707.5], [657.0, 2471.8], [659.0, 3518.0], [660.0, 3181.0], [661.0, 3272.5], [663.0, 3876.0], [662.0, 4447.0], [679.0, 3494.5], [674.0, 3241.6666666666665], [672.0, 2699.0], [673.0, 3787.0], [687.0, 3490.0], [686.0, 3742.0], [684.0, 2449.833333333333], [685.0, 2817.6666666666665], [675.0, 2924.0], [676.0, 3006.5], [677.0, 2837.6666666666665], [678.0, 3539.0], [689.0, 2521.5], [688.0, 2690.0], [691.0, 3847.0], [690.0, 4720.0], [696.0, 3117.5], [697.0, 4436.0], [700.0, 2967.0], [699.0, 3761.0], [702.0, 2999.6666666666665], [701.0, 3350.0], [703.0, 2698.714285714286], [693.0, 3230.25], [694.0, 3000.5], [695.0, 2474.25], [681.0, 2763.5], [680.0, 4177.0], [683.0, 2337.6], [682.0, 3150.0], [711.0, 2535.0], [705.0, 2266.4285714285716], [704.0, 2332.9999999999995], [719.0, 3019.0], [718.0, 4982.0], [717.0, 3442.0], [706.0, 2385.285714285714], [708.0, 2844.6666666666665], [710.0, 2891.0], [709.0, 4071.0], [707.0, 2216.0], [720.0, 2350.8333333333335], [722.0, 3746.0], [721.0, 3887.0], [734.0, 3542.0], [733.0, 3881.0], [735.0, 4215.0], [729.0, 2838.6666666666665], [728.0, 3987.0], [731.0, 4011.0], [730.0, 3077.0], [732.0, 2460.6666666666665], [723.0, 3064.0], [725.0, 2730.0], [724.0, 3823.0], [726.0, 2451.4], [727.0, 2891.6666666666665], [713.0, 2818.3333333333335], [716.0, 2847.0], [715.0, 2915.0], [714.0, 3964.0], [760.0, 2790.8181818181815], [737.0, 3010.5], [736.0, 2482.3333333333335], [750.0, 3822.0], [749.0, 4147.0], [751.0, 3036.3333333333335], [747.0, 2891.666666666667], [748.0, 3475.5], [739.0, 2859.5], [738.0, 3913.0], [741.0, 2645.333333333333], [742.0, 2773.0], [743.0, 2940.0], [761.0, 2652.692307692307], [762.0, 2595.391304347826], [763.0, 2549.5833333333335], [764.0, 2683.727272727272], [765.0, 3052.0], [767.0, 2969.25], [766.0, 3775.5], [752.0, 2569.6666666666665], [753.0, 3533.6666666666665], [754.0, 4452.0], [756.0, 2832.0], [755.0, 3688.5], [757.0, 2764.714285714286], [759.0, 2724.875], [758.0, 3395.0], [740.0, 3320.25], [744.0, 2920.5], [746.0, 2765.166666666667], [745.0, 2750.4], [771.0, 3055.5], [768.0, 3436.5], [770.0, 4297.0], [769.0, 4182.0], [783.0, 2770.75], [782.0, 3301.25], [781.0, 2412.6], [780.0, 3795.0], [779.0, 4304.0], [772.0, 2734.0], [774.0, 3004.5], [775.0, 3452.3333333333335], [792.0, 2834.0], [795.0, 2863.714285714286], [794.0, 4001.0], [793.0, 4144.0], [796.0, 2914.25], [797.0, 3084.3333333333335], [798.0, 2734.777777777778], [799.0, 2700.0], [784.0, 2980.5], [786.0, 2952.0], [785.0, 3883.0], [788.0, 3239.2], [789.0, 2809.0], [791.0, 3029.5], [790.0, 3115.0], [787.0, 3317.0], [773.0, 3094.5], [776.0, 3060.0], [778.0, 2773.3333333333335], [777.0, 2845.2], [807.0, 3267.285714285714], [802.0, 2526.333333333333], [801.0, 2988.0], [806.0, 2782.5714285714284], [805.0, 2458.0], [804.0, 2743.5454545454545], [803.0, 3068.142857142857], [800.0, 2906.6666666666665], [808.0, 3111.75], [809.0, 2840.5], [812.0, 3104.6666666666665], [813.0, 3431.333333333333], [814.0, 3224.25], [815.0, 2478.5], [811.0, 3158.0], [810.0, 2858.0], [816.0, 3636.0], [817.0, 3160.0], [831.0, 3780.0], [830.0, 3796.0], [829.0, 2776.0], [828.0, 2727.0], [824.0, 2881.0], [826.0, 3360.0], [825.0, 3717.0], [827.0, 2643.0], [818.0, 2051.5], [820.0, 3050.25], [822.0, 2883.0], [821.0, 2690.0], [823.0, 2833.6666666666665], [819.0, 3732.0], [838.0, 3853.0], [835.0, 3076.5], [834.0, 3273.0], [833.0, 2748.0], [832.0, 3246.0], [836.0, 2357.3333333333335], [837.0, 3130.6666666666665], [843.0, 3357.3333333333335], [842.0, 4048.0], [841.0, 3789.0], [840.0, 3436.0], [844.0, 2978.0], [846.0, 2876.0], [845.0, 2577.0], [847.0, 3348.0], [849.0, 2845.8], [850.0, 2597.3333333333335], [848.0, 2526.0], [862.0, 2919.9166666666665], [863.0, 2903.8], [860.0, 2700.6666666666665], [859.0, 2952.0], [858.0, 2606.0], [861.0, 2635.6], [856.0, 2912.6666666666665], [839.0, 3141.0], [857.0, 3740.5], [851.0, 3246.5], [852.0, 2760.6666666666665], [853.0, 3301.5], [855.0, 2942.3333333333335], [854.0, 3539.0], [888.0, 3670.5], [877.0, 2940.0], [865.0, 2700.5], [869.0, 3749.3333333333335], [868.0, 3394.0], [867.0, 3340.0], [866.0, 3419.0], [871.0, 3305.0], [870.0, 3557.0], [889.0, 3273.0], [891.0, 2967.0], [893.0, 2982.0], [892.0, 3188.0], [895.0, 3189.0], [894.0, 3194.0], [880.0, 2388.25], [882.0, 3236.5], [885.0, 2868.2], [886.0, 3567.6666666666665], [887.0, 2312.0], [884.0, 3117.0], [883.0, 2692.25], [881.0, 2957.6666666666665], [872.0, 2808.5], [873.0, 3111.0], [875.0, 2715.5], [874.0, 3283.0], [878.0, 3037.333333333333], [876.0, 2809.0], [879.0, 2948.6], [864.0, 3754.0], [903.0, 2977.0], [897.0, 3207.3333333333335], [896.0, 3402.75], [911.0, 2985.0], [910.0, 3667.0], [908.0, 3521.5], [909.0, 2484.0], [899.0, 2673.0], [898.0, 2980.0], [901.0, 2861.0], [900.0, 2254.0], [902.0, 2358.0], [904.0, 2637.714285714286], [905.0, 2682.142857142857], [913.0, 2414.0], [923.0, 2799.4], [924.0, 3092.833333333333], [926.0, 3141.0], [925.0, 3122.0], [927.0, 2329.5], [912.0, 2642.0], [922.0, 2801.625], [921.0, 2620.272727272727], [920.0, 3138.0], [918.0, 2752.3333333333335], [917.0, 2796.0], [916.0, 2543.0], [915.0, 3778.0], [914.0, 2211.0], [919.0, 3325.0], [906.0, 4006.0], [907.0, 3520.3333333333335], [931.0, 3275.5], [929.0, 2700.5], [928.0, 3334.0], [930.0, 3331.0], [933.0, 2465.333333333333], [932.0, 3041.6666666666665], [934.0, 3047.25], [935.0, 2947.6666666666665], [936.0, 2874.3333333333335], [937.0, 3172.3333333333335], [1.0, 4534.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[524.1619999999999, 2898.8410000000035]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 937.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.5495834E12, "maxY": 13999.166666666666, "series": [{"data": [[1.5495834E12, 13999.166666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495834E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2898.8410000000035, "minX": 1.5495834E12, "maxY": 2898.8410000000035, "series": [{"data": [[1.5495834E12, 2898.8410000000035]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495834E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 2898.8325000000013, "minX": 1.5495834E12, "maxY": 2898.8325000000013, "series": [{"data": [[1.5495834E12, 2898.8325000000013]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495834E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 62.28800000000013, "minX": 1.5495834E12, "maxY": 62.28800000000013, "series": [{"data": [[1.5495834E12, 62.28800000000013]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495834E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 137.0, "minX": 1.5495834E12, "maxY": 5935.0, "series": [{"data": [[1.5495834E12, 5935.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495834E12, 137.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495834E12, 4577.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495834E12, 5348.83]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495834E12, 4834.699999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3023.0, "minX": 33.0, "maxY": 3023.0, "series": [{"data": [[33.0, 3023.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3023.0, "minX": 33.0, "maxY": 3023.0, "series": [{"data": [[33.0, 3023.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495834E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495834E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495834E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495834E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495834E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495834E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495834E12, "title": "Transactions Per Second"}},
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
