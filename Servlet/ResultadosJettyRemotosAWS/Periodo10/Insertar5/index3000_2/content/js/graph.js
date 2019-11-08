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
        data: {"result": {"minY": 98.0, "minX": 0.0, "maxY": 7067.0, "series": [{"data": [[0.0, 98.0], [0.1, 112.0], [0.2, 116.0], [0.3, 118.0], [0.4, 122.0], [0.5, 128.0], [0.6, 131.0], [0.7, 137.0], [0.8, 139.0], [0.9, 142.0], [1.0, 143.0], [1.1, 144.0], [1.2, 145.0], [1.3, 150.0], [1.4, 150.0], [1.5, 151.0], [1.6, 153.0], [1.7, 154.0], [1.8, 156.0], [1.9, 157.0], [2.0, 159.0], [2.1, 162.0], [2.2, 164.0], [2.3, 165.0], [2.4, 166.0], [2.5, 169.0], [2.6, 170.0], [2.7, 171.0], [2.8, 174.0], [2.9, 177.0], [3.0, 179.0], [3.1, 181.0], [3.2, 182.0], [3.3, 184.0], [3.4, 185.0], [3.5, 187.0], [3.6, 187.0], [3.7, 190.0], [3.8, 192.0], [3.9, 193.0], [4.0, 198.0], [4.1, 202.0], [4.2, 203.0], [4.3, 204.0], [4.4, 208.0], [4.5, 209.0], [4.6, 211.0], [4.7, 212.0], [4.8, 216.0], [4.9, 219.0], [5.0, 223.0], [5.1, 226.0], [5.2, 228.0], [5.3, 229.0], [5.4, 230.0], [5.5, 235.0], [5.6, 241.0], [5.7, 244.0], [5.8, 246.0], [5.9, 249.0], [6.0, 250.0], [6.1, 254.0], [6.2, 255.0], [6.3, 257.0], [6.4, 262.0], [6.5, 267.0], [6.6, 270.0], [6.7, 274.0], [6.8, 276.0], [6.9, 278.0], [7.0, 282.0], [7.1, 285.0], [7.2, 288.0], [7.3, 294.0], [7.4, 297.0], [7.5, 297.0], [7.6, 299.0], [7.7, 303.0], [7.8, 305.0], [7.9, 309.0], [8.0, 312.0], [8.1, 314.0], [8.2, 317.0], [8.3, 327.0], [8.4, 329.0], [8.5, 333.0], [8.6, 338.0], [8.7, 341.0], [8.8, 345.0], [8.9, 348.0], [9.0, 353.0], [9.1, 358.0], [9.2, 363.0], [9.3, 364.0], [9.4, 366.0], [9.5, 368.0], [9.6, 374.0], [9.7, 385.0], [9.8, 388.0], [9.9, 390.0], [10.0, 391.0], [10.1, 393.0], [10.2, 397.0], [10.3, 405.0], [10.4, 409.0], [10.5, 410.0], [10.6, 415.0], [10.7, 423.0], [10.8, 426.0], [10.9, 430.0], [11.0, 447.0], [11.1, 453.0], [11.2, 454.0], [11.3, 458.0], [11.4, 464.0], [11.5, 468.0], [11.6, 477.0], [11.7, 480.0], [11.8, 485.0], [11.9, 488.0], [12.0, 492.0], [12.1, 497.0], [12.2, 506.0], [12.3, 510.0], [12.4, 524.0], [12.5, 527.0], [12.6, 534.0], [12.7, 546.0], [12.8, 555.0], [12.9, 561.0], [13.0, 565.0], [13.1, 569.0], [13.2, 571.0], [13.3, 574.0], [13.4, 578.0], [13.5, 584.0], [13.6, 594.0], [13.7, 599.0], [13.8, 603.0], [13.9, 611.0], [14.0, 616.0], [14.1, 621.0], [14.2, 627.0], [14.3, 633.0], [14.4, 643.0], [14.5, 653.0], [14.6, 659.0], [14.7, 662.0], [14.8, 666.0], [14.9, 669.0], [15.0, 671.0], [15.1, 684.0], [15.2, 689.0], [15.3, 700.0], [15.4, 704.0], [15.5, 712.0], [15.6, 720.0], [15.7, 733.0], [15.8, 740.0], [15.9, 745.0], [16.0, 747.0], [16.1, 752.0], [16.2, 757.0], [16.3, 761.0], [16.4, 766.0], [16.5, 782.0], [16.6, 783.0], [16.7, 791.0], [16.8, 802.0], [16.9, 808.0], [17.0, 824.0], [17.1, 828.0], [17.2, 837.0], [17.3, 850.0], [17.4, 860.0], [17.5, 864.0], [17.6, 876.0], [17.7, 891.0], [17.8, 897.0], [17.9, 904.0], [18.0, 918.0], [18.1, 922.0], [18.2, 930.0], [18.3, 947.0], [18.4, 971.0], [18.5, 981.0], [18.6, 1021.0], [18.7, 1040.0], [18.8, 1057.0], [18.9, 1073.0], [19.0, 1092.0], [19.1, 1127.0], [19.2, 1160.0], [19.3, 1177.0], [19.4, 1221.0], [19.5, 1227.0], [19.6, 1290.0], [19.7, 1325.0], [19.8, 1339.0], [19.9, 1368.0], [20.0, 1380.0], [20.1, 1382.0], [20.2, 1390.0], [20.3, 1408.0], [20.4, 1420.0], [20.5, 1434.0], [20.6, 1441.0], [20.7, 1455.0], [20.8, 1462.0], [20.9, 1469.0], [21.0, 1478.0], [21.1, 1485.0], [21.2, 1506.0], [21.3, 1516.0], [21.4, 1521.0], [21.5, 1523.0], [21.6, 1535.0], [21.7, 1539.0], [21.8, 1552.0], [21.9, 1558.0], [22.0, 1564.0], [22.1, 1574.0], [22.2, 1578.0], [22.3, 1592.0], [22.4, 1595.0], [22.5, 1598.0], [22.6, 1604.0], [22.7, 1608.0], [22.8, 1617.0], [22.9, 1624.0], [23.0, 1627.0], [23.1, 1637.0], [23.2, 1640.0], [23.3, 1664.0], [23.4, 1667.0], [23.5, 1670.0], [23.6, 1679.0], [23.7, 1680.0], [23.8, 1686.0], [23.9, 1695.0], [24.0, 1698.0], [24.1, 1704.0], [24.2, 1711.0], [24.3, 1714.0], [24.4, 1719.0], [24.5, 1723.0], [24.6, 1731.0], [24.7, 1742.0], [24.8, 1743.0], [24.9, 1745.0], [25.0, 1758.0], [25.1, 1775.0], [25.2, 1780.0], [25.3, 1802.0], [25.4, 1811.0], [25.5, 1815.0], [25.6, 1821.0], [25.7, 1823.0], [25.8, 1837.0], [25.9, 1843.0], [26.0, 1849.0], [26.1, 1851.0], [26.2, 1868.0], [26.3, 1882.0], [26.4, 1883.0], [26.5, 1891.0], [26.6, 1904.0], [26.7, 1909.0], [26.8, 1916.0], [26.9, 1920.0], [27.0, 1923.0], [27.1, 1926.0], [27.2, 1932.0], [27.3, 1942.0], [27.4, 1947.0], [27.5, 1954.0], [27.6, 1957.0], [27.7, 1963.0], [27.8, 1966.0], [27.9, 1969.0], [28.0, 1974.0], [28.1, 1979.0], [28.2, 1983.0], [28.3, 1986.0], [28.4, 1989.0], [28.5, 1998.0], [28.6, 2001.0], [28.7, 2008.0], [28.8, 2014.0], [28.9, 2024.0], [29.0, 2032.0], [29.1, 2051.0], [29.2, 2057.0], [29.3, 2059.0], [29.4, 2071.0], [29.5, 2081.0], [29.6, 2089.0], [29.7, 2093.0], [29.8, 2105.0], [29.9, 2121.0], [30.0, 2124.0], [30.1, 2126.0], [30.2, 2133.0], [30.3, 2144.0], [30.4, 2149.0], [30.5, 2152.0], [30.6, 2156.0], [30.7, 2169.0], [30.8, 2173.0], [30.9, 2179.0], [31.0, 2191.0], [31.1, 2195.0], [31.2, 2203.0], [31.3, 2208.0], [31.4, 2215.0], [31.5, 2220.0], [31.6, 2235.0], [31.7, 2237.0], [31.8, 2237.0], [31.9, 2247.0], [32.0, 2253.0], [32.1, 2257.0], [32.2, 2260.0], [32.3, 2268.0], [32.4, 2274.0], [32.5, 2281.0], [32.6, 2284.0], [32.7, 2296.0], [32.8, 2301.0], [32.9, 2306.0], [33.0, 2310.0], [33.1, 2314.0], [33.2, 2318.0], [33.3, 2321.0], [33.4, 2337.0], [33.5, 2339.0], [33.6, 2349.0], [33.7, 2352.0], [33.8, 2355.0], [33.9, 2358.0], [34.0, 2372.0], [34.1, 2376.0], [34.2, 2385.0], [34.3, 2388.0], [34.4, 2391.0], [34.5, 2407.0], [34.6, 2414.0], [34.7, 2420.0], [34.8, 2424.0], [34.9, 2429.0], [35.0, 2438.0], [35.1, 2441.0], [35.2, 2448.0], [35.3, 2452.0], [35.4, 2459.0], [35.5, 2480.0], [35.6, 2488.0], [35.7, 2496.0], [35.8, 2499.0], [35.9, 2502.0], [36.0, 2515.0], [36.1, 2530.0], [36.2, 2536.0], [36.3, 2542.0], [36.4, 2548.0], [36.5, 2558.0], [36.6, 2563.0], [36.7, 2567.0], [36.8, 2570.0], [36.9, 2574.0], [37.0, 2580.0], [37.1, 2583.0], [37.2, 2586.0], [37.3, 2596.0], [37.4, 2597.0], [37.5, 2601.0], [37.6, 2604.0], [37.7, 2612.0], [37.8, 2615.0], [37.9, 2619.0], [38.0, 2627.0], [38.1, 2644.0], [38.2, 2649.0], [38.3, 2655.0], [38.4, 2659.0], [38.5, 2661.0], [38.6, 2663.0], [38.7, 2666.0], [38.8, 2670.0], [38.9, 2670.0], [39.0, 2674.0], [39.1, 2678.0], [39.2, 2682.0], [39.3, 2687.0], [39.4, 2692.0], [39.5, 2695.0], [39.6, 2697.0], [39.7, 2700.0], [39.8, 2703.0], [39.9, 2710.0], [40.0, 2715.0], [40.1, 2725.0], [40.2, 2729.0], [40.3, 2738.0], [40.4, 2744.0], [40.5, 2749.0], [40.6, 2753.0], [40.7, 2761.0], [40.8, 2780.0], [40.9, 2787.0], [41.0, 2800.0], [41.1, 2808.0], [41.2, 2815.0], [41.3, 2822.0], [41.4, 2825.0], [41.5, 2828.0], [41.6, 2832.0], [41.7, 2834.0], [41.8, 2838.0], [41.9, 2842.0], [42.0, 2844.0], [42.1, 2849.0], [42.2, 2852.0], [42.3, 2856.0], [42.4, 2858.0], [42.5, 2863.0], [42.6, 2866.0], [42.7, 2869.0], [42.8, 2872.0], [42.9, 2877.0], [43.0, 2880.0], [43.1, 2881.0], [43.2, 2885.0], [43.3, 2894.0], [43.4, 2899.0], [43.5, 2904.0], [43.6, 2908.0], [43.7, 2912.0], [43.8, 2914.0], [43.9, 2918.0], [44.0, 2926.0], [44.1, 2936.0], [44.2, 2940.0], [44.3, 2952.0], [44.4, 2954.0], [44.5, 2956.0], [44.6, 2964.0], [44.7, 2966.0], [44.8, 2973.0], [44.9, 2976.0], [45.0, 2985.0], [45.1, 2990.0], [45.2, 2995.0], [45.3, 3001.0], [45.4, 3004.0], [45.5, 3006.0], [45.6, 3010.0], [45.7, 3011.0], [45.8, 3014.0], [45.9, 3017.0], [46.0, 3020.0], [46.1, 3027.0], [46.2, 3038.0], [46.3, 3044.0], [46.4, 3045.0], [46.5, 3049.0], [46.6, 3053.0], [46.7, 3057.0], [46.8, 3064.0], [46.9, 3067.0], [47.0, 3072.0], [47.1, 3077.0], [47.2, 3085.0], [47.3, 3087.0], [47.4, 3100.0], [47.5, 3104.0], [47.6, 3110.0], [47.7, 3122.0], [47.8, 3132.0], [47.9, 3135.0], [48.0, 3142.0], [48.1, 3148.0], [48.2, 3150.0], [48.3, 3158.0], [48.4, 3162.0], [48.5, 3167.0], [48.6, 3168.0], [48.7, 3172.0], [48.8, 3182.0], [48.9, 3184.0], [49.0, 3187.0], [49.1, 3189.0], [49.2, 3196.0], [49.3, 3200.0], [49.4, 3204.0], [49.5, 3208.0], [49.6, 3223.0], [49.7, 3232.0], [49.8, 3236.0], [49.9, 3236.0], [50.0, 3242.0], [50.1, 3247.0], [50.2, 3249.0], [50.3, 3255.0], [50.4, 3259.0], [50.5, 3265.0], [50.6, 3275.0], [50.7, 3281.0], [50.8, 3284.0], [50.9, 3289.0], [51.0, 3299.0], [51.1, 3305.0], [51.2, 3309.0], [51.3, 3322.0], [51.4, 3324.0], [51.5, 3330.0], [51.6, 3333.0], [51.7, 3338.0], [51.8, 3345.0], [51.9, 3356.0], [52.0, 3360.0], [52.1, 3374.0], [52.2, 3382.0], [52.3, 3386.0], [52.4, 3391.0], [52.5, 3397.0], [52.6, 3403.0], [52.7, 3409.0], [52.8, 3415.0], [52.9, 3417.0], [53.0, 3420.0], [53.1, 3426.0], [53.2, 3432.0], [53.3, 3435.0], [53.4, 3442.0], [53.5, 3445.0], [53.6, 3451.0], [53.7, 3457.0], [53.8, 3462.0], [53.9, 3467.0], [54.0, 3471.0], [54.1, 3477.0], [54.2, 3484.0], [54.3, 3490.0], [54.4, 3492.0], [54.5, 3496.0], [54.6, 3502.0], [54.7, 3506.0], [54.8, 3513.0], [54.9, 3521.0], [55.0, 3528.0], [55.1, 3534.0], [55.2, 3545.0], [55.3, 3552.0], [55.4, 3559.0], [55.5, 3560.0], [55.6, 3564.0], [55.7, 3568.0], [55.8, 3576.0], [55.9, 3585.0], [56.0, 3589.0], [56.1, 3595.0], [56.2, 3606.0], [56.3, 3607.0], [56.4, 3614.0], [56.5, 3622.0], [56.6, 3630.0], [56.7, 3635.0], [56.8, 3641.0], [56.9, 3646.0], [57.0, 3654.0], [57.1, 3659.0], [57.2, 3665.0], [57.3, 3669.0], [57.4, 3675.0], [57.5, 3677.0], [57.6, 3683.0], [57.7, 3687.0], [57.8, 3694.0], [57.9, 3699.0], [58.0, 3708.0], [58.1, 3719.0], [58.2, 3723.0], [58.3, 3728.0], [58.4, 3731.0], [58.5, 3737.0], [58.6, 3746.0], [58.7, 3752.0], [58.8, 3755.0], [58.9, 3759.0], [59.0, 3760.0], [59.1, 3771.0], [59.2, 3773.0], [59.3, 3776.0], [59.4, 3783.0], [59.5, 3786.0], [59.6, 3794.0], [59.7, 3797.0], [59.8, 3801.0], [59.9, 3811.0], [60.0, 3816.0], [60.1, 3822.0], [60.2, 3830.0], [60.3, 3832.0], [60.4, 3834.0], [60.5, 3841.0], [60.6, 3845.0], [60.7, 3847.0], [60.8, 3854.0], [60.9, 3859.0], [61.0, 3863.0], [61.1, 3866.0], [61.2, 3867.0], [61.3, 3874.0], [61.4, 3877.0], [61.5, 3885.0], [61.6, 3888.0], [61.7, 3893.0], [61.8, 3899.0], [61.9, 3902.0], [62.0, 3905.0], [62.1, 3909.0], [62.2, 3911.0], [62.3, 3917.0], [62.4, 3920.0], [62.5, 3924.0], [62.6, 3928.0], [62.7, 3931.0], [62.8, 3932.0], [62.9, 3937.0], [63.0, 3945.0], [63.1, 3953.0], [63.2, 3956.0], [63.3, 3962.0], [63.4, 3968.0], [63.5, 3971.0], [63.6, 3979.0], [63.7, 3988.0], [63.8, 3994.0], [63.9, 3995.0], [64.0, 4013.0], [64.1, 4016.0], [64.2, 4021.0], [64.3, 4024.0], [64.4, 4028.0], [64.5, 4031.0], [64.6, 4038.0], [64.7, 4040.0], [64.8, 4047.0], [64.9, 4048.0], [65.0, 4054.0], [65.1, 4059.0], [65.2, 4065.0], [65.3, 4068.0], [65.4, 4073.0], [65.5, 4076.0], [65.6, 4081.0], [65.7, 4090.0], [65.8, 4092.0], [65.9, 4095.0], [66.0, 4098.0], [66.1, 4103.0], [66.2, 4114.0], [66.3, 4120.0], [66.4, 4125.0], [66.5, 4130.0], [66.6, 4133.0], [66.7, 4138.0], [66.8, 4141.0], [66.9, 4146.0], [67.0, 4150.0], [67.1, 4158.0], [67.2, 4159.0], [67.3, 4160.0], [67.4, 4163.0], [67.5, 4164.0], [67.6, 4166.0], [67.7, 4170.0], [67.8, 4173.0], [67.9, 4178.0], [68.0, 4183.0], [68.1, 4185.0], [68.2, 4192.0], [68.3, 4196.0], [68.4, 4200.0], [68.5, 4203.0], [68.6, 4207.0], [68.7, 4209.0], [68.8, 4214.0], [68.9, 4221.0], [69.0, 4228.0], [69.1, 4237.0], [69.2, 4246.0], [69.3, 4247.0], [69.4, 4249.0], [69.5, 4252.0], [69.6, 4258.0], [69.7, 4264.0], [69.8, 4276.0], [69.9, 4279.0], [70.0, 4283.0], [70.1, 4287.0], [70.2, 4294.0], [70.3, 4300.0], [70.4, 4303.0], [70.5, 4310.0], [70.6, 4313.0], [70.7, 4317.0], [70.8, 4319.0], [70.9, 4323.0], [71.0, 4330.0], [71.1, 4335.0], [71.2, 4339.0], [71.3, 4343.0], [71.4, 4348.0], [71.5, 4356.0], [71.6, 4363.0], [71.7, 4366.0], [71.8, 4372.0], [71.9, 4380.0], [72.0, 4388.0], [72.1, 4389.0], [72.2, 4394.0], [72.3, 4396.0], [72.4, 4398.0], [72.5, 4401.0], [72.6, 4408.0], [72.7, 4417.0], [72.8, 4419.0], [72.9, 4423.0], [73.0, 4429.0], [73.1, 4438.0], [73.2, 4446.0], [73.3, 4450.0], [73.4, 4452.0], [73.5, 4453.0], [73.6, 4457.0], [73.7, 4462.0], [73.8, 4463.0], [73.9, 4465.0], [74.0, 4468.0], [74.1, 4469.0], [74.2, 4475.0], [74.3, 4477.0], [74.4, 4478.0], [74.5, 4481.0], [74.6, 4486.0], [74.7, 4492.0], [74.8, 4495.0], [74.9, 4498.0], [75.0, 4503.0], [75.1, 4506.0], [75.2, 4511.0], [75.3, 4514.0], [75.4, 4520.0], [75.5, 4522.0], [75.6, 4525.0], [75.7, 4529.0], [75.8, 4533.0], [75.9, 4541.0], [76.0, 4549.0], [76.1, 4555.0], [76.2, 4559.0], [76.3, 4561.0], [76.4, 4567.0], [76.5, 4578.0], [76.6, 4581.0], [76.7, 4586.0], [76.8, 4588.0], [76.9, 4590.0], [77.0, 4597.0], [77.1, 4602.0], [77.2, 4604.0], [77.3, 4605.0], [77.4, 4606.0], [77.5, 4610.0], [77.6, 4615.0], [77.7, 4617.0], [77.8, 4624.0], [77.9, 4628.0], [78.0, 4629.0], [78.1, 4634.0], [78.2, 4639.0], [78.3, 4641.0], [78.4, 4644.0], [78.5, 4647.0], [78.6, 4650.0], [78.7, 4654.0], [78.8, 4657.0], [78.9, 4662.0], [79.0, 4665.0], [79.1, 4669.0], [79.2, 4671.0], [79.3, 4678.0], [79.4, 4686.0], [79.5, 4691.0], [79.6, 4696.0], [79.7, 4702.0], [79.8, 4703.0], [79.9, 4707.0], [80.0, 4710.0], [80.1, 4714.0], [80.2, 4717.0], [80.3, 4720.0], [80.4, 4729.0], [80.5, 4731.0], [80.6, 4736.0], [80.7, 4740.0], [80.8, 4747.0], [80.9, 4756.0], [81.0, 4760.0], [81.1, 4767.0], [81.2, 4773.0], [81.3, 4779.0], [81.4, 4781.0], [81.5, 4782.0], [81.6, 4786.0], [81.7, 4790.0], [81.8, 4795.0], [81.9, 4800.0], [82.0, 4805.0], [82.1, 4811.0], [82.2, 4824.0], [82.3, 4827.0], [82.4, 4830.0], [82.5, 4833.0], [82.6, 4837.0], [82.7, 4840.0], [82.8, 4853.0], [82.9, 4855.0], [83.0, 4862.0], [83.1, 4865.0], [83.2, 4866.0], [83.3, 4871.0], [83.4, 4874.0], [83.5, 4879.0], [83.6, 4885.0], [83.7, 4889.0], [83.8, 4892.0], [83.9, 4896.0], [84.0, 4902.0], [84.1, 4907.0], [84.2, 4914.0], [84.3, 4920.0], [84.4, 4923.0], [84.5, 4926.0], [84.6, 4929.0], [84.7, 4932.0], [84.8, 4937.0], [84.9, 4940.0], [85.0, 4948.0], [85.1, 4950.0], [85.2, 4951.0], [85.3, 4965.0], [85.4, 4973.0], [85.5, 4973.0], [85.6, 4975.0], [85.7, 4979.0], [85.8, 4980.0], [85.9, 4982.0], [86.0, 4984.0], [86.1, 4986.0], [86.2, 4990.0], [86.3, 4991.0], [86.4, 5001.0], [86.5, 5005.0], [86.6, 5009.0], [86.7, 5023.0], [86.8, 5035.0], [86.9, 5042.0], [87.0, 5054.0], [87.1, 5057.0], [87.2, 5064.0], [87.3, 5065.0], [87.4, 5074.0], [87.5, 5077.0], [87.6, 5085.0], [87.7, 5087.0], [87.8, 5099.0], [87.9, 5104.0], [88.0, 5109.0], [88.1, 5110.0], [88.2, 5113.0], [88.3, 5117.0], [88.4, 5127.0], [88.5, 5134.0], [88.6, 5136.0], [88.7, 5140.0], [88.8, 5144.0], [88.9, 5149.0], [89.0, 5158.0], [89.1, 5160.0], [89.2, 5169.0], [89.3, 5174.0], [89.4, 5184.0], [89.5, 5190.0], [89.6, 5198.0], [89.7, 5202.0], [89.8, 5206.0], [89.9, 5207.0], [90.0, 5212.0], [90.1, 5228.0], [90.2, 5231.0], [90.3, 5235.0], [90.4, 5235.0], [90.5, 5241.0], [90.6, 5248.0], [90.7, 5249.0], [90.8, 5256.0], [90.9, 5263.0], [91.0, 5274.0], [91.1, 5279.0], [91.2, 5283.0], [91.3, 5287.0], [91.4, 5294.0], [91.5, 5304.0], [91.6, 5306.0], [91.7, 5315.0], [91.8, 5318.0], [91.9, 5324.0], [92.0, 5329.0], [92.1, 5335.0], [92.2, 5344.0], [92.3, 5350.0], [92.4, 5354.0], [92.5, 5361.0], [92.6, 5373.0], [92.7, 5380.0], [92.8, 5391.0], [92.9, 5403.0], [93.0, 5408.0], [93.1, 5415.0], [93.2, 5422.0], [93.3, 5429.0], [93.4, 5438.0], [93.5, 5441.0], [93.6, 5444.0], [93.7, 5458.0], [93.8, 5467.0], [93.9, 5469.0], [94.0, 5476.0], [94.1, 5486.0], [94.2, 5490.0], [94.3, 5512.0], [94.4, 5518.0], [94.5, 5525.0], [94.6, 5528.0], [94.7, 5535.0], [94.8, 5539.0], [94.9, 5552.0], [95.0, 5558.0], [95.1, 5562.0], [95.2, 5567.0], [95.3, 5573.0], [95.4, 5585.0], [95.5, 5604.0], [95.6, 5619.0], [95.7, 5621.0], [95.8, 5631.0], [95.9, 5637.0], [96.0, 5645.0], [96.1, 5650.0], [96.2, 5664.0], [96.3, 5674.0], [96.4, 5689.0], [96.5, 5707.0], [96.6, 5716.0], [96.7, 5722.0], [96.8, 5729.0], [96.9, 5746.0], [97.0, 5748.0], [97.1, 5755.0], [97.2, 5762.0], [97.3, 5773.0], [97.4, 5777.0], [97.5, 5801.0], [97.6, 5807.0], [97.7, 5814.0], [97.8, 5828.0], [97.9, 5856.0], [98.0, 5866.0], [98.1, 5879.0], [98.2, 5896.0], [98.3, 5918.0], [98.4, 5929.0], [98.5, 5953.0], [98.6, 5980.0], [98.7, 6050.0], [98.8, 6068.0], [98.9, 6101.0], [99.0, 6150.0], [99.1, 6163.0], [99.2, 6194.0], [99.3, 6343.0], [99.4, 6436.0], [99.5, 6487.0], [99.6, 6502.0], [99.7, 6535.0], [99.8, 6656.0], [99.9, 6926.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 121.0, "series": [{"data": [[0.0, 1.0], [600.0, 47.0], [700.0, 45.0], [800.0, 30.0], [900.0, 21.0], [1000.0, 17.0], [1100.0, 9.0], [1200.0, 7.0], [1300.0, 18.0], [1400.0, 29.0], [1500.0, 40.0], [1600.0, 45.0], [1700.0, 38.0], [1800.0, 39.0], [1900.0, 59.0], [2000.0, 36.0], [2100.0, 43.0], [2300.0, 51.0], [2200.0, 46.0], [2400.0, 42.0], [2500.0, 50.0], [2600.0, 66.0], [2800.0, 73.0], [2700.0, 39.0], [2900.0, 56.0], [3000.0, 63.0], [3100.0, 57.0], [3200.0, 52.0], [3300.0, 46.0], [3400.0, 61.0], [3500.0, 47.0], [3600.0, 53.0], [3700.0, 55.0], [3800.0, 62.0], [3900.0, 64.0], [4000.0, 64.0], [4300.0, 65.0], [4100.0, 70.0], [4200.0, 57.0], [4400.0, 75.0], [4600.0, 79.0], [4500.0, 63.0], [4700.0, 66.0], [4800.0, 62.0], [4900.0, 72.0], [5100.0, 54.0], [5000.0, 44.0], [5300.0, 44.0], [5200.0, 54.0], [5500.0, 37.0], [5400.0, 40.0], [5600.0, 30.0], [5700.0, 31.0], [5800.0, 22.0], [6000.0, 7.0], [5900.0, 13.0], [6100.0, 10.0], [6300.0, 4.0], [6500.0, 6.0], [6400.0, 6.0], [6600.0, 4.0], [6900.0, 1.0], [7000.0, 2.0], [100.0, 121.0], [200.0, 109.0], [300.0, 76.0], [400.0, 57.0], [500.0, 48.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 270.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2365.0, "series": [{"data": [[1.0, 270.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 365.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2365.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 80.24940617577201, "minX": 1.54961922E12, "maxY": 660.8022489336959, "series": [{"data": [[1.54961928E12, 660.8022489336959], [1.54961922E12, 80.24940617577201]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 189.25, "minX": 1.0, "maxY": 7067.0, "series": [{"data": [[2.0, 5351.0], [3.0, 5764.0], [4.0, 5395.0], [6.0, 5160.5], [7.0, 4948.0], [8.0, 4861.0], [9.0, 5127.0], [10.0, 4980.0], [11.0, 4810.0], [12.0, 4618.0], [13.0, 5054.0], [15.0, 5228.0], [16.0, 5211.0], [17.0, 5583.0], [19.0, 4874.0], [20.0, 4629.0], [22.0, 5735.0], [23.0, 5248.0], [24.0, 4830.0], [25.0, 5749.0], [27.0, 5118.5], [28.0, 2411.0], [29.0, 1112.5], [30.0, 779.2222222222222], [31.0, 189.25], [33.0, 544.8181818181818], [32.0, 2381.0], [35.0, 686.6000000000001], [34.0, 437.5], [37.0, 1462.625], [36.0, 201.33333333333334], [39.0, 215.18750000000003], [38.0, 571.7692307692307], [41.0, 585.5384615384615], [40.0, 1091.3636363636365], [43.0, 197.5], [42.0, 878.1428571428571], [45.0, 1472.0], [44.0, 2025.4], [47.0, 2010.2], [46.0, 245.0], [49.0, 1349.0], [48.0, 2478.0], [51.0, 227.75000000000003], [50.0, 1417.25], [53.0, 2106.0], [52.0, 1490.375], [54.0, 1031.8], [55.0, 199.71428571428572], [56.0, 1249.6], [57.0, 5206.0], [58.0, 1815.6666666666667], [59.0, 5087.0], [60.0, 2934.5], [61.0, 4475.0], [62.0, 1155.0], [63.0, 3078.5], [64.0, 1834.6666666666667], [65.0, 2878.0], [66.0, 1188.6], [67.0, 252.33333333333334], [68.0, 2312.6], [69.0, 2778.0], [70.0, 1453.75], [71.0, 5140.0], [73.0, 2406.0], [75.0, 4397.0], [74.0, 5801.0], [72.0, 5471.0], [77.0, 908.2857142857143], [76.0, 888.875], [79.0, 1902.6666666666667], [78.0, 1345.0], [81.0, 1472.5555555555557], [80.0, 348.1111111111111], [82.0, 1029.7142857142858], [83.0, 1800.6666666666667], [84.0, 323.5714285714286], [85.0, 1380.9], [87.0, 3668.0], [86.0, 331.0], [90.0, 2907.5], [91.0, 5641.0], [89.0, 4689.5], [92.0, 2567.5], [95.0, 1180.4285714285713], [94.0, 1171.8333333333333], [93.0, 2532.5], [97.0, 2627.0], [96.0, 762.0833333333333], [99.0, 404.0], [98.0, 4561.0], [100.0, 2791.5], [102.0, 1750.25], [101.0, 2738.5], [104.0, 3614.0], [107.0, 2677.5], [105.0, 4645.0], [108.0, 1910.3333333333333], [110.0, 2643.0], [111.0, 5762.0], [109.0, 4705.0], [112.0, 1940.0], [114.0, 1740.0], [113.0, 1285.4], [115.0, 2434.5], [116.0, 2961.5], [119.0, 4615.0], [118.0, 5168.0], [117.0, 5509.0], [122.0, 4657.0], [121.0, 5251.0], [120.0, 5564.0], [127.0, 2688.5], [126.0, 5769.0], [125.0, 4503.0], [124.0, 5761.5], [131.0, 1675.4], [132.0, 1581.0], [129.0, 1208.0], [130.0, 1286.6], [133.0, 1852.6666666666667], [135.0, 3060.5], [134.0, 5734.0], [128.0, 4430.0], [137.0, 3172.6666666666665], [139.0, 461.0], [138.0, 2838.5], [142.0, 2607.8], [141.0, 536.0], [143.0, 543.375], [140.0, 4857.5], [144.0, 1421.3], [145.0, 922.2222222222222], [146.0, 557.7777777777778], [147.0, 1535.0], [148.0, 1527.4], [150.0, 1873.3333333333333], [149.0, 1949.0], [151.0, 5440.0], [153.0, 1469.6], [154.0, 656.5], [155.0, 3057.0], [158.0, 2920.0], [157.0, 3499.0], [159.0, 816.0], [152.0, 5953.0], [162.0, 3149.0], [161.0, 2559.5], [163.0, 2114.333333333333], [164.0, 2818.0], [165.0, 3034.0], [167.0, 1905.0], [166.0, 5142.0], [160.0, 5075.0], [169.0, 3753.0], [170.0, 494.0], [172.0, 1255.3333333333333], [173.0, 3159.5], [171.0, 4085.0], [174.0, 1549.5], [175.0, 1535.2], [178.0, 1399.0], [177.0, 2602.5], [179.0, 1737.25], [180.0, 1302.7142857142858], [182.0, 1555.1666666666665], [181.0, 1051.7], [183.0, 2210.333333333333], [176.0, 4675.0], [185.0, 2225.0], [188.0, 2474.0], [187.0, 2870.0], [190.0, 962.0], [191.0, 2452.0], [189.0, 4950.0], [186.0, 5636.0], [184.0, 4699.0], [192.0, 1749.0], [193.0, 1264.375], [195.0, 813.5], [196.0, 2265.5], [194.0, 1866.5], [198.0, 2103.333333333333], [197.0, 2298.333333333333], [199.0, 5372.0], [200.0, 2926.5], [202.0, 3104.0], [201.0, 2341.333333333333], [203.0, 2628.0], [207.0, 5180.5], [205.0, 4478.0], [204.0, 5300.0], [209.0, 2557.0], [214.0, 1875.0], [213.0, 3090.0], [215.0, 4368.0], [212.0, 5512.0], [211.0, 4555.0], [210.0, 5306.0], [208.0, 5528.0], [217.0, 1593.0], [216.0, 1612.0], [222.0, 1592.2], [223.0, 870.0], [221.0, 5285.0], [220.0, 4900.0], [219.0, 5619.0], [218.0, 4731.0], [224.0, 2873.0], [226.0, 2849.5], [227.0, 749.0], [228.0, 3469.6666666666665], [230.0, 2050.5], [231.0, 4282.0], [229.0, 4521.0], [225.0, 4598.0], [232.0, 2156.0], [233.0, 1611.2], [236.0, 1923.25], [239.0, 4171.0], [238.0, 5115.0], [237.0, 5395.0], [235.0, 4863.0], [234.0, 5169.0], [244.0, 1872.25], [243.0, 2148.333333333333], [245.0, 1963.3333333333333], [246.0, 2276.0], [247.0, 4976.0], [242.0, 4973.0], [241.0, 4873.0], [240.0, 4782.0], [250.0, 1701.75], [252.0, 3018.0], [253.0, 2217.333333333333], [255.0, 2009.5], [254.0, 4300.0], [251.0, 7067.0], [249.0, 4772.0], [248.0, 5515.0], [271.0, 5509.5], [257.0, 3023.0], [259.0, 2585.5], [258.0, 5561.0], [260.0, 2756.333333333333], [261.0, 4133.0], [262.0, 2206.666666666667], [263.0, 2792.5], [256.0, 4252.0], [265.0, 2999.5], [264.0, 5441.0], [267.0, 5339.0], [266.0, 4129.0], [269.0, 5361.0], [268.0, 5530.0], [286.0, 5051.0], [287.0, 5319.0], [285.0, 5619.0], [284.0, 4335.0], [283.0, 5113.5], [281.0, 5069.0], [280.0, 5235.0], [279.0, 5567.0], [273.0, 4457.0], [272.0, 4866.0], [275.0, 5929.0], [274.0, 6343.0], [277.0, 6663.0], [276.0, 4994.0], [301.0, 3985.0], [303.0, 5158.0], [300.0, 4982.0], [291.0, 5726.0], [290.0, 4227.0], [289.0, 5008.0], [288.0, 4159.0], [299.0, 5334.0], [298.0, 4396.0], [297.0, 5356.0], [296.0, 5686.0], [295.0, 7025.0], [294.0, 4448.0], [293.0, 4404.0], [292.0, 5231.0], [318.0, 5997.0], [319.0, 6049.0], [317.0, 3937.0], [316.0, 4669.0], [315.0, 4840.0], [314.0, 3911.0], [313.0, 4508.0], [312.0, 4790.5], [310.0, 4895.0], [304.0, 4604.0], [306.0, 4114.0], [305.0, 5130.0], [309.0, 4798.0], [308.0, 4565.5], [334.0, 3921.0], [335.0, 4907.0], [333.0, 3895.0], [332.0, 5918.0], [331.0, 4914.0], [330.0, 5086.0], [329.0, 3995.0], [328.0, 5848.0], [327.0, 5665.0], [321.0, 4279.0], [320.0, 5073.0], [323.0, 4451.0], [322.0, 4138.0], [326.0, 4973.0], [325.0, 6162.0], [324.0, 5184.0], [350.0, 4159.0], [351.0, 4578.0], [349.0, 4533.0], [348.0, 6542.0], [347.0, 4081.0], [346.0, 5057.0], [345.0, 6502.0], [344.0, 4517.0], [343.0, 3811.0], [337.0, 6150.0], [336.0, 6671.0], [339.0, 5257.0], [338.0, 6176.0], [342.0, 3800.0], [341.0, 4714.0], [340.0, 5104.0], [365.0, 4478.0], [367.0, 5268.0], [364.0, 5351.0], [355.0, 5895.0], [354.0, 6182.0], [353.0, 3850.0], [352.0, 5259.0], [363.0, 5184.0], [362.0, 5001.0], [361.0, 4744.0], [360.0, 5661.0], [359.0, 4965.0], [358.0, 4438.0], [357.0, 5856.0], [356.0, 4892.0], [381.0, 4605.0], [382.0, 3874.0], [380.0, 3704.0], [371.0, 6435.0], [370.0, 3755.0], [369.0, 3924.0], [368.0, 4200.0], [379.0, 4585.0], [378.0, 4833.0], [377.0, 4287.0], [376.0, 4028.0], [375.0, 5963.0], [374.0, 4837.0], [373.0, 6487.0], [372.0, 4990.0], [398.0, 4633.0], [399.0, 3732.0], [397.0, 5527.0], [396.0, 5302.0], [395.0, 4729.0], [394.0, 6656.0], [393.0, 5234.0], [392.0, 4048.0], [391.0, 4837.0], [384.0, 5283.0], [387.0, 3941.0], [386.0, 5150.5], [390.0, 5427.0], [389.0, 3785.0], [388.0, 3845.0], [414.0, 2697.333333333333], [415.0, 2590.6666666666665], [412.0, 2985.0], [413.0, 4785.0], [411.0, 3557.0], [410.0, 4466.0], [409.0, 3942.0], [408.0, 4172.0], [407.0, 4708.0], [401.0, 3607.0], [400.0, 5469.0], [403.0, 3867.0], [402.0, 4249.0], [406.0, 5490.0], [405.0, 4565.0], [404.0, 4626.0], [424.0, 3226.5], [426.0, 2606.3333333333335], [427.0, 1995.5714285714287], [425.0, 2034.0], [423.0, 2151.2], [416.0, 3707.5], [417.0, 4341.0], [422.0, 2391.0], [421.0, 2489.8], [420.0, 2011.7142857142858], [419.0, 2003.8571428571427], [429.0, 5866.0], [428.0, 4476.0], [430.0, 3876.5], [431.0, 3480.5], [418.0, 1749.5], [447.0, 2690.0], [435.0, 3820.0], [432.0, 2856.0], [434.0, 5102.0], [433.0, 4720.0], [439.0, 6316.0], [438.0, 5535.0], [437.0, 5568.0], [436.0, 4330.0], [443.0, 3689.0], [446.0, 2007.8333333333335], [445.0, 5586.0], [444.0, 5550.0], [442.0, 3854.0], [441.0, 3917.0], [440.0, 4736.0], [460.0, 3708.0], [450.0, 3387.5], [451.0, 4663.0], [455.0, 5203.0], [449.0, 3840.0], [448.0, 3783.0], [452.0, 2703.0], [454.0, 2199.0], [453.0, 2768.0], [459.0, 3047.5], [458.0, 3680.0], [457.0, 6163.0], [456.0, 3902.0], [461.0, 2628.333333333333], [463.0, 3494.0], [462.0, 4163.0], [472.0, 2934.666666666667], [469.0, 3052.5], [468.0, 5002.0], [470.0, 3730.0], [475.0, 2689.333333333333], [474.0, 3862.0], [473.0, 2413.3333333333335], [478.0, 2762.3333333333335], [477.0, 3265.5], [479.0, 3236.0], [476.0, 4929.0], [467.0, 4939.0], [466.0, 4928.0], [465.0, 3409.0], [464.0, 3484.0], [471.0, 3637.0], [481.0, 3114.666666666667], [480.0, 3811.5], [482.0, 2841.333333333333], [484.0, 2582.4], [483.0, 3301.0], [487.0, 2554.1666666666665], [486.0, 2814.25], [485.0, 3649.5], [489.0, 3405.5], [494.0, 3507.5], [493.0, 4194.0], [492.0, 4639.0], [495.0, 5058.0], [488.0, 4156.0], [490.0, 2751.666666666667], [491.0, 4474.0], [499.0, 3245.5], [497.0, 1930.5714285714284], [496.0, 2942.0], [498.0, 3010.666666666667], [500.0, 3609.0], [502.0, 4732.0], [501.0, 4826.0], [503.0, 3770.5], [504.0, 2671.666666666667], [505.0, 6065.0], [511.0, 5241.0], [510.0, 4982.0], [509.0, 5207.0], [508.0, 5408.0], [506.0, 2371.25], [507.0, 2901.666666666667], [537.0, 3295.0], [530.0, 3429.0], [517.0, 3437.5], [520.0, 3090.5], [521.0, 5729.0], [523.0, 5206.0], [522.0, 5418.0], [519.0, 3741.0], [518.0, 4723.0], [536.0, 5721.0], [541.0, 2478.5], [542.0, 2303.5], [543.0, 4685.0], [529.0, 4879.0], [528.0, 5075.0], [540.0, 2614.75], [539.0, 5805.0], [538.0, 4641.0], [525.0, 2900.666666666667], [527.0, 4650.0], [512.0, 5525.0], [514.0, 4605.0], [513.0, 5773.0], [516.0, 5489.0], [515.0, 5826.0], [526.0, 5473.0], [524.0, 2903.333333333333], [531.0, 2985.0], [532.0, 3873.0], [534.0, 2586.2], [535.0, 2813.6666666666665], [533.0, 2805.666666666667], [568.0, 2516.5], [556.0, 1927.0], [549.0, 3475.5], [548.0, 3323.0], [559.0, 5099.0], [544.0, 4782.0], [546.0, 5143.0], [545.0, 3672.0], [547.0, 4329.0], [551.0, 3432.0], [550.0, 4896.0], [569.0, 3055.3333333333335], [570.0, 5694.0], [572.0, 2776.0], [573.0, 5138.0], [575.0, 4398.0], [560.0, 4462.0], [574.0, 4303.0], [571.0, 3776.5], [561.0, 3714.0], [563.0, 3397.0], [562.0, 4979.0], [565.0, 6376.0], [564.0, 5689.0], [567.0, 3737.0], [566.0, 6101.0], [552.0, 2573.0], [553.0, 3945.5], [554.0, 2619.3333333333335], [555.0, 2916.333333333333], [557.0, 2799.75], [558.0, 3554.0], [580.0, 2567.75], [578.0, 2853.6], [576.0, 2835.25], [577.0, 4557.0], [591.0, 5266.0], [590.0, 4452.0], [589.0, 4386.0], [588.0, 5377.0], [579.0, 3793.0], [581.0, 3939.5], [583.0, 5327.0], [582.0, 5434.0], [587.0, 3110.5], [586.0, 2373.4285714285716], [585.0, 4941.0], [584.0, 4597.0], [600.0, 3283.0], [599.0, 3425.0], [598.0, 3149.0], [597.0, 3691.0], [596.0, 2228.0], [594.0, 2599.3], [593.0, 4506.0], [592.0, 4514.0], [595.0, 5241.0], [607.0, 2848.333333333333], [606.0, 5391.0], [605.0, 5481.0], [604.0, 5552.0], [603.0, 3667.0], [602.0, 3727.0], [601.0, 4372.0], [608.0, 3554.5], [619.0, 3458.0], [614.0, 3607.5], [613.0, 4692.0], [612.0, 5144.0], [611.0, 5415.0], [610.0, 4885.0], [609.0, 5000.0], [615.0, 4170.0], [633.0, 5468.0], [632.0, 4249.0], [634.0, 3115.333333333333], [639.0, 2259.8333333333335], [638.0, 2725.5], [637.0, 2984.0], [636.0, 5003.0], [635.0, 4467.0], [624.0, 3359.0], [629.0, 2729.1666666666665], [630.0, 2458.875], [631.0, 2610.75], [628.0, 2283.5], [627.0, 3002.0], [626.0, 4469.0], [625.0, 4188.0], [616.0, 2878.4], [617.0, 3461.25], [618.0, 3131.333333333333], [620.0, 3960.0], [621.0, 4044.0], [622.0, 2337.6], [623.0, 2978.0], [668.0, 4276.0], [653.0, 3352.0], [640.0, 2098.3333333333335], [641.0, 3327.25], [644.0, 2583.5], [643.0, 4877.0], [642.0, 4696.0], [646.0, 4147.0], [645.0, 5287.0], [664.0, 5310.0], [647.0, 5222.0], [667.0, 4827.5], [665.0, 4429.0], [669.0, 5349.0], [670.0, 2797.0], [671.0, 2275.5714285714284], [656.0, 1758.0], [658.0, 2614.5], [657.0, 4454.5], [659.0, 4440.0], [661.0, 2869.3333333333335], [660.0, 5174.0], [663.0, 2434.4], [662.0, 2632.25], [649.0, 3301.666666666667], [648.0, 4395.0], [651.0, 3106.333333333333], [650.0, 3134.0], [652.0, 2715.25], [654.0, 3244.5], [655.0, 4951.0], [699.0, 3479.25], [673.0, 2965.0], [672.0, 3122.5], [674.0, 3236.3333333333335], [675.0, 4494.0], [676.0, 3256.0], [679.0, 3092.6666666666665], [678.0, 4363.0], [677.0, 4647.0], [698.0, 4393.0], [697.0, 5045.0], [700.0, 3272.0], [701.0, 2792.8], [702.0, 2300.0], [703.0, 3190.3333333333335], [688.0, 2360.5714285714284], [690.0, 2128.153846153846], [691.0, 2271.818181818182], [692.0, 2683.3333333333335], [694.0, 2491.277777777778], [695.0, 2689.875], [693.0, 2518.4444444444443], [689.0, 2664.4], [682.0, 3356.5], [681.0, 6108.0], [680.0, 4327.0], [683.0, 3591.666666666667], [687.0, 2304.428571428571], [686.0, 2308.8], [685.0, 2565.25], [684.0, 2875.0], [710.0, 2879.619047619048], [705.0, 3557.6666666666665], [704.0, 2394.5], [718.0, 2680.1428571428573], [719.0, 3237.5714285714284], [716.0, 3015.125], [715.0, 2864.6666666666665], [717.0, 3123.875], [708.0, 2993.0], [707.0, 3015.5], [706.0, 3974.0], [709.0, 2746.0], [711.0, 2687.5], [728.0, 3930.6666666666665], [730.0, 3445.6666666666665], [732.0, 2909.0], [733.0, 2906.6666666666665], [734.0, 3724.0], [735.0, 5921.0], [731.0, 3580.3333333333335], [729.0, 3019.2], [720.0, 2881.5], [721.0, 3196.0], [722.0, 3002.8749999999995], [724.0, 3011.777777777778], [725.0, 2898.7999999999993], [726.0, 2988.0], [727.0, 3354.5], [723.0, 2883.571428571429], [712.0, 2889.2500000000005], [713.0, 2737.4545454545455], [714.0, 2992.3333333333335], [762.0, 3433.2], [750.0, 3335.0], [737.0, 3593.5], [743.0, 5624.0], [742.0, 2990.0], [741.0, 4229.0], [740.0, 4214.0], [739.0, 5604.0], [738.0, 3562.0], [751.0, 4829.0], [736.0, 3766.0], [761.0, 3642.5], [763.0, 3467.0], [764.0, 3709.0], [766.0, 2729.0], [765.0, 4090.0], [767.0, 4105.5], [760.0, 3870.5], [745.0, 4620.0], [744.0, 4076.0], [748.0, 3656.7500000000005], [747.0, 3322.333333333333], [746.0, 4951.0], [749.0, 2839.5], [752.0, 3379.0], [754.0, 3306.166666666667], [755.0, 3019.6666666666665], [756.0, 2858.75], [758.0, 2895.0], [759.0, 3514.5], [757.0, 2770.0], [753.0, 3012.2], [774.0, 3222.5], [770.0, 3000.6666666666665], [768.0, 3636.5], [769.0, 5777.0], [783.0, 3016.4], [782.0, 3106.0], [781.0, 2952.1111111111113], [780.0, 3609.2], [779.0, 3979.0], [771.0, 3734.4], [772.0, 3316.3333333333335], [773.0, 2955.6666666666665], [775.0, 2619.0], [792.0, 4481.0], [794.0, 4584.0], [793.0, 3538.0], [796.0, 3931.0], [795.0, 4588.0], [797.0, 3375.0], [798.0, 4324.666666666667], [799.0, 3285.6666666666665], [784.0, 3806.0], [788.0, 3245.3333333333335], [790.0, 3504.5], [791.0, 3060.0], [789.0, 2957.3333333333335], [787.0, 2848.5], [786.0, 4206.5], [785.0, 4348.0], [776.0, 3760.25], [777.0, 4581.0], [778.0, 3270.0], [824.0, 3317.5], [803.0, 3540.0], [800.0, 3448.5], [802.0, 3483.0], [801.0, 2830.5], [804.0, 4317.5], [805.0, 3517.0], [806.0, 3203.75], [808.0, 3607.0], [810.0, 4931.0], [809.0, 5065.0], [812.0, 4136.0], [811.0, 3196.0], [814.0, 5561.0], [813.0, 4067.0], [815.0, 4824.0], [807.0, 4586.5], [826.0, 3976.25], [827.0, 3460.8], [828.0, 4608.0], [829.0, 3440.5], [830.0, 3761.0], [831.0, 3150.6666666666665], [825.0, 2755.0], [817.0, 2882.857142857143], [816.0, 3611.5], [818.0, 3028.4999999999995], [819.0, 3703.333333333333], [821.0, 3844.5], [822.0, 3704.0], [823.0, 3694.0], [820.0, 3463.5], [836.0, 3680.3333333333335], [844.0, 3572.0], [835.0, 2881.0], [834.0, 4015.0], [833.0, 4247.0], [832.0, 4659.0], [845.0, 3649.3333333333335], [846.0, 2975.428571428571], [847.0, 2971.8], [837.0, 4486.0], [838.0, 4164.5], [839.0, 4268.0], [849.0, 3715.3333333333335], [851.0, 2893.375], [850.0, 3563.0], [852.0, 3075.0], [853.0, 3456.0], [855.0, 3738.5], [854.0, 3501.0], [848.0, 3667.5714285714284], [863.0, 3096.1666666666665], [861.0, 3162.0], [862.0, 2960.1666666666665], [859.0, 3111.0], [860.0, 3802.25], [857.0, 3665.3333333333335], [856.0, 3381.0], [858.0, 3711.25], [840.0, 3449.3333333333335], [842.0, 3137.0], [843.0, 3932.25], [841.0, 3508.0], [870.0, 3299.5], [865.0, 3263.0], [864.0, 3619.6666666666665], [877.0, 3474.0], [878.0, 3151.0], [879.0, 3646.8333333333335], [875.0, 3290.1428571428573], [874.0, 4178.0], [876.0, 3354.5], [866.0, 3130.0], [868.0, 2800.6666666666665], [869.0, 5525.0], [867.0, 3707.0], [872.0, 3630.857142857143], [871.0, 3361.0], [888.0, 3154.333333333333], [890.0, 3501.222222222222], [891.0, 3195.0], [892.0, 2787.0], [893.0, 3898.0], [895.0, 3322.0], [894.0, 4641.0], [889.0, 3619.0], [880.0, 3515.2], [881.0, 3676.5], [882.0, 4869.0], [883.0, 4230.0], [885.0, 4305.0], [887.0, 3407.5], [886.0, 3715.25], [884.0, 3963.5], [873.0, 4050.0], [901.0, 3654.6666666666665], [897.0, 3573.5], [896.0, 3083.0], [898.0, 5304.0], [900.0, 4702.0], [899.0, 3865.0], [911.0, 4923.0], [910.0, 4871.0], [909.0, 2798.0], [908.0, 3706.0], [902.0, 3424.6666666666665], [905.0, 3402.7058823529414], [904.0, 3268.5294117647063], [906.0, 3291.4444444444443], [903.0, 3727.4], [907.0, 4114.5], [912.0, 3125.0], [927.0, 3490.0], [926.0, 4702.0], [925.0, 5005.0], [924.0, 4260.0], [923.0, 6500.0], [922.0, 4150.0], [921.0, 3515.0], [920.0, 5160.0], [913.0, 3548.6666666666665], [915.0, 4667.0], [914.0, 4511.0], [917.0, 4906.0], [916.0, 5857.0], [919.0, 4891.0], [918.0, 4343.0], [956.0, 4498.0], [959.0, 4419.0], [945.0, 4128.0], [944.0, 5151.0], [947.0, 4253.0], [946.0, 3559.0], [949.0, 4549.0], [948.0, 4616.0], [958.0, 4973.0], [957.0, 3659.0], [955.0, 4781.0], [954.0, 4586.0], [953.0, 4141.0], [952.0, 5235.0], [943.0, 4889.0], [929.0, 1983.0], [928.0, 4047.0], [931.0, 4693.0], [930.0, 4780.0], [933.0, 3528.0], [932.0, 4019.0], [935.0, 3988.0], [934.0, 4534.0], [942.0, 1942.0], [941.0, 4457.0], [940.0, 4016.0], [939.0, 3011.0], [938.0, 5797.0], [937.0, 4628.0], [936.0, 4209.0], [951.0, 4076.0], [950.0, 4740.0], [984.0, 5193.0], [989.0, 3419.0], [991.0, 4098.0], [977.0, 3573.0], [976.0, 5279.0], [979.0, 4602.0], [978.0, 4025.0], [988.0, 4040.0], [986.0, 4525.0], [985.0, 4198.0], [975.0, 4921.0], [960.0, 4321.0], [962.0, 4047.0], [961.0, 4222.0], [964.0, 4986.0], [963.0, 3502.0], [967.0, 4217.0], [965.0, 4918.0], [974.0, 4206.0], [973.0, 4465.0], [972.0, 3458.5], [970.0, 3847.0], [969.0, 4021.0], [968.0, 4092.0], [983.0, 5329.0], [982.0, 4756.0], [981.0, 3900.0], [980.0, 4490.0], [1020.0, 3931.0], [1023.0, 4401.0], [1009.0, 4522.0], [1008.0, 4313.0], [1011.0, 3994.0], [1010.0, 3654.0], [1013.0, 4686.0], [1012.0, 4589.0], [1022.0, 4202.0], [1021.0, 4730.0], [1019.0, 5329.0], [1018.0, 4711.0], [1017.0, 4346.0], [1016.0, 3746.0], [1007.0, 3961.0], [993.0, 3473.0], [992.0, 4649.0], [995.0, 4526.0], [994.0, 4025.0], [997.0, 4164.0], [996.0, 3186.0], [999.0, 3453.0], [998.0, 4427.0], [1006.0, 4125.0], [1005.0, 4505.0], [1004.0, 3816.0], [1003.0, 4183.0], [1002.0, 4396.0], [1001.0, 4158.0], [1000.0, 5803.0], [1015.0, 4544.0], [1014.0, 3886.0], [1084.0, 4007.166666666667], [1056.0, 2956.0], [1058.0, 4176.0], [1060.0, 4121.0], [1064.0, 4400.0], [1066.0, 4511.0], [1068.0, 3947.0], [1070.0, 4662.0], [1086.0, 3269.6153846153848], [1082.0, 4223.333333333333], [1080.0, 4773.0], [1078.0, 4418.0], [1076.0, 3786.0], [1074.0, 5123.0], [1072.0, 4276.0], [1038.0, 4739.0], [1036.0, 3528.0], [1034.0, 3969.0], [1032.0, 3019.0], [1030.0, 3719.0], [1028.0, 4462.0], [1026.0, 4520.0], [1024.0, 4839.0], [1054.0, 5447.0], [1052.0, 4983.0], [1050.0, 4104.0], [1048.0, 4168.5], [1046.0, 2235.0], [1044.0, 4608.0], [1042.0, 4140.0], [1040.0, 5198.0], [1098.0, 3719.25], [1096.0, 3554.8], [1118.0, 4014.4444444444443], [1116.0, 3693.5], [1088.0, 3776.0], [1090.0, 3845.5714285714284], [1092.0, 3880.5], [1094.0, 4056.25], [1100.0, 4262.8], [1136.0, 2663.0], [1138.0, 3605.9166666666665], [1140.0, 3660.75], [1142.0, 4517.25], [1144.0, 4314.5], [1146.0, 4077.25], [1148.0, 3254.0], [1120.0, 3877.6], [1124.0, 3671.0], [1122.0, 4097.0], [1128.0, 2901.0], [1126.0, 4495.0], [1130.0, 3670.5], [1134.0, 3945.0], [1132.0, 4322.4], [1102.0, 3568.0], [1114.0, 4017.888888888889], [1112.0, 3774.777777777778], [1110.0, 3782.6], [1108.0, 3872.5714285714284], [1106.0, 4178.5], [1104.0, 3778.8], [1083.0, 3980.25], [1075.0, 3930.0], [1087.0, 3423.3333333333335], [1057.0, 3926.0], [1059.0, 4164.0], [1063.0, 3553.0], [1061.0, 4408.0], [1065.0, 4048.0], [1067.0, 3932.0], [1069.0, 4120.0], [1071.0, 4717.0], [1085.0, 3888.2], [1079.0, 4383.0], [1077.0, 5828.0], [1073.0, 3198.0], [1039.0, 5134.0], [1037.0, 6068.0], [1035.0, 4477.0], [1033.0, 4865.0], [1031.0, 4318.0], [1029.0, 5249.0], [1027.0, 4671.0], [1025.0, 3345.0], [1055.0, 3892.0], [1053.0, 4606.0], [1051.0, 4477.0], [1049.0, 4453.0], [1045.0, 3788.0], [1043.0, 4214.0], [1041.0, 4161.0], [1097.0, 3765.3333333333335], [1113.0, 4091.8], [1117.0, 3911.0], [1119.0, 3516.5], [1089.0, 3827.25], [1093.0, 5136.0], [1091.0, 3959.0], [1095.0, 3733.2], [1099.0, 3755.5], [1101.0, 4469.333333333333], [1103.0, 4069.75], [1137.0, 3523.0], [1141.0, 3903.6], [1143.0, 3911.0], [1145.0, 4303.0], [1147.0, 3481.3333333333335], [1139.0, 4377.75], [1123.0, 3900.0], [1121.0, 3994.0], [1125.0, 4012.0], [1129.0, 4725.0], [1127.0, 4363.0], [1131.0, 3620.6666666666665], [1133.0, 3679.75], [1135.0, 4420.0], [1115.0, 4270.0], [1111.0, 3835.0666666666666], [1109.0, 3783.125], [1107.0, 3668.3333333333335], [1105.0, 3884.5], [1.0, 5946.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[579.3313333333326, 3083.099000000001]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1148.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1782.2333333333333, "minX": 1.54961922E12, "maxY": 18093.433333333334, "series": [{"data": [[1.54961928E12, 18093.433333333334], [1.54961922E12, 2953.9333333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961928E12, 10917.766666666666], [1.54961922E12, 1782.2333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 322.1757719714965, "minX": 1.54961922E12, "maxY": 3533.796432725868, "series": [{"data": [[1.54961928E12, 3533.796432725868], [1.54961922E12, 322.1757719714965]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961928E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 322.15439429928745, "minX": 1.54961922E12, "maxY": 3533.789453276463, "series": [{"data": [[1.54961928E12, 3533.789453276463], [1.54961922E12, 322.15439429928745]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961928E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 4.598574821852727, "minX": 1.54961922E12, "maxY": 95.78402481582013, "series": [{"data": [[1.54961928E12, 95.78402481582013], [1.54961922E12, 4.598574821852727]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961928E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 98.0, "minX": 1.54961922E12, "maxY": 7067.0, "series": [{"data": [[1.54961928E12, 7067.0], [1.54961922E12, 980.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961928E12, 367.0], [1.54961922E12, 98.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961928E12, 5211.9], [1.54961922E12, 571.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961928E12, 6149.759999999995], [1.54961922E12, 808.7399999999991]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961928E12, 5557.849999999999], [1.54961922E12, 653.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 282.0, "minX": 7.0, "maxY": 3657.0, "series": [{"data": [[42.0, 3657.0], [7.0, 282.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 42.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 282.0, "minX": 7.0, "maxY": 3657.0, "series": [{"data": [[42.0, 3657.0], [7.0, 282.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 42.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 9.833333333333334, "minX": 1.54961922E12, "maxY": 40.166666666666664, "series": [{"data": [[1.54961928E12, 40.166666666666664], [1.54961922E12, 9.833333333333334]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 7.016666666666667, "minX": 1.54961922E12, "maxY": 42.983333333333334, "series": [{"data": [[1.54961928E12, 42.983333333333334], [1.54961922E12, 7.016666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 7.016666666666667, "minX": 1.54961922E12, "maxY": 42.983333333333334, "series": [{"data": [[1.54961928E12, 42.983333333333334], [1.54961922E12, 7.016666666666667]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961928E12, "title": "Transactions Per Second"}},
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
