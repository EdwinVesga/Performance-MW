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
        data: {"result": {"minY": 138.0, "minX": 0.0, "maxY": 7497.0, "series": [{"data": [[0.0, 138.0], [0.1, 164.0], [0.2, 168.0], [0.3, 176.0], [0.4, 179.0], [0.5, 186.0], [0.6, 196.0], [0.7, 200.0], [0.8, 202.0], [0.9, 205.0], [1.0, 217.0], [1.1, 219.0], [1.2, 224.0], [1.3, 229.0], [1.4, 231.0], [1.5, 234.0], [1.6, 238.0], [1.7, 242.0], [1.8, 244.0], [1.9, 252.0], [2.0, 259.0], [2.1, 264.0], [2.2, 268.0], [2.3, 273.0], [2.4, 277.0], [2.5, 280.0], [2.6, 283.0], [2.7, 289.0], [2.8, 295.0], [2.9, 299.0], [3.0, 306.0], [3.1, 311.0], [3.2, 315.0], [3.3, 316.0], [3.4, 325.0], [3.5, 326.0], [3.6, 329.0], [3.7, 334.0], [3.8, 336.0], [3.9, 339.0], [4.0, 343.0], [4.1, 352.0], [4.2, 357.0], [4.3, 359.0], [4.4, 360.0], [4.5, 365.0], [4.6, 366.0], [4.7, 369.0], [4.8, 377.0], [4.9, 380.0], [5.0, 381.0], [5.1, 383.0], [5.2, 384.0], [5.3, 387.0], [5.4, 391.0], [5.5, 393.0], [5.6, 396.0], [5.7, 401.0], [5.8, 405.0], [5.9, 407.0], [6.0, 410.0], [6.1, 415.0], [6.2, 417.0], [6.3, 421.0], [6.4, 424.0], [6.5, 429.0], [6.6, 433.0], [6.7, 435.0], [6.8, 437.0], [6.9, 438.0], [7.0, 440.0], [7.1, 444.0], [7.2, 446.0], [7.3, 447.0], [7.4, 449.0], [7.5, 450.0], [7.6, 452.0], [7.7, 454.0], [7.8, 455.0], [7.9, 458.0], [8.0, 462.0], [8.1, 468.0], [8.2, 471.0], [8.3, 476.0], [8.4, 477.0], [8.5, 477.0], [8.6, 480.0], [8.7, 482.0], [8.8, 485.0], [8.9, 487.0], [9.0, 493.0], [9.1, 496.0], [9.2, 503.0], [9.3, 506.0], [9.4, 510.0], [9.5, 517.0], [9.6, 519.0], [9.7, 522.0], [9.8, 534.0], [9.9, 538.0], [10.0, 540.0], [10.1, 544.0], [10.2, 546.0], [10.3, 552.0], [10.4, 555.0], [10.5, 559.0], [10.6, 568.0], [10.7, 576.0], [10.8, 578.0], [10.9, 579.0], [11.0, 587.0], [11.1, 590.0], [11.2, 592.0], [11.3, 596.0], [11.4, 602.0], [11.5, 606.0], [11.6, 607.0], [11.7, 612.0], [11.8, 617.0], [11.9, 621.0], [12.0, 626.0], [12.1, 629.0], [12.2, 636.0], [12.3, 639.0], [12.4, 642.0], [12.5, 648.0], [12.6, 653.0], [12.7, 657.0], [12.8, 660.0], [12.9, 671.0], [13.0, 677.0], [13.1, 680.0], [13.2, 688.0], [13.3, 694.0], [13.4, 697.0], [13.5, 703.0], [13.6, 709.0], [13.7, 717.0], [13.8, 722.0], [13.9, 731.0], [14.0, 733.0], [14.1, 741.0], [14.2, 744.0], [14.3, 750.0], [14.4, 761.0], [14.5, 764.0], [14.6, 770.0], [14.7, 776.0], [14.8, 786.0], [14.9, 803.0], [15.0, 810.0], [15.1, 814.0], [15.2, 828.0], [15.3, 832.0], [15.4, 843.0], [15.5, 846.0], [15.6, 853.0], [15.7, 866.0], [15.8, 873.0], [15.9, 882.0], [16.0, 901.0], [16.1, 904.0], [16.2, 919.0], [16.3, 928.0], [16.4, 952.0], [16.5, 975.0], [16.6, 1001.0], [16.7, 1038.0], [16.8, 1049.0], [16.9, 1089.0], [17.0, 1103.0], [17.1, 1123.0], [17.2, 1149.0], [17.3, 1177.0], [17.4, 1203.0], [17.5, 1214.0], [17.6, 1238.0], [17.7, 1253.0], [17.8, 1268.0], [17.9, 1304.0], [18.0, 1312.0], [18.1, 1318.0], [18.2, 1327.0], [18.3, 1335.0], [18.4, 1341.0], [18.5, 1354.0], [18.6, 1369.0], [18.7, 1377.0], [18.8, 1398.0], [18.9, 1424.0], [19.0, 1435.0], [19.1, 1449.0], [19.2, 1458.0], [19.3, 1462.0], [19.4, 1468.0], [19.5, 1477.0], [19.6, 1478.0], [19.7, 1485.0], [19.8, 1491.0], [19.9, 1499.0], [20.0, 1506.0], [20.1, 1523.0], [20.2, 1531.0], [20.3, 1536.0], [20.4, 1542.0], [20.5, 1550.0], [20.6, 1554.0], [20.7, 1566.0], [20.8, 1574.0], [20.9, 1576.0], [21.0, 1583.0], [21.1, 1596.0], [21.2, 1604.0], [21.3, 1621.0], [21.4, 1626.0], [21.5, 1638.0], [21.6, 1642.0], [21.7, 1647.0], [21.8, 1655.0], [21.9, 1657.0], [22.0, 1660.0], [22.1, 1675.0], [22.2, 1681.0], [22.3, 1695.0], [22.4, 1701.0], [22.5, 1703.0], [22.6, 1713.0], [22.7, 1714.0], [22.8, 1728.0], [22.9, 1737.0], [23.0, 1741.0], [23.1, 1742.0], [23.2, 1744.0], [23.3, 1758.0], [23.4, 1763.0], [23.5, 1767.0], [23.6, 1774.0], [23.7, 1777.0], [23.8, 1787.0], [23.9, 1792.0], [24.0, 1802.0], [24.1, 1809.0], [24.2, 1815.0], [24.3, 1816.0], [24.4, 1817.0], [24.5, 1823.0], [24.6, 1825.0], [24.7, 1834.0], [24.8, 1840.0], [24.9, 1849.0], [25.0, 1855.0], [25.1, 1865.0], [25.2, 1882.0], [25.3, 1890.0], [25.4, 1896.0], [25.5, 1900.0], [25.6, 1905.0], [25.7, 1907.0], [25.8, 1912.0], [25.9, 1915.0], [26.0, 1932.0], [26.1, 1938.0], [26.2, 1941.0], [26.3, 1948.0], [26.4, 1956.0], [26.5, 1958.0], [26.6, 1963.0], [26.7, 1967.0], [26.8, 1972.0], [26.9, 1978.0], [27.0, 1988.0], [27.1, 1995.0], [27.2, 1998.0], [27.3, 2002.0], [27.4, 2016.0], [27.5, 2025.0], [27.6, 2031.0], [27.7, 2044.0], [27.8, 2052.0], [27.9, 2070.0], [28.0, 2074.0], [28.1, 2082.0], [28.2, 2085.0], [28.3, 2090.0], [28.4, 2101.0], [28.5, 2105.0], [28.6, 2107.0], [28.7, 2108.0], [28.8, 2113.0], [28.9, 2119.0], [29.0, 2124.0], [29.1, 2129.0], [29.2, 2136.0], [29.3, 2144.0], [29.4, 2149.0], [29.5, 2153.0], [29.6, 2160.0], [29.7, 2161.0], [29.8, 2166.0], [29.9, 2168.0], [30.0, 2181.0], [30.1, 2186.0], [30.2, 2199.0], [30.3, 2202.0], [30.4, 2207.0], [30.5, 2213.0], [30.6, 2218.0], [30.7, 2223.0], [30.8, 2230.0], [30.9, 2236.0], [31.0, 2242.0], [31.1, 2244.0], [31.2, 2250.0], [31.3, 2257.0], [31.4, 2265.0], [31.5, 2275.0], [31.6, 2278.0], [31.7, 2286.0], [31.8, 2289.0], [31.9, 2298.0], [32.0, 2298.0], [32.1, 2313.0], [32.2, 2320.0], [32.3, 2323.0], [32.4, 2330.0], [32.5, 2345.0], [32.6, 2349.0], [32.7, 2354.0], [32.8, 2356.0], [32.9, 2363.0], [33.0, 2367.0], [33.1, 2374.0], [33.2, 2380.0], [33.3, 2392.0], [33.4, 2394.0], [33.5, 2396.0], [33.6, 2403.0], [33.7, 2415.0], [33.8, 2418.0], [33.9, 2420.0], [34.0, 2430.0], [34.1, 2434.0], [34.2, 2439.0], [34.3, 2442.0], [34.4, 2449.0], [34.5, 2453.0], [34.6, 2459.0], [34.7, 2463.0], [34.8, 2467.0], [34.9, 2470.0], [35.0, 2473.0], [35.1, 2481.0], [35.2, 2484.0], [35.3, 2487.0], [35.4, 2492.0], [35.5, 2503.0], [35.6, 2507.0], [35.7, 2511.0], [35.8, 2514.0], [35.9, 2518.0], [36.0, 2520.0], [36.1, 2524.0], [36.2, 2525.0], [36.3, 2529.0], [36.4, 2538.0], [36.5, 2543.0], [36.6, 2544.0], [36.7, 2549.0], [36.8, 2554.0], [36.9, 2568.0], [37.0, 2570.0], [37.1, 2573.0], [37.2, 2578.0], [37.3, 2583.0], [37.4, 2586.0], [37.5, 2599.0], [37.6, 2601.0], [37.7, 2604.0], [37.8, 2607.0], [37.9, 2617.0], [38.0, 2622.0], [38.1, 2625.0], [38.2, 2630.0], [38.3, 2636.0], [38.4, 2638.0], [38.5, 2640.0], [38.6, 2641.0], [38.7, 2645.0], [38.8, 2649.0], [38.9, 2654.0], [39.0, 2659.0], [39.1, 2661.0], [39.2, 2663.0], [39.3, 2664.0], [39.4, 2667.0], [39.5, 2673.0], [39.6, 2676.0], [39.7, 2684.0], [39.8, 2688.0], [39.9, 2692.0], [40.0, 2697.0], [40.1, 2703.0], [40.2, 2707.0], [40.3, 2712.0], [40.4, 2716.0], [40.5, 2723.0], [40.6, 2727.0], [40.7, 2730.0], [40.8, 2736.0], [40.9, 2742.0], [41.0, 2745.0], [41.1, 2748.0], [41.2, 2760.0], [41.3, 2763.0], [41.4, 2769.0], [41.5, 2771.0], [41.6, 2775.0], [41.7, 2780.0], [41.8, 2789.0], [41.9, 2796.0], [42.0, 2800.0], [42.1, 2808.0], [42.2, 2809.0], [42.3, 2813.0], [42.4, 2818.0], [42.5, 2820.0], [42.6, 2824.0], [42.7, 2825.0], [42.8, 2828.0], [42.9, 2832.0], [43.0, 2841.0], [43.1, 2851.0], [43.2, 2855.0], [43.3, 2861.0], [43.4, 2863.0], [43.5, 2866.0], [43.6, 2873.0], [43.7, 2877.0], [43.8, 2880.0], [43.9, 2884.0], [44.0, 2894.0], [44.1, 2899.0], [44.2, 2900.0], [44.3, 2907.0], [44.4, 2911.0], [44.5, 2914.0], [44.6, 2920.0], [44.7, 2923.0], [44.8, 2927.0], [44.9, 2931.0], [45.0, 2938.0], [45.1, 2941.0], [45.2, 2946.0], [45.3, 2948.0], [45.4, 2956.0], [45.5, 2959.0], [45.6, 2961.0], [45.7, 2968.0], [45.8, 2970.0], [45.9, 2976.0], [46.0, 2980.0], [46.1, 2982.0], [46.2, 2986.0], [46.3, 2994.0], [46.4, 2998.0], [46.5, 3005.0], [46.6, 3010.0], [46.7, 3018.0], [46.8, 3021.0], [46.9, 3026.0], [47.0, 3032.0], [47.1, 3038.0], [47.2, 3044.0], [47.3, 3049.0], [47.4, 3049.0], [47.5, 3053.0], [47.6, 3064.0], [47.7, 3070.0], [47.8, 3075.0], [47.9, 3078.0], [48.0, 3083.0], [48.1, 3091.0], [48.2, 3095.0], [48.3, 3098.0], [48.4, 3103.0], [48.5, 3106.0], [48.6, 3109.0], [48.7, 3116.0], [48.8, 3118.0], [48.9, 3123.0], [49.0, 3136.0], [49.1, 3147.0], [49.2, 3151.0], [49.3, 3159.0], [49.4, 3163.0], [49.5, 3173.0], [49.6, 3174.0], [49.7, 3177.0], [49.8, 3180.0], [49.9, 3182.0], [50.0, 3189.0], [50.1, 3196.0], [50.2, 3211.0], [50.3, 3215.0], [50.4, 3218.0], [50.5, 3229.0], [50.6, 3230.0], [50.7, 3239.0], [50.8, 3247.0], [50.9, 3249.0], [51.0, 3251.0], [51.1, 3253.0], [51.2, 3258.0], [51.3, 3265.0], [51.4, 3270.0], [51.5, 3275.0], [51.6, 3286.0], [51.7, 3289.0], [51.8, 3297.0], [51.9, 3299.0], [52.0, 3300.0], [52.1, 3305.0], [52.2, 3312.0], [52.3, 3317.0], [52.4, 3325.0], [52.5, 3330.0], [52.6, 3332.0], [52.7, 3334.0], [52.8, 3338.0], [52.9, 3342.0], [53.0, 3347.0], [53.1, 3356.0], [53.2, 3369.0], [53.3, 3372.0], [53.4, 3384.0], [53.5, 3387.0], [53.6, 3390.0], [53.7, 3393.0], [53.8, 3397.0], [53.9, 3401.0], [54.0, 3406.0], [54.1, 3412.0], [54.2, 3413.0], [54.3, 3415.0], [54.4, 3417.0], [54.5, 3422.0], [54.6, 3428.0], [54.7, 3431.0], [54.8, 3436.0], [54.9, 3441.0], [55.0, 3444.0], [55.1, 3450.0], [55.2, 3459.0], [55.3, 3467.0], [55.4, 3472.0], [55.5, 3474.0], [55.6, 3482.0], [55.7, 3488.0], [55.8, 3498.0], [55.9, 3504.0], [56.0, 3508.0], [56.1, 3512.0], [56.2, 3515.0], [56.3, 3517.0], [56.4, 3523.0], [56.5, 3527.0], [56.6, 3534.0], [56.7, 3541.0], [56.8, 3544.0], [56.9, 3549.0], [57.0, 3553.0], [57.1, 3557.0], [57.2, 3560.0], [57.3, 3562.0], [57.4, 3567.0], [57.5, 3573.0], [57.6, 3574.0], [57.7, 3576.0], [57.8, 3581.0], [57.9, 3588.0], [58.0, 3598.0], [58.1, 3601.0], [58.2, 3604.0], [58.3, 3608.0], [58.4, 3613.0], [58.5, 3617.0], [58.6, 3621.0], [58.7, 3624.0], [58.8, 3627.0], [58.9, 3639.0], [59.0, 3651.0], [59.1, 3655.0], [59.2, 3664.0], [59.3, 3667.0], [59.4, 3670.0], [59.5, 3673.0], [59.6, 3680.0], [59.7, 3682.0], [59.8, 3683.0], [59.9, 3689.0], [60.0, 3697.0], [60.1, 3704.0], [60.2, 3709.0], [60.3, 3713.0], [60.4, 3716.0], [60.5, 3720.0], [60.6, 3723.0], [60.7, 3725.0], [60.8, 3727.0], [60.9, 3735.0], [61.0, 3744.0], [61.1, 3748.0], [61.2, 3752.0], [61.3, 3757.0], [61.4, 3763.0], [61.5, 3769.0], [61.6, 3775.0], [61.7, 3784.0], [61.8, 3788.0], [61.9, 3794.0], [62.0, 3797.0], [62.1, 3808.0], [62.2, 3813.0], [62.3, 3818.0], [62.4, 3822.0], [62.5, 3826.0], [62.6, 3829.0], [62.7, 3831.0], [62.8, 3834.0], [62.9, 3840.0], [63.0, 3847.0], [63.1, 3854.0], [63.2, 3859.0], [63.3, 3862.0], [63.4, 3872.0], [63.5, 3876.0], [63.6, 3880.0], [63.7, 3883.0], [63.8, 3889.0], [63.9, 3891.0], [64.0, 3895.0], [64.1, 3899.0], [64.2, 3900.0], [64.3, 3905.0], [64.4, 3913.0], [64.5, 3921.0], [64.6, 3923.0], [64.7, 3929.0], [64.8, 3934.0], [64.9, 3937.0], [65.0, 3942.0], [65.1, 3956.0], [65.2, 3960.0], [65.3, 3968.0], [65.4, 3971.0], [65.5, 3977.0], [65.6, 3980.0], [65.7, 3985.0], [65.8, 3991.0], [65.9, 4000.0], [66.0, 4004.0], [66.1, 4014.0], [66.2, 4019.0], [66.3, 4022.0], [66.4, 4031.0], [66.5, 4036.0], [66.6, 4039.0], [66.7, 4040.0], [66.8, 4047.0], [66.9, 4052.0], [67.0, 4054.0], [67.1, 4056.0], [67.2, 4062.0], [67.3, 4073.0], [67.4, 4078.0], [67.5, 4084.0], [67.6, 4085.0], [67.7, 4089.0], [67.8, 4095.0], [67.9, 4100.0], [68.0, 4104.0], [68.1, 4111.0], [68.2, 4114.0], [68.3, 4123.0], [68.4, 4127.0], [68.5, 4128.0], [68.6, 4132.0], [68.7, 4137.0], [68.8, 4139.0], [68.9, 4141.0], [69.0, 4148.0], [69.1, 4150.0], [69.2, 4154.0], [69.3, 4159.0], [69.4, 4162.0], [69.5, 4165.0], [69.6, 4167.0], [69.7, 4168.0], [69.8, 4181.0], [69.9, 4184.0], [70.0, 4188.0], [70.1, 4191.0], [70.2, 4199.0], [70.3, 4207.0], [70.4, 4208.0], [70.5, 4214.0], [70.6, 4223.0], [70.7, 4227.0], [70.8, 4234.0], [70.9, 4249.0], [71.0, 4256.0], [71.1, 4259.0], [71.2, 4266.0], [71.3, 4268.0], [71.4, 4275.0], [71.5, 4280.0], [71.6, 4283.0], [71.7, 4287.0], [71.8, 4294.0], [71.9, 4299.0], [72.0, 4301.0], [72.1, 4303.0], [72.2, 4309.0], [72.3, 4317.0], [72.4, 4321.0], [72.5, 4325.0], [72.6, 4329.0], [72.7, 4334.0], [72.8, 4340.0], [72.9, 4347.0], [73.0, 4352.0], [73.1, 4368.0], [73.2, 4371.0], [73.3, 4376.0], [73.4, 4380.0], [73.5, 4391.0], [73.6, 4401.0], [73.7, 4409.0], [73.8, 4412.0], [73.9, 4415.0], [74.0, 4420.0], [74.1, 4425.0], [74.2, 4435.0], [74.3, 4439.0], [74.4, 4446.0], [74.5, 4453.0], [74.6, 4455.0], [74.7, 4461.0], [74.8, 4470.0], [74.9, 4474.0], [75.0, 4478.0], [75.1, 4481.0], [75.2, 4484.0], [75.3, 4485.0], [75.4, 4492.0], [75.5, 4502.0], [75.6, 4504.0], [75.7, 4507.0], [75.8, 4511.0], [75.9, 4511.0], [76.0, 4515.0], [76.1, 4520.0], [76.2, 4525.0], [76.3, 4531.0], [76.4, 4534.0], [76.5, 4538.0], [76.6, 4540.0], [76.7, 4546.0], [76.8, 4552.0], [76.9, 4558.0], [77.0, 4561.0], [77.1, 4564.0], [77.2, 4570.0], [77.3, 4576.0], [77.4, 4579.0], [77.5, 4590.0], [77.6, 4599.0], [77.7, 4607.0], [77.8, 4616.0], [77.9, 4624.0], [78.0, 4643.0], [78.1, 4646.0], [78.2, 4649.0], [78.3, 4651.0], [78.4, 4659.0], [78.5, 4664.0], [78.6, 4674.0], [78.7, 4682.0], [78.8, 4687.0], [78.9, 4692.0], [79.0, 4699.0], [79.1, 4709.0], [79.2, 4717.0], [79.3, 4730.0], [79.4, 4734.0], [79.5, 4750.0], [79.6, 4761.0], [79.7, 4766.0], [79.8, 4782.0], [79.9, 4788.0], [80.0, 4791.0], [80.1, 4800.0], [80.2, 4807.0], [80.3, 4814.0], [80.4, 4828.0], [80.5, 4836.0], [80.6, 4841.0], [80.7, 4855.0], [80.8, 4862.0], [80.9, 4884.0], [81.0, 4887.0], [81.1, 4894.0], [81.2, 4898.0], [81.3, 4900.0], [81.4, 4902.0], [81.5, 4905.0], [81.6, 4923.0], [81.7, 4926.0], [81.8, 4929.0], [81.9, 4935.0], [82.0, 4937.0], [82.1, 4940.0], [82.2, 4945.0], [82.3, 4954.0], [82.4, 4966.0], [82.5, 4969.0], [82.6, 4972.0], [82.7, 4973.0], [82.8, 4981.0], [82.9, 4987.0], [83.0, 4991.0], [83.1, 5001.0], [83.2, 5004.0], [83.3, 5009.0], [83.4, 5023.0], [83.5, 5028.0], [83.6, 5028.0], [83.7, 5032.0], [83.8, 5039.0], [83.9, 5047.0], [84.0, 5048.0], [84.1, 5058.0], [84.2, 5059.0], [84.3, 5062.0], [84.4, 5068.0], [84.5, 5072.0], [84.6, 5076.0], [84.7, 5079.0], [84.8, 5080.0], [84.9, 5087.0], [85.0, 5091.0], [85.1, 5101.0], [85.2, 5106.0], [85.3, 5109.0], [85.4, 5115.0], [85.5, 5120.0], [85.6, 5125.0], [85.7, 5128.0], [85.8, 5136.0], [85.9, 5140.0], [86.0, 5146.0], [86.1, 5149.0], [86.2, 5154.0], [86.3, 5158.0], [86.4, 5165.0], [86.5, 5172.0], [86.6, 5177.0], [86.7, 5181.0], [86.8, 5184.0], [86.9, 5189.0], [87.0, 5193.0], [87.1, 5197.0], [87.2, 5202.0], [87.3, 5206.0], [87.4, 5208.0], [87.5, 5216.0], [87.6, 5225.0], [87.7, 5232.0], [87.8, 5236.0], [87.9, 5244.0], [88.0, 5245.0], [88.1, 5251.0], [88.2, 5260.0], [88.3, 5266.0], [88.4, 5268.0], [88.5, 5271.0], [88.6, 5278.0], [88.7, 5286.0], [88.8, 5294.0], [88.9, 5304.0], [89.0, 5310.0], [89.1, 5315.0], [89.2, 5322.0], [89.3, 5326.0], [89.4, 5328.0], [89.5, 5333.0], [89.6, 5338.0], [89.7, 5349.0], [89.8, 5355.0], [89.9, 5357.0], [90.0, 5365.0], [90.1, 5367.0], [90.2, 5372.0], [90.3, 5375.0], [90.4, 5381.0], [90.5, 5384.0], [90.6, 5398.0], [90.7, 5402.0], [90.8, 5414.0], [90.9, 5418.0], [91.0, 5425.0], [91.1, 5435.0], [91.2, 5442.0], [91.3, 5447.0], [91.4, 5452.0], [91.5, 5457.0], [91.6, 5465.0], [91.7, 5471.0], [91.8, 5476.0], [91.9, 5478.0], [92.0, 5482.0], [92.1, 5501.0], [92.2, 5513.0], [92.3, 5519.0], [92.4, 5525.0], [92.5, 5552.0], [92.6, 5560.0], [92.7, 5563.0], [92.8, 5572.0], [92.9, 5590.0], [93.0, 5597.0], [93.1, 5619.0], [93.2, 5631.0], [93.3, 5641.0], [93.4, 5643.0], [93.5, 5655.0], [93.6, 5676.0], [93.7, 5688.0], [93.8, 5704.0], [93.9, 5708.0], [94.0, 5721.0], [94.1, 5764.0], [94.2, 5780.0], [94.3, 5804.0], [94.4, 5818.0], [94.5, 5839.0], [94.6, 5859.0], [94.7, 5869.0], [94.8, 5878.0], [94.9, 5897.0], [95.0, 5921.0], [95.1, 5930.0], [95.2, 5954.0], [95.3, 5963.0], [95.4, 5981.0], [95.5, 5998.0], [95.6, 6011.0], [95.7, 6026.0], [95.8, 6031.0], [95.9, 6038.0], [96.0, 6066.0], [96.1, 6072.0], [96.2, 6085.0], [96.3, 6096.0], [96.4, 6120.0], [96.5, 6140.0], [96.6, 6161.0], [96.7, 6168.0], [96.8, 6192.0], [96.9, 6230.0], [97.0, 6234.0], [97.1, 6244.0], [97.2, 6266.0], [97.3, 6284.0], [97.4, 6301.0], [97.5, 6309.0], [97.6, 6319.0], [97.7, 6331.0], [97.8, 6363.0], [97.9, 6377.0], [98.0, 6389.0], [98.1, 6397.0], [98.2, 6410.0], [98.3, 6417.0], [98.4, 6434.0], [98.5, 6454.0], [98.6, 6472.0], [98.7, 6483.0], [98.8, 6493.0], [98.9, 6517.0], [99.0, 6555.0], [99.1, 6564.0], [99.2, 6621.0], [99.3, 6753.0], [99.4, 6803.0], [99.5, 6931.0], [99.6, 7178.0], [99.7, 7290.0], [99.8, 7422.0], [99.9, 7441.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 104.0, "series": [{"data": [[600.0, 63.0], [700.0, 42.0], [800.0, 34.0], [900.0, 18.0], [1000.0, 11.0], [1100.0, 12.0], [1200.0, 15.0], [1300.0, 28.0], [1400.0, 34.0], [1500.0, 35.0], [1600.0, 37.0], [1700.0, 47.0], [1800.0, 47.0], [1900.0, 53.0], [2000.0, 33.0], [2100.0, 56.0], [2200.0, 55.0], [2300.0, 45.0], [2400.0, 57.0], [2500.0, 62.0], [2600.0, 76.0], [2700.0, 58.0], [2800.0, 65.0], [2900.0, 69.0], [3000.0, 57.0], [3100.0, 54.0], [3200.0, 54.0], [3300.0, 57.0], [3400.0, 59.0], [3500.0, 67.0], [3600.0, 60.0], [3700.0, 59.0], [3800.0, 64.0], [3900.0, 53.0], [4000.0, 59.0], [4100.0, 71.0], [4200.0, 53.0], [4300.0, 48.0], [4500.0, 65.0], [4400.0, 56.0], [4600.0, 42.0], [4700.0, 31.0], [4800.0, 37.0], [5000.0, 60.0], [4900.0, 54.0], [5100.0, 62.0], [5300.0, 55.0], [5200.0, 51.0], [5400.0, 42.0], [5600.0, 23.0], [5500.0, 28.0], [5800.0, 19.0], [5700.0, 15.0], [5900.0, 18.0], [6100.0, 14.0], [6000.0, 25.0], [6200.0, 17.0], [6300.0, 22.0], [6400.0, 22.0], [6500.0, 10.0], [6600.0, 3.0], [6700.0, 3.0], [6900.0, 2.0], [6800.0, 2.0], [7100.0, 2.0], [7000.0, 1.0], [7200.0, 3.0], [7300.0, 2.0], [7400.0, 6.0], [100.0, 21.0], [200.0, 66.0], [300.0, 84.0], [400.0, 104.0], [500.0, 66.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 275.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2401.0, "series": [{"data": [[1.0, 324.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 275.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2401.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 592.8093333333331, "minX": 1.5496191E12, "maxY": 592.8093333333331, "series": [{"data": [[1.5496191E12, 592.8093333333331]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 230.33333333333334, "minX": 2.0, "maxY": 7497.0, "series": [{"data": [[2.0, 5781.5], [3.0, 5080.0], [5.0, 5382.0], [6.0, 5501.0], [7.0, 6669.0], [8.0, 6517.0], [9.0, 6410.0], [10.0, 5333.0], [11.0, 5361.0], [12.0, 5840.0], [13.0, 5355.0], [14.0, 5452.0], [15.0, 6431.0], [16.0, 7429.0], [17.0, 5028.0], [19.0, 5115.0], [20.0, 5690.5], [21.0, 5058.0], [22.0, 5462.0], [23.0, 6470.0], [25.0, 5201.5], [27.0, 5294.5], [28.0, 5080.0], [29.0, 5236.0], [31.0, 6402.0], [32.0, 5744.0], [35.0, 5374.0], [34.0, 5324.5], [37.0, 3429.0], [36.0, 5085.0], [39.0, 402.25000000000006], [38.0, 2706.0], [41.0, 2753.0], [40.0, 3061.5], [43.0, 938.5999999999999], [42.0, 1324.2], [45.0, 2784.0], [44.0, 3328.0], [47.0, 1993.6666666666667], [46.0, 2771.5], [49.0, 344.25], [48.0, 2402.666666666667], [51.0, 1917.3333333333333], [50.0, 1779.375], [53.0, 3976.0], [52.0, 297.2857142857143], [55.0, 1872.3333333333333], [54.0, 2020.25], [57.0, 898.75], [56.0, 1542.0], [59.0, 230.33333333333334], [58.0, 851.7777777777778], [61.0, 2874.5], [60.0, 305.0], [63.0, 2713.0], [62.0, 2723.0], [67.0, 2810.0], [66.0, 2183.666666666667], [65.0, 1537.75], [64.0, 1498.0], [71.0, 2022.6666666666667], [70.0, 2305.333333333333], [69.0, 976.0], [68.0, 2055.333333333333], [75.0, 346.0], [74.0, 1804.0], [72.0, 1947.3333333333333], [73.0, 5101.0], [79.0, 1542.0], [77.0, 2867.0], [76.0, 2867.5], [78.0, 6234.0], [80.0, 359.0], [81.0, 4246.333333333333], [83.0, 5192.0], [82.0, 7422.0], [84.0, 2691.5], [87.0, 1577.0], [86.0, 2835.5], [85.0, 5280.0], [88.0, 2459.3333333333335], [89.0, 366.0], [90.0, 2688.5], [91.0, 2827.5], [95.0, 932.5], [94.0, 1975.3333333333333], [93.0, 5323.0], [92.0, 5320.0], [97.0, 900.0000000000001], [96.0, 805.090909090909], [98.0, 1196.3333333333333], [99.0, 824.3636363636363], [100.0, 1083.857142857143], [101.0, 372.5], [102.0, 3241.75], [103.0, 7497.0], [107.0, 1203.1666666666667], [106.0, 1967.3333333333333], [105.0, 6517.0], [104.0, 5165.0], [111.0, 2821.6666666666665], [110.0, 5244.0], [109.0, 7422.0], [108.0, 4989.0], [112.0, 1239.5], [113.0, 419.0], [114.0, 2379.2], [115.0, 5231.0], [118.0, 2043.6666666666667], [119.0, 3254.5], [117.0, 1933.6666666666667], [116.0, 2785.0], [120.0, 391.0], [122.0, 1379.6], [121.0, 1632.7777777777778], [123.0, 588.0], [127.0, 2387.0], [126.0, 6770.0], [125.0, 5078.0], [124.0, 5529.5], [129.0, 936.1818181818182], [128.0, 1605.0], [130.0, 999.4166666666667], [134.0, 1172.2857142857142], [133.0, 1854.5], [132.0, 2263.666666666667], [131.0, 1688.25], [135.0, 2806.5], [137.0, 1504.0], [136.0, 1900.0], [138.0, 624.5], [139.0, 2396.2], [140.0, 2878.0], [142.0, 4991.0], [141.0, 5076.0], [147.0, 1927.25], [146.0, 3416.0], [148.0, 1166.8], [150.0, 2071.0], [149.0, 2767.5], [151.0, 1524.6], [145.0, 6297.0], [144.0, 5087.0], [152.0, 1288.8000000000002], [154.0, 1543.5714285714287], [153.0, 976.75], [155.0, 1046.6], [156.0, 951.3846153846154], [157.0, 781.5], [159.0, 1723.2], [158.0, 2612.4], [162.0, 3377.5], [161.0, 2615.0], [160.0, 1617.8], [167.0, 1423.4285714285716], [166.0, 1652.6], [165.0, 1532.6666666666665], [164.0, 5184.0], [163.0, 6308.0], [168.0, 4089.0], [170.0, 2392.333333333333], [169.0, 666.5], [172.0, 722.0], [171.0, 4385.0], [173.0, 4480.333333333333], [175.0, 2635.8], [174.0, 528.0], [177.0, 2154.75], [176.0, 2161.333333333333], [178.0, 1735.0], [180.0, 3668.5], [179.0, 615.0], [183.0, 3500.25], [181.0, 4898.0], [188.0, 3253.5], [189.0, 2583.666666666667], [190.0, 1750.5], [191.0, 1335.142857142857], [187.0, 5161.0], [186.0, 5202.0], [185.0, 6234.0], [184.0, 6910.0], [192.0, 1312.1666666666665], [193.0, 2042.25], [195.0, 1953.0], [196.0, 1461.5], [197.0, 3653.0], [199.0, 638.0], [198.0, 1924.0], [194.0, 7210.0], [201.0, 2824.5], [202.0, 865.8], [203.0, 2778.2], [204.0, 963.0], [206.0, 1809.8], [205.0, 3041.25], [207.0, 4470.0], [200.0, 5885.0], [208.0, 2400.0], [209.0, 3148.0], [210.0, 2611.5], [211.0, 2692.5], [215.0, 4529.0], [214.0, 4525.0], [213.0, 5068.0], [212.0, 4684.0], [218.0, 1864.5], [219.0, 3103.0], [223.0, 1844.0], [222.0, 4831.0], [221.0, 4545.0], [220.0, 4321.0], [217.0, 5151.0], [224.0, 1531.5], [225.0, 2779.5], [231.0, 4221.0], [230.0, 4124.0], [229.0, 4977.0], [228.0, 6277.0], [227.0, 5805.0], [226.0, 6621.0], [239.0, 6312.0], [238.0, 4643.0], [237.0, 6169.0], [236.0, 5815.0], [235.0, 5477.0], [234.0, 6244.0], [233.0, 6266.0], [232.0, 4299.0], [247.0, 4207.0], [246.0, 5482.0], [245.0, 4472.0], [244.0, 5316.5], [242.0, 5579.0], [241.0, 5470.0], [240.0, 4347.0], [255.0, 5694.0], [254.0, 4791.0], [253.0, 6425.5], [251.0, 4651.0], [250.0, 5581.0], [249.0, 6487.0], [248.0, 4214.0], [270.0, 5646.0], [271.0, 4166.0], [269.0, 5628.0], [268.0, 4535.0], [267.0, 6168.0], [266.0, 5111.0], [265.0, 5258.0], [264.0, 5049.0], [263.0, 5531.0], [259.0, 5106.0], [258.0, 6417.0], [257.0, 5785.0], [256.0, 5353.0], [261.0, 5263.0], [286.0, 5179.0], [287.0, 6564.0], [285.0, 4534.0], [284.0, 5815.0], [282.0, 5399.0], [281.0, 6389.0], [280.0, 6331.0], [279.0, 4564.0], [273.0, 4562.0], [272.0, 5338.0], [275.0, 5058.0], [274.0, 4828.0], [278.0, 5266.0], [277.0, 6563.0], [276.0, 4926.0], [302.0, 4929.0], [303.0, 5251.0], [301.0, 6440.0], [300.0, 5181.0], [299.0, 5912.0], [298.0, 4546.0], [297.0, 5839.0], [296.0, 3937.0], [295.0, 6119.0], [289.0, 5471.0], [288.0, 6555.0], [291.0, 5869.0], [290.0, 4557.0], [294.0, 4396.0], [293.0, 4899.0], [292.0, 5954.0], [318.0, 4540.0], [319.0, 4276.0], [317.0, 6493.0], [316.0, 4405.0], [315.0, 4928.0], [314.0, 4364.0], [313.0, 5979.0], [312.0, 6163.0], [311.0, 4325.0], [305.0, 6389.0], [304.0, 6230.0], [307.0, 6165.0], [306.0, 5420.0], [310.0, 4895.0], [309.0, 3931.0], [308.0, 5012.0], [334.0, 5866.0], [335.0, 5139.0], [333.0, 5481.0], [332.0, 5697.0], [331.0, 5352.0], [330.0, 5197.0], [329.0, 6075.0], [328.0, 4577.0], [327.0, 4515.0], [321.0, 6159.0], [320.0, 4451.0], [323.0, 6066.0], [322.0, 4755.0], [326.0, 4694.0], [325.0, 4824.0], [324.0, 5447.0], [350.0, 4769.0], [351.0, 5804.0], [349.0, 5286.0], [348.0, 6363.0], [347.0, 4042.0], [346.0, 5457.0], [345.0, 6051.0], [344.0, 4016.0], [343.0, 5381.0], [336.0, 5355.0], [339.0, 6026.0], [338.0, 5998.5], [342.0, 3914.0], [341.0, 6132.0], [340.0, 4192.0], [366.0, 2629.0], [367.0, 2359.0], [365.0, 2163.0], [364.0, 2323.0], [363.0, 2107.5], [362.0, 2943.666666666667], [361.0, 3946.5], [360.0, 5791.0], [359.0, 3905.0], [353.0, 5635.0], [355.0, 4967.0], [354.0, 5009.0], [358.0, 4272.0], [357.0, 5928.0], [356.0, 6177.0], [369.0, 2915.333333333333], [368.0, 3408.0], [375.0, 4294.0], [371.0, 1535.0], [370.0, 4339.0], [372.0, 3646.3333333333335], [374.0, 3291.5], [373.0, 2925.0], [380.0, 2962.0], [381.0, 2634.333333333333], [382.0, 3069.333333333333], [383.0, 2919.0], [377.0, 3968.0], [376.0, 6085.0], [379.0, 5560.0], [378.0, 4699.0], [398.0, 5704.0], [386.0, 1643.5], [387.0, 2602.0], [389.0, 3586.5], [391.0, 4140.0], [385.0, 4530.0], [384.0, 4168.0], [390.0, 6232.0], [388.0, 3487.0], [399.0, 5197.0], [393.0, 5016.5], [397.0, 5059.0], [396.0, 4811.0], [395.0, 4649.0], [394.0, 4937.0], [402.0, 2085.25], [400.0, 2978.5], [403.0, 2832.0], [401.0, 1926.125], [405.0, 3068.0], [404.0, 5894.0], [406.0, 3515.5], [407.0, 4522.0], [408.0, 3021.0], [411.0, 5670.5], [409.0, 4299.0], [415.0, 5818.0], [412.0, 2631.0], [413.0, 2418.75], [414.0, 2624.6666666666665], [429.0, 4681.5], [418.0, 3774.5], [416.0, 3162.0], [417.0, 5244.0], [419.0, 2640.3333333333335], [420.0, 3470.0], [422.0, 4327.0], [421.0, 4352.0], [423.0, 5827.0], [426.0, 2179.0], [425.0, 2582.0], [430.0, 6052.0], [424.0, 5096.0], [427.0, 4368.0], [435.0, 3082.0], [433.0, 2242.75], [432.0, 2917.75], [439.0, 4033.5], [434.0, 3546.5], [436.0, 2029.75], [437.0, 3424.5], [442.0, 2063.2], [444.0, 2579.0], [441.0, 3229.5], [440.0, 4924.0], [446.0, 2788.0], [447.0, 5572.0], [445.0, 2450.5], [443.0, 3225.0], [460.0, 2518.6666666666665], [450.0, 2424.4], [449.0, 2461.2], [448.0, 4100.0], [451.0, 3596.5], [455.0, 3011.5], [454.0, 4410.0], [453.0, 5841.0], [452.0, 4878.0], [456.0, 2939.6666666666665], [457.0, 2992.5], [458.0, 3072.0], [459.0, 2719.0], [461.0, 3529.0], [463.0, 2877.0], [462.0, 3526.0], [476.0, 3575.0], [466.0, 2988.0], [465.0, 3249.0], [471.0, 5619.0], [464.0, 4515.0], [467.0, 3055.5], [469.0, 2647.0], [468.0, 3763.0], [470.0, 3524.5], [472.0, 2810.0], [473.0, 2548.3333333333335], [474.0, 4981.0], [477.0, 4347.0], [478.0, 3641.5], [479.0, 3776.0], [494.0, 3601.0], [484.0, 3685.0], [485.0, 2801.0], [490.0, 3687.0], [493.0, 3587.5], [495.0, 5325.0], [492.0, 4333.0], [487.0, 3721.0], [483.0, 3812.0], [482.0, 3797.0], [481.0, 4862.0], [480.0, 4511.0], [486.0, 3899.0], [491.0, 5288.0], [489.0, 5329.0], [488.0, 3900.0], [510.0, 649.0], [496.0, 3658.0], [498.0, 4096.333333333333], [499.0, 4887.0], [501.0, 2259.5], [500.0, 5025.0], [503.0, 3624.0], [502.0, 5467.0], [505.0, 2834.0], [507.0, 4734.0], [506.0, 4905.0], [511.0, 4066.0], [504.0, 4651.0], [509.0, 3888.0], [508.0, 5641.0], [519.0, 2981.666666666667], [513.0, 2918.0], [512.0, 3599.5], [524.0, 2471.333333333333], [526.0, 2400.0], [525.0, 4151.0], [527.0, 3139.0], [515.0, 2310.666666666667], [514.0, 4131.0], [516.0, 2657.0], [518.0, 3012.25], [517.0, 4967.0], [521.0, 3122.0], [520.0, 3782.0], [528.0, 2771.0], [543.0, 2585.6666666666665], [542.0, 1833.4], [541.0, 2501.0], [540.0, 4508.0], [539.0, 5454.0], [536.0, 3056.0], [537.0, 3304.5], [538.0, 2814.0], [529.0, 3781.0], [532.0, 2790.0], [531.0, 4782.5], [533.0, 5360.0], [535.0, 3323.5], [534.0, 6565.0], [522.0, 2545.5], [523.0, 2395.857142857143], [574.0, 3822.0], [546.0, 3034.5], [548.0, 3793.0], [547.0, 5519.0], [549.0, 5373.0], [551.0, 4157.0], [550.0, 4048.0], [569.0, 3200.6666666666665], [571.0, 3434.0], [570.0, 4456.0], [573.0, 6358.0], [572.0, 5170.0], [575.0, 2453.0], [568.0, 2809.5], [552.0, 2702.5], [553.0, 3911.0], [555.0, 3545.0], [554.0, 4645.0], [556.0, 2902.0], [557.0, 2757.6666666666665], [558.0, 3844.0], [560.0, 2975.6666666666665], [559.0, 3257.3333333333335], [545.0, 5477.0], [544.0, 5330.0], [561.0, 2403.0], [562.0, 4973.0], [563.0, 2757.0], [564.0, 2713.6], [565.0, 3193.0], [567.0, 3640.0], [566.0, 2832.3333333333335], [602.0, 4638.0], [576.0, 2827.5], [584.0, 2446.0], [587.0, 3300.0], [586.0, 4041.5], [589.0, 4256.0], [588.0, 4923.0], [590.0, 2760.0], [591.0, 2807.5], [593.0, 3315.0], [596.0, 3598.0], [595.0, 3814.0], [594.0, 3335.0], [607.0, 3401.0], [592.0, 4935.0], [597.0, 3195.0], [598.0, 2637.5], [599.0, 5106.0], [600.0, 3083.5], [583.0, 5103.0], [582.0, 5427.0], [581.0, 6393.0], [580.0, 4538.0], [579.0, 3416.0], [578.0, 4037.0], [577.0, 6404.0], [603.0, 4620.0], [605.0, 3320.0], [604.0, 3350.0], [606.0, 4202.5], [632.0, 3029.3333333333335], [622.0, 2822.3333333333335], [609.0, 2972.0], [611.0, 4128.0], [610.0, 5366.0], [623.0, 4439.0], [608.0, 3969.0], [612.0, 3025.0], [614.0, 3255.0], [625.0, 3131.0], [624.0, 3601.0], [638.0, 2927.0], [637.0, 4288.5], [635.0, 4052.0], [634.0, 3725.5], [639.0, 2139.3333333333335], [626.0, 2904.75], [627.0, 3395.0], [629.0, 3054.5], [631.0, 3114.5], [630.0, 4143.0], [628.0, 2369.3333333333335], [616.0, 2976.25], [618.0, 2503.25], [617.0, 3440.0], [619.0, 2917.5], [621.0, 3971.5], [620.0, 3567.0], [645.0, 1933.4], [641.0, 3407.3333333333335], [640.0, 2208.6666666666665], [655.0, 3655.5], [654.0, 4435.0], [652.0, 3317.0], [653.0, 2682.0], [651.0, 2853.5], [650.0, 3933.5], [642.0, 2395.8333333333335], [643.0, 2488.0], [644.0, 2304.3333333333335], [646.0, 2912.0], [647.0, 3501.0], [665.0, 2990.5], [666.0, 6235.0], [668.0, 3016.0], [667.0, 2742.5], [670.0, 1825.75], [671.0, 2504.25], [669.0, 2773.0], [664.0, 3272.0], [658.0, 2076.0], [660.0, 3245.0], [661.0, 2765.5], [663.0, 2531.0], [662.0, 3248.0], [659.0, 2926.5], [657.0, 2867.6], [648.0, 2836.3333333333335], [649.0, 3451.0], [696.0, 2579.75], [676.0, 2364.882352941177], [673.0, 2552.625], [672.0, 2422.8181818181815], [686.0, 2968.25], [685.0, 3507.0], [684.0, 6071.0], [683.0, 5538.0], [682.0, 6209.0], [674.0, 2262.0], [677.0, 2308.4], [675.0, 3545.0], [678.0, 2844.0], [679.0, 2634.166666666667], [697.0, 2785.4999999999995], [698.0, 2787.25], [701.0, 2968.8333333333335], [703.0, 2646.0], [702.0, 3310.3333333333335], [699.0, 2525.8750000000005], [700.0, 2752.266666666667], [688.0, 2762.5], [689.0, 3034.0], [691.0, 2882.0], [692.0, 3076.6], [695.0, 2585.0769230769233], [694.0, 2407.0], [693.0, 2243.8333333333335], [690.0, 2970.0], [680.0, 3626.0], [681.0, 3841.0], [707.0, 2725.6153846153848], [704.0, 2890.25], [718.0, 2493.6], [719.0, 2596.333333333333], [716.0, 3655.3333333333335], [717.0, 4220.333333333333], [714.0, 3389.0], [715.0, 2557.3333333333335], [705.0, 3105.5454545454545], [706.0, 2815.571428571429], [709.0, 2551.909090909091], [710.0, 2652.545454545455], [711.0, 2516.875], [728.0, 5961.0], [730.0, 3789.0], [729.0, 4687.0], [731.0, 3545.5], [733.0, 3377.5], [732.0, 5562.0], [735.0, 4266.0], [734.0, 4126.0], [720.0, 2994.333333333333], [721.0, 3702.3333333333335], [723.0, 3788.5], [725.0, 4236.5], [724.0, 3727.0], [727.0, 3090.0], [726.0, 3820.6666666666665], [712.0, 3395.0], [713.0, 4765.0], [708.0, 2996.5], [741.0, 2448.3333333333335], [747.0, 2813.6666666666665], [738.0, 2918.0], [740.0, 4520.0], [739.0, 5424.0], [737.0, 2704.5], [736.0, 3709.5], [752.0, 2628.3333333333335], [767.0, 2564.0], [766.0, 5418.0], [765.0, 2657.5], [764.0, 2757.333333333333], [763.0, 5302.0], [762.0, 3729.0], [761.0, 2888.0], [760.0, 4223.0], [743.0, 6309.0], [742.0, 4800.0], [754.0, 3033.8750000000005], [753.0, 3620.0], [755.0, 2889.1111111111113], [757.0, 2952.6363636363635], [758.0, 3145.0], [759.0, 3192.5], [756.0, 2806.333333333334], [744.0, 3462.666666666667], [745.0, 2570.75], [746.0, 3484.857142857143], [749.0, 3065.0], [748.0, 5206.0], [750.0, 2616.0], [751.0, 6067.0], [796.0, 2893.0], [769.0, 3408.6666666666665], [770.0, 4262.5], [768.0, 4034.3333333333335], [783.0, 2487.4], [771.0, 3162.6666666666665], [776.0, 4273.0], [777.0, 3088.0], [778.0, 3315.0], [781.0, 2735.2], [780.0, 2843.0], [779.0, 3874.0], [782.0, 3471.1666666666665], [784.0, 3077.2], [797.0, 3992.0], [798.0, 4949.0], [799.0, 3403.0], [794.0, 3293.3333333333335], [793.0, 2981.0], [792.0, 3962.0], [775.0, 4504.0], [774.0, 2454.0], [773.0, 4940.0], [772.0, 4709.0], [795.0, 2937.2499999999995], [785.0, 3003.923076923077], [786.0, 3114.25], [787.0, 3979.2], [788.0, 2491.75], [789.0, 2916.5714285714284], [790.0, 3050.75], [791.0, 4514.0], [805.0, 2656.3333333333335], [801.0, 3737.75], [800.0, 3129.0], [815.0, 2751.6666666666665], [814.0, 4070.3333333333335], [813.0, 5012.0], [812.0, 4114.0], [811.0, 4507.0], [802.0, 3013.8], [803.0, 3650.0], [804.0, 3384.0], [807.0, 2765.0], [806.0, 3462.0], [816.0, 3799.0], [818.0, 5540.0], [817.0, 5047.0], [820.0, 4250.0], [819.0, 2727.0], [831.0, 3897.3333333333335], [830.0, 3725.0], [828.0, 2906.615384615385], [829.0, 2966.6666666666665], [827.0, 3254.6], [826.0, 3114.0], [825.0, 2762.6666666666665], [823.0, 3764.0], [822.0, 3631.75], [824.0, 3274.5], [810.0, 2615.857142857143], [809.0, 3762.6666666666665], [808.0, 5152.0], [839.0, 2930.6666666666665], [833.0, 3016.2], [832.0, 3127.5], [846.0, 3262.0], [847.0, 4687.0], [834.0, 3883.0], [836.0, 4259.0], [835.0, 4068.0], [837.0, 3597.6666666666665], [848.0, 3617.5], [849.0, 4983.0], [860.0, 3461.6666666666665], [862.0, 3705.0], [861.0, 3053.0], [863.0, 4303.0], [859.0, 3319.8333333333335], [858.0, 3696.8333333333335], [857.0, 2876.4], [856.0, 3198.928571428572], [851.0, 3422.6666666666665], [852.0, 3647.0], [854.0, 3387.0], [853.0, 4121.0], [855.0, 3086.6666666666665], [850.0, 3669.3333333333335], [838.0, 2435.5], [840.0, 3169.285714285714], [841.0, 3723.3333333333335], [843.0, 3522.0], [842.0, 4492.0], [844.0, 4158.5], [845.0, 2888.0], [871.0, 4215.333333333333], [867.0, 3169.8571428571427], [864.0, 2641.0], [877.0, 3309.8333333333335], [876.0, 5005.0], [878.0, 4954.0], [879.0, 4734.0], [865.0, 3520.5], [866.0, 3097.0], [870.0, 3093.0], [869.0, 2942.2], [868.0, 3321.5], [881.0, 4421.5], [880.0, 2507.0], [882.0, 5683.0], [895.0, 3977.0], [894.0, 3757.0], [893.0, 3485.0], [891.0, 4340.0], [890.0, 3930.0], [889.0, 4403.0], [888.0, 4855.0], [884.0, 3843.25], [883.0, 3188.0], [885.0, 3624.166666666667], [886.0, 3339.5], [887.0, 3986.0], [873.0, 3931.5], [872.0, 5712.0], [874.0, 4453.0], [875.0, 3467.0], [924.0, 4264.0], [927.0, 4814.0], [913.0, 5368.0], [912.0, 4611.0], [915.0, 5765.0], [914.0, 4929.0], [917.0, 5688.0], [916.0, 5224.0], [926.0, 4336.0], [925.0, 1907.0], [923.0, 4505.0], [922.0, 3900.0], [921.0, 2025.0], [920.0, 4302.0], [911.0, 4984.0], [896.0, 3991.0], [899.0, 4414.0], [898.0, 5091.5], [901.0, 4471.0], [900.0, 5721.0], [903.0, 4328.0], [902.0, 3615.0], [910.0, 3923.0], [909.0, 4747.0], [908.0, 3921.0], [907.0, 5877.0], [906.0, 5054.0], [905.0, 5143.0], [904.0, 4078.0], [919.0, 1891.0], [918.0, 3830.0], [953.0, 3832.0], [958.0, 4731.0], [959.0, 4378.0], [945.0, 5235.0], [944.0, 5719.0], [947.0, 4417.0], [946.0, 3709.0], [949.0, 4073.0], [948.0, 4284.0], [957.0, 4538.0], [956.0, 3713.0], [955.0, 2739.5], [952.0, 3619.0], [935.0, 4884.0], [934.0, 4482.0], [933.0, 4446.0], [932.0, 4604.0], [931.0, 4372.0], [930.0, 3859.0], [929.0, 4616.0], [928.0, 2909.0], [943.0, 5023.0], [942.0, 4459.5], [940.0, 5446.0], [939.0, 4900.0], [938.0, 4491.0], [937.0, 4502.0], [936.0, 4081.0], [951.0, 5172.0], [950.0, 5560.0], [985.0, 3943.0], [990.0, 5063.0], [991.0, 3906.0], [977.0, 4195.0], [976.0, 5174.0], [979.0, 4446.0], [978.0, 2625.0], [981.0, 3667.0], [980.0, 5372.0], [989.0, 3662.0], [988.0, 3784.0], [987.0, 4334.0], [984.0, 4716.0], [967.0, 4165.0], [966.0, 4094.0], [965.0, 3603.0], [964.0, 3712.0], [963.0, 3934.5], [961.0, 3980.0], [960.0, 4424.0], [975.0, 5518.0], [974.0, 3899.0], [973.0, 4199.0], [972.0, 4033.0], [971.0, 4786.0], [970.0, 6297.0], [969.0, 4890.0], [968.0, 4650.0], [983.0, 4149.0], [982.0, 4762.0], [1016.0, 3756.0], [1021.0, 3481.0], [1023.0, 3812.0], [1009.0, 4790.0], [1008.0, 5513.0], [1011.0, 5140.0], [1010.0, 6120.0], [1020.0, 3882.0], [1019.0, 4130.5], [1017.0, 3450.0], [1007.0, 4323.0], [993.0, 5449.0], [992.0, 3984.0], [995.0, 4281.0], [994.0, 3872.0], [997.0, 4634.0], [996.0, 4704.0], [999.0, 4268.0], [998.0, 5357.0], [1006.0, 4973.0], [1005.0, 4072.0], [1004.0, 5376.0], [1003.0, 5413.0], [1002.0, 4381.0], [1001.0, 4002.0], [1000.0, 5307.0], [1015.0, 4234.0], [1014.0, 4560.0], [1013.0, 4154.0], [1012.0, 3353.0], [1076.0, 3866.5000000000005], [1078.0, 3769.0], [1080.0, 3511.5], [1056.0, 3625.3333333333335], [1084.0, 4599.5], [1086.0, 3352.5], [1082.0, 3949.5], [1058.0, 3545.1111111111113], [1060.0, 3970.25], [1062.0, 3653.5], [1064.0, 3935.4444444444443], [1066.0, 3600.6666666666665], [1068.0, 3659.0], [1070.0, 4052.25], [1074.0, 3813.5], [1072.0, 3575.6250000000005], [1038.0, 3708.0], [1036.0, 4133.0], [1034.0, 3550.0], [1032.0, 4730.0], [1030.0, 1742.0], [1028.0, 3474.0], [1026.0, 4481.0], [1024.0, 4409.0], [1054.0, 3444.3333333333335], [1052.0, 3421.3333333333335], [1050.0, 3804.166666666667], [1048.0, 3371.3333333333335], [1046.0, 3891.25], [1044.0, 3921.0], [1042.0, 3311.5], [1040.0, 2993.0], [1094.0, 3338.0], [1102.0, 3922.75], [1112.0, 3869.3333333333335], [1108.0, 4106.25], [1114.0, 4123.666666666667], [1116.0, 3911.0], [1088.0, 4294.0], [1090.0, 3924.0], [1092.0, 3334.0], [1118.0, 3683.0], [1110.0, 4193.2], [1106.0, 3784.5], [1104.0, 3428.0], [1098.0, 3650.25], [1096.0, 3204.5], [1100.0, 3881.5], [1136.0, 3638.3333333333335], [1140.0, 3478.5], [1142.0, 4217.333333333333], [1144.0, 3535.428571428571], [1146.0, 3494.6666666666665], [1148.0, 4202.5], [1120.0, 3151.0], [1150.0, 3524.5], [1138.0, 5315.0], [1122.0, 3235.0], [1126.0, 3289.0], [1130.0, 3926.5], [1134.0, 3949.5], [1132.0, 3795.5], [1128.0, 3961.0], [1124.0, 3189.0], [1158.0, 4023.0], [1160.0, 5414.0], [1152.0, 4887.666666666667], [1154.0, 3843.0], [1156.0, 2944.0], [1164.0, 4661.333333333333], [1162.0, 4139.0], [1166.0, 3266.5], [1075.0, 3652.125], [1077.0, 3882.75], [1063.0, 3479.8888888888887], [1079.0, 3746.3333333333335], [1087.0, 4728.0], [1085.0, 4907.0], [1083.0, 3551.8333333333335], [1081.0, 4032.0], [1057.0, 3883.0], [1059.0, 3690.3333333333335], [1061.0, 3857.7000000000003], [1065.0, 3559.3333333333335], [1067.0, 3992.0], [1069.0, 4066.0], [1071.0, 3508.6666666666665], [1073.0, 4691.333333333333], [1039.0, 3822.833333333333], [1037.0, 4368.333333333333], [1035.0, 4114.0], [1033.0, 4970.0], [1031.0, 4150.0], [1029.0, 4181.0], [1027.0, 4975.0], [1025.0, 3562.0], [1055.0, 3385.5], [1053.0, 4301.4], [1051.0, 3674.25], [1049.0, 3388.25], [1047.0, 3803.8], [1045.0, 3639.6666666666665], [1043.0, 3845.3333333333335], [1041.0, 4773.333333333333], [1095.0, 4128.0], [1097.0, 3718.0], [1105.0, 3230.0], [1109.0, 3659.3333333333335], [1111.0, 3994.4], [1113.0, 4896.5], [1115.0, 3764.6666666666665], [1119.0, 3439.0], [1089.0, 4435.0], [1091.0, 3218.0], [1093.0, 4036.0], [1117.0, 4380.0], [1107.0, 3573.0], [1101.0, 3961.0], [1099.0, 3801.5], [1103.0, 3771.8], [1141.0, 4009.5], [1143.0, 4682.0], [1147.0, 4278.0], [1149.0, 3887.0], [1151.0, 4515.0], [1145.0, 3683.9], [1139.0, 4441.0], [1137.0, 4646.0], [1121.0, 2994.0], [1123.0, 3120.5], [1125.0, 3223.3333333333335], [1127.0, 3934.5], [1129.0, 3503.0], [1131.0, 3463.75], [1133.0, 3696.0], [1135.0, 3178.0], [1155.0, 3890.0], [1153.0, 3168.0], [1159.0, 4098.5], [1157.0, 3498.0], [1163.0, 3899.75], [1161.0, 2985.5], [1165.0, 4085.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[592.8093333333335, 3148.505333333332]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1166.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12700.0, "minX": 1.5496191E12, "maxY": 21047.666666666668, "series": [{"data": [[1.5496191E12, 21047.666666666668]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5496191E12, 12700.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3148.505333333332, "minX": 1.5496191E12, "maxY": 3148.505333333332, "series": [{"data": [[1.5496191E12, 3148.505333333332]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496191E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3148.4973333333323, "minX": 1.5496191E12, "maxY": 3148.4973333333323, "series": [{"data": [[1.5496191E12, 3148.4973333333323]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496191E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 79.41500000000005, "minX": 1.5496191E12, "maxY": 79.41500000000005, "series": [{"data": [[1.5496191E12, 79.41500000000005]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496191E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 138.0, "minX": 1.5496191E12, "maxY": 7497.0, "series": [{"data": [[1.5496191E12, 7497.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5496191E12, 138.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5496191E12, 5364.6]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5496191E12, 6554.729999999994]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5496191E12, 5920.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3191.5, "minX": 50.0, "maxY": 3191.5, "series": [{"data": [[50.0, 3191.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3191.5, "minX": 50.0, "maxY": 3191.5, "series": [{"data": [[50.0, 3191.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5496191E12, "maxY": 50.0, "series": [{"data": [[1.5496191E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5496191E12, "maxY": 50.0, "series": [{"data": [[1.5496191E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496191E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5496191E12, "maxY": 50.0, "series": [{"data": [[1.5496191E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496191E12, "title": "Transactions Per Second"}},
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
