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
        data: {"result": {"minY": 154.0, "minX": 0.0, "maxY": 7239.0, "series": [{"data": [[0.0, 154.0], [0.1, 170.0], [0.2, 189.0], [0.3, 209.0], [0.4, 222.0], [0.5, 231.0], [0.6, 233.0], [0.7, 239.0], [0.8, 247.0], [0.9, 252.0], [1.0, 257.0], [1.1, 265.0], [1.2, 267.0], [1.3, 271.0], [1.4, 274.0], [1.5, 277.0], [1.6, 279.0], [1.7, 287.0], [1.8, 291.0], [1.9, 292.0], [2.0, 297.0], [2.1, 300.0], [2.2, 304.0], [2.3, 307.0], [2.4, 309.0], [2.5, 312.0], [2.6, 315.0], [2.7, 318.0], [2.8, 319.0], [2.9, 325.0], [3.0, 326.0], [3.1, 330.0], [3.2, 331.0], [3.3, 334.0], [3.4, 337.0], [3.5, 340.0], [3.6, 345.0], [3.7, 346.0], [3.8, 347.0], [3.9, 349.0], [4.0, 351.0], [4.1, 355.0], [4.2, 359.0], [4.3, 363.0], [4.4, 364.0], [4.5, 366.0], [4.6, 368.0], [4.7, 370.0], [4.8, 371.0], [4.9, 372.0], [5.0, 373.0], [5.1, 375.0], [5.2, 378.0], [5.3, 382.0], [5.4, 386.0], [5.5, 387.0], [5.6, 391.0], [5.7, 392.0], [5.8, 392.0], [5.9, 394.0], [6.0, 396.0], [6.1, 398.0], [6.2, 400.0], [6.3, 405.0], [6.4, 407.0], [6.5, 409.0], [6.6, 411.0], [6.7, 412.0], [6.8, 416.0], [6.9, 417.0], [7.0, 418.0], [7.1, 420.0], [7.2, 424.0], [7.3, 428.0], [7.4, 429.0], [7.5, 430.0], [7.6, 432.0], [7.7, 434.0], [7.8, 436.0], [7.9, 438.0], [8.0, 439.0], [8.1, 443.0], [8.2, 446.0], [8.3, 450.0], [8.4, 453.0], [8.5, 457.0], [8.6, 460.0], [8.7, 461.0], [8.8, 462.0], [8.9, 467.0], [9.0, 471.0], [9.1, 475.0], [9.2, 477.0], [9.3, 479.0], [9.4, 484.0], [9.5, 486.0], [9.6, 487.0], [9.7, 489.0], [9.8, 491.0], [9.9, 493.0], [10.0, 497.0], [10.1, 500.0], [10.2, 503.0], [10.3, 512.0], [10.4, 514.0], [10.5, 523.0], [10.6, 529.0], [10.7, 532.0], [10.8, 534.0], [10.9, 539.0], [11.0, 544.0], [11.1, 547.0], [11.2, 549.0], [11.3, 552.0], [11.4, 558.0], [11.5, 560.0], [11.6, 562.0], [11.7, 564.0], [11.8, 573.0], [11.9, 577.0], [12.0, 578.0], [12.1, 580.0], [12.2, 584.0], [12.3, 588.0], [12.4, 601.0], [12.5, 607.0], [12.6, 615.0], [12.7, 622.0], [12.8, 627.0], [12.9, 639.0], [13.0, 648.0], [13.1, 655.0], [13.2, 657.0], [13.3, 669.0], [13.4, 673.0], [13.5, 681.0], [13.6, 684.0], [13.7, 692.0], [13.8, 703.0], [13.9, 709.0], [14.0, 713.0], [14.1, 717.0], [14.2, 719.0], [14.3, 730.0], [14.4, 737.0], [14.5, 746.0], [14.6, 749.0], [14.7, 751.0], [14.8, 758.0], [14.9, 764.0], [15.0, 769.0], [15.1, 781.0], [15.2, 786.0], [15.3, 801.0], [15.4, 810.0], [15.5, 814.0], [15.6, 817.0], [15.7, 825.0], [15.8, 836.0], [15.9, 838.0], [16.0, 841.0], [16.1, 845.0], [16.2, 848.0], [16.3, 863.0], [16.4, 881.0], [16.5, 888.0], [16.6, 890.0], [16.7, 893.0], [16.8, 898.0], [16.9, 906.0], [17.0, 914.0], [17.1, 917.0], [17.2, 928.0], [17.3, 941.0], [17.4, 950.0], [17.5, 957.0], [17.6, 961.0], [17.7, 964.0], [17.8, 967.0], [17.9, 976.0], [18.0, 986.0], [18.1, 992.0], [18.2, 1010.0], [18.3, 1017.0], [18.4, 1022.0], [18.5, 1030.0], [18.6, 1037.0], [18.7, 1041.0], [18.8, 1048.0], [18.9, 1051.0], [19.0, 1057.0], [19.1, 1062.0], [19.2, 1066.0], [19.3, 1078.0], [19.4, 1094.0], [19.5, 1102.0], [19.6, 1104.0], [19.7, 1113.0], [19.8, 1127.0], [19.9, 1134.0], [20.0, 1154.0], [20.1, 1159.0], [20.2, 1164.0], [20.3, 1175.0], [20.4, 1189.0], [20.5, 1199.0], [20.6, 1215.0], [20.7, 1225.0], [20.8, 1229.0], [20.9, 1239.0], [21.0, 1251.0], [21.1, 1259.0], [21.2, 1268.0], [21.3, 1284.0], [21.4, 1293.0], [21.5, 1305.0], [21.6, 1308.0], [21.7, 1310.0], [21.8, 1325.0], [21.9, 1332.0], [22.0, 1344.0], [22.1, 1353.0], [22.2, 1365.0], [22.3, 1375.0], [22.4, 1386.0], [22.5, 1389.0], [22.6, 1398.0], [22.7, 1402.0], [22.8, 1411.0], [22.9, 1424.0], [23.0, 1429.0], [23.1, 1435.0], [23.2, 1442.0], [23.3, 1453.0], [23.4, 1481.0], [23.5, 1491.0], [23.6, 1515.0], [23.7, 1519.0], [23.8, 1527.0], [23.9, 1532.0], [24.0, 1547.0], [24.1, 1550.0], [24.2, 1568.0], [24.3, 1596.0], [24.4, 1621.0], [24.5, 1637.0], [24.6, 1650.0], [24.7, 1656.0], [24.8, 1670.0], [24.9, 1672.0], [25.0, 1682.0], [25.1, 1690.0], [25.2, 1695.0], [25.3, 1713.0], [25.4, 1718.0], [25.5, 1733.0], [25.6, 1758.0], [25.7, 1773.0], [25.8, 1778.0], [25.9, 1802.0], [26.0, 1814.0], [26.1, 1817.0], [26.2, 1822.0], [26.3, 1831.0], [26.4, 1839.0], [26.5, 1854.0], [26.6, 1864.0], [26.7, 1871.0], [26.8, 1878.0], [26.9, 1888.0], [27.0, 1894.0], [27.1, 1900.0], [27.2, 1903.0], [27.3, 1912.0], [27.4, 1938.0], [27.5, 1946.0], [27.6, 1955.0], [27.7, 1959.0], [27.8, 1965.0], [27.9, 1969.0], [28.0, 1971.0], [28.1, 1973.0], [28.2, 1977.0], [28.3, 1986.0], [28.4, 1988.0], [28.5, 1990.0], [28.6, 1994.0], [28.7, 2009.0], [28.8, 2018.0], [28.9, 2029.0], [29.0, 2034.0], [29.1, 2039.0], [29.2, 2044.0], [29.3, 2062.0], [29.4, 2065.0], [29.5, 2069.0], [29.6, 2076.0], [29.7, 2081.0], [29.8, 2088.0], [29.9, 2096.0], [30.0, 2098.0], [30.1, 2105.0], [30.2, 2108.0], [30.3, 2114.0], [30.4, 2115.0], [30.5, 2119.0], [30.6, 2121.0], [30.7, 2129.0], [30.8, 2129.0], [30.9, 2134.0], [31.0, 2137.0], [31.1, 2142.0], [31.2, 2148.0], [31.3, 2153.0], [31.4, 2164.0], [31.5, 2172.0], [31.6, 2182.0], [31.7, 2188.0], [31.8, 2201.0], [31.9, 2207.0], [32.0, 2214.0], [32.1, 2217.0], [32.2, 2227.0], [32.3, 2229.0], [32.4, 2238.0], [32.5, 2242.0], [32.6, 2251.0], [32.7, 2256.0], [32.8, 2261.0], [32.9, 2264.0], [33.0, 2271.0], [33.1, 2274.0], [33.2, 2279.0], [33.3, 2282.0], [33.4, 2288.0], [33.5, 2294.0], [33.6, 2296.0], [33.7, 2296.0], [33.8, 2304.0], [33.9, 2309.0], [34.0, 2312.0], [34.1, 2315.0], [34.2, 2319.0], [34.3, 2322.0], [34.4, 2334.0], [34.5, 2344.0], [34.6, 2347.0], [34.7, 2353.0], [34.8, 2363.0], [34.9, 2365.0], [35.0, 2375.0], [35.1, 2378.0], [35.2, 2383.0], [35.3, 2390.0], [35.4, 2391.0], [35.5, 2395.0], [35.6, 2397.0], [35.7, 2403.0], [35.8, 2412.0], [35.9, 2414.0], [36.0, 2417.0], [36.1, 2427.0], [36.2, 2432.0], [36.3, 2439.0], [36.4, 2441.0], [36.5, 2443.0], [36.6, 2453.0], [36.7, 2460.0], [36.8, 2467.0], [36.9, 2474.0], [37.0, 2477.0], [37.1, 2480.0], [37.2, 2485.0], [37.3, 2501.0], [37.4, 2508.0], [37.5, 2517.0], [37.6, 2522.0], [37.7, 2525.0], [37.8, 2527.0], [37.9, 2532.0], [38.0, 2536.0], [38.1, 2540.0], [38.2, 2548.0], [38.3, 2552.0], [38.4, 2554.0], [38.5, 2555.0], [38.6, 2560.0], [38.7, 2563.0], [38.8, 2568.0], [38.9, 2570.0], [39.0, 2580.0], [39.1, 2585.0], [39.2, 2594.0], [39.3, 2595.0], [39.4, 2600.0], [39.5, 2605.0], [39.6, 2614.0], [39.7, 2625.0], [39.8, 2634.0], [39.9, 2639.0], [40.0, 2640.0], [40.1, 2651.0], [40.2, 2658.0], [40.3, 2665.0], [40.4, 2678.0], [40.5, 2684.0], [40.6, 2689.0], [40.7, 2691.0], [40.8, 2694.0], [40.9, 2702.0], [41.0, 2705.0], [41.1, 2710.0], [41.2, 2713.0], [41.3, 2717.0], [41.4, 2720.0], [41.5, 2729.0], [41.6, 2735.0], [41.7, 2746.0], [41.8, 2748.0], [41.9, 2754.0], [42.0, 2764.0], [42.1, 2774.0], [42.2, 2780.0], [42.3, 2785.0], [42.4, 2789.0], [42.5, 2795.0], [42.6, 2798.0], [42.7, 2804.0], [42.8, 2812.0], [42.9, 2818.0], [43.0, 2819.0], [43.1, 2830.0], [43.2, 2836.0], [43.3, 2840.0], [43.4, 2843.0], [43.5, 2848.0], [43.6, 2851.0], [43.7, 2856.0], [43.8, 2863.0], [43.9, 2864.0], [44.0, 2870.0], [44.1, 2875.0], [44.2, 2882.0], [44.3, 2888.0], [44.4, 2899.0], [44.5, 2901.0], [44.6, 2907.0], [44.7, 2912.0], [44.8, 2913.0], [44.9, 2920.0], [45.0, 2925.0], [45.1, 2926.0], [45.2, 2931.0], [45.3, 2932.0], [45.4, 2937.0], [45.5, 2943.0], [45.6, 2947.0], [45.7, 2954.0], [45.8, 2956.0], [45.9, 2961.0], [46.0, 2971.0], [46.1, 2975.0], [46.2, 2980.0], [46.3, 2984.0], [46.4, 2989.0], [46.5, 2991.0], [46.6, 2994.0], [46.7, 2995.0], [46.8, 3002.0], [46.9, 3006.0], [47.0, 3008.0], [47.1, 3014.0], [47.2, 3018.0], [47.3, 3023.0], [47.4, 3025.0], [47.5, 3028.0], [47.6, 3029.0], [47.7, 3034.0], [47.8, 3036.0], [47.9, 3037.0], [48.0, 3046.0], [48.1, 3049.0], [48.2, 3054.0], [48.3, 3062.0], [48.4, 3069.0], [48.5, 3077.0], [48.6, 3081.0], [48.7, 3083.0], [48.8, 3088.0], [48.9, 3092.0], [49.0, 3099.0], [49.1, 3101.0], [49.2, 3104.0], [49.3, 3109.0], [49.4, 3113.0], [49.5, 3116.0], [49.6, 3119.0], [49.7, 3124.0], [49.8, 3128.0], [49.9, 3135.0], [50.0, 3136.0], [50.1, 3140.0], [50.2, 3147.0], [50.3, 3155.0], [50.4, 3157.0], [50.5, 3161.0], [50.6, 3162.0], [50.7, 3163.0], [50.8, 3167.0], [50.9, 3169.0], [51.0, 3179.0], [51.1, 3185.0], [51.2, 3198.0], [51.3, 3202.0], [51.4, 3206.0], [51.5, 3212.0], [51.6, 3215.0], [51.7, 3223.0], [51.8, 3231.0], [51.9, 3233.0], [52.0, 3237.0], [52.1, 3240.0], [52.2, 3248.0], [52.3, 3253.0], [52.4, 3258.0], [52.5, 3262.0], [52.6, 3275.0], [52.7, 3288.0], [52.8, 3296.0], [52.9, 3300.0], [53.0, 3303.0], [53.1, 3307.0], [53.2, 3312.0], [53.3, 3317.0], [53.4, 3321.0], [53.5, 3325.0], [53.6, 3328.0], [53.7, 3333.0], [53.8, 3336.0], [53.9, 3345.0], [54.0, 3353.0], [54.1, 3360.0], [54.2, 3366.0], [54.3, 3370.0], [54.4, 3374.0], [54.5, 3382.0], [54.6, 3386.0], [54.7, 3393.0], [54.8, 3404.0], [54.9, 3410.0], [55.0, 3411.0], [55.1, 3415.0], [55.2, 3422.0], [55.3, 3429.0], [55.4, 3435.0], [55.5, 3439.0], [55.6, 3440.0], [55.7, 3447.0], [55.8, 3450.0], [55.9, 3455.0], [56.0, 3461.0], [56.1, 3471.0], [56.2, 3475.0], [56.3, 3483.0], [56.4, 3487.0], [56.5, 3490.0], [56.6, 3496.0], [56.7, 3501.0], [56.8, 3505.0], [56.9, 3513.0], [57.0, 3521.0], [57.1, 3525.0], [57.2, 3528.0], [57.3, 3530.0], [57.4, 3532.0], [57.5, 3538.0], [57.6, 3541.0], [57.7, 3548.0], [57.8, 3552.0], [57.9, 3558.0], [58.0, 3561.0], [58.1, 3566.0], [58.2, 3569.0], [58.3, 3574.0], [58.4, 3580.0], [58.5, 3583.0], [58.6, 3585.0], [58.7, 3593.0], [58.8, 3595.0], [58.9, 3602.0], [59.0, 3605.0], [59.1, 3617.0], [59.2, 3623.0], [59.3, 3627.0], [59.4, 3640.0], [59.5, 3642.0], [59.6, 3646.0], [59.7, 3647.0], [59.8, 3651.0], [59.9, 3654.0], [60.0, 3661.0], [60.1, 3668.0], [60.2, 3669.0], [60.3, 3675.0], [60.4, 3677.0], [60.5, 3683.0], [60.6, 3695.0], [60.7, 3703.0], [60.8, 3707.0], [60.9, 3713.0], [61.0, 3720.0], [61.1, 3736.0], [61.2, 3739.0], [61.3, 3746.0], [61.4, 3749.0], [61.5, 3759.0], [61.6, 3764.0], [61.7, 3768.0], [61.8, 3769.0], [61.9, 3776.0], [62.0, 3786.0], [62.1, 3793.0], [62.2, 3801.0], [62.3, 3811.0], [62.4, 3816.0], [62.5, 3824.0], [62.6, 3826.0], [62.7, 3831.0], [62.8, 3833.0], [62.9, 3843.0], [63.0, 3846.0], [63.1, 3851.0], [63.2, 3857.0], [63.3, 3860.0], [63.4, 3862.0], [63.5, 3872.0], [63.6, 3873.0], [63.7, 3882.0], [63.8, 3890.0], [63.9, 3896.0], [64.0, 3901.0], [64.1, 3903.0], [64.2, 3910.0], [64.3, 3915.0], [64.4, 3917.0], [64.5, 3919.0], [64.6, 3925.0], [64.7, 3936.0], [64.8, 3949.0], [64.9, 3951.0], [65.0, 3955.0], [65.1, 3961.0], [65.2, 3964.0], [65.3, 3967.0], [65.4, 3973.0], [65.5, 3984.0], [65.6, 3990.0], [65.7, 3995.0], [65.8, 4001.0], [65.9, 4002.0], [66.0, 4005.0], [66.1, 4011.0], [66.2, 4013.0], [66.3, 4019.0], [66.4, 4028.0], [66.5, 4036.0], [66.6, 4042.0], [66.7, 4044.0], [66.8, 4054.0], [66.9, 4059.0], [67.0, 4065.0], [67.1, 4068.0], [67.2, 4076.0], [67.3, 4082.0], [67.4, 4085.0], [67.5, 4088.0], [67.6, 4092.0], [67.7, 4100.0], [67.8, 4102.0], [67.9, 4106.0], [68.0, 4108.0], [68.1, 4113.0], [68.2, 4116.0], [68.3, 4127.0], [68.4, 4133.0], [68.5, 4140.0], [68.6, 4145.0], [68.7, 4149.0], [68.8, 4153.0], [68.9, 4156.0], [69.0, 4162.0], [69.1, 4164.0], [69.2, 4171.0], [69.3, 4177.0], [69.4, 4184.0], [69.5, 4187.0], [69.6, 4192.0], [69.7, 4194.0], [69.8, 4204.0], [69.9, 4206.0], [70.0, 4207.0], [70.1, 4210.0], [70.2, 4210.0], [70.3, 4213.0], [70.4, 4214.0], [70.5, 4219.0], [70.6, 4223.0], [70.7, 4238.0], [70.8, 4245.0], [70.9, 4249.0], [71.0, 4250.0], [71.1, 4253.0], [71.2, 4262.0], [71.3, 4266.0], [71.4, 4274.0], [71.5, 4280.0], [71.6, 4285.0], [71.7, 4292.0], [71.8, 4294.0], [71.9, 4296.0], [72.0, 4301.0], [72.1, 4313.0], [72.2, 4319.0], [72.3, 4325.0], [72.4, 4326.0], [72.5, 4334.0], [72.6, 4346.0], [72.7, 4351.0], [72.8, 4359.0], [72.9, 4369.0], [73.0, 4378.0], [73.1, 4379.0], [73.2, 4384.0], [73.3, 4385.0], [73.4, 4392.0], [73.5, 4395.0], [73.6, 4398.0], [73.7, 4403.0], [73.8, 4411.0], [73.9, 4415.0], [74.0, 4425.0], [74.1, 4429.0], [74.2, 4431.0], [74.3, 4434.0], [74.4, 4438.0], [74.5, 4439.0], [74.6, 4442.0], [74.7, 4445.0], [74.8, 4453.0], [74.9, 4458.0], [75.0, 4460.0], [75.1, 4464.0], [75.2, 4470.0], [75.3, 4478.0], [75.4, 4487.0], [75.5, 4489.0], [75.6, 4493.0], [75.7, 4501.0], [75.8, 4504.0], [75.9, 4511.0], [76.0, 4515.0], [76.1, 4522.0], [76.2, 4525.0], [76.3, 4528.0], [76.4, 4530.0], [76.5, 4531.0], [76.6, 4538.0], [76.7, 4540.0], [76.8, 4548.0], [76.9, 4549.0], [77.0, 4553.0], [77.1, 4554.0], [77.2, 4556.0], [77.3, 4562.0], [77.4, 4565.0], [77.5, 4573.0], [77.6, 4577.0], [77.7, 4582.0], [77.8, 4586.0], [77.9, 4590.0], [78.0, 4592.0], [78.1, 4598.0], [78.2, 4601.0], [78.3, 4604.0], [78.4, 4607.0], [78.5, 4615.0], [78.6, 4617.0], [78.7, 4618.0], [78.8, 4626.0], [78.9, 4630.0], [79.0, 4633.0], [79.1, 4638.0], [79.2, 4639.0], [79.3, 4645.0], [79.4, 4647.0], [79.5, 4654.0], [79.6, 4657.0], [79.7, 4658.0], [79.8, 4666.0], [79.9, 4675.0], [80.0, 4679.0], [80.1, 4683.0], [80.2, 4689.0], [80.3, 4692.0], [80.4, 4701.0], [80.5, 4704.0], [80.6, 4715.0], [80.7, 4720.0], [80.8, 4723.0], [80.9, 4727.0], [81.0, 4735.0], [81.1, 4738.0], [81.2, 4745.0], [81.3, 4749.0], [81.4, 4757.0], [81.5, 4759.0], [81.6, 4763.0], [81.7, 4767.0], [81.8, 4771.0], [81.9, 4780.0], [82.0, 4784.0], [82.1, 4788.0], [82.2, 4795.0], [82.3, 4798.0], [82.4, 4799.0], [82.5, 4803.0], [82.6, 4806.0], [82.7, 4809.0], [82.8, 4818.0], [82.9, 4826.0], [83.0, 4833.0], [83.1, 4836.0], [83.2, 4840.0], [83.3, 4848.0], [83.4, 4854.0], [83.5, 4862.0], [83.6, 4867.0], [83.7, 4874.0], [83.8, 4876.0], [83.9, 4883.0], [84.0, 4887.0], [84.1, 4901.0], [84.2, 4902.0], [84.3, 4911.0], [84.4, 4911.0], [84.5, 4916.0], [84.6, 4921.0], [84.7, 4928.0], [84.8, 4934.0], [84.9, 4936.0], [85.0, 4937.0], [85.1, 4940.0], [85.2, 4944.0], [85.3, 4950.0], [85.4, 4957.0], [85.5, 4963.0], [85.6, 4966.0], [85.7, 4967.0], [85.8, 4970.0], [85.9, 4973.0], [86.0, 4976.0], [86.1, 4978.0], [86.2, 4989.0], [86.3, 4993.0], [86.4, 4995.0], [86.5, 4999.0], [86.6, 5012.0], [86.7, 5021.0], [86.8, 5024.0], [86.9, 5027.0], [87.0, 5030.0], [87.1, 5033.0], [87.2, 5044.0], [87.3, 5048.0], [87.4, 5049.0], [87.5, 5051.0], [87.6, 5053.0], [87.7, 5059.0], [87.8, 5063.0], [87.9, 5066.0], [88.0, 5072.0], [88.1, 5078.0], [88.2, 5082.0], [88.3, 5101.0], [88.4, 5107.0], [88.5, 5114.0], [88.6, 5120.0], [88.7, 5123.0], [88.8, 5130.0], [88.9, 5134.0], [89.0, 5141.0], [89.1, 5150.0], [89.2, 5154.0], [89.3, 5161.0], [89.4, 5170.0], [89.5, 5175.0], [89.6, 5179.0], [89.7, 5183.0], [89.8, 5193.0], [89.9, 5200.0], [90.0, 5209.0], [90.1, 5213.0], [90.2, 5218.0], [90.3, 5220.0], [90.4, 5228.0], [90.5, 5229.0], [90.6, 5245.0], [90.7, 5247.0], [90.8, 5253.0], [90.9, 5260.0], [91.0, 5263.0], [91.1, 5269.0], [91.2, 5279.0], [91.3, 5284.0], [91.4, 5286.0], [91.5, 5289.0], [91.6, 5292.0], [91.7, 5302.0], [91.8, 5307.0], [91.9, 5318.0], [92.0, 5321.0], [92.1, 5324.0], [92.2, 5325.0], [92.3, 5331.0], [92.4, 5343.0], [92.5, 5350.0], [92.6, 5356.0], [92.7, 5359.0], [92.8, 5365.0], [92.9, 5375.0], [93.0, 5378.0], [93.1, 5384.0], [93.2, 5393.0], [93.3, 5400.0], [93.4, 5404.0], [93.5, 5414.0], [93.6, 5426.0], [93.7, 5433.0], [93.8, 5441.0], [93.9, 5454.0], [94.0, 5465.0], [94.1, 5469.0], [94.2, 5478.0], [94.3, 5484.0], [94.4, 5488.0], [94.5, 5496.0], [94.6, 5500.0], [94.7, 5511.0], [94.8, 5521.0], [94.9, 5523.0], [95.0, 5532.0], [95.1, 5538.0], [95.2, 5555.0], [95.3, 5559.0], [95.4, 5567.0], [95.5, 5577.0], [95.6, 5588.0], [95.7, 5602.0], [95.8, 5607.0], [95.9, 5608.0], [96.0, 5635.0], [96.1, 5641.0], [96.2, 5649.0], [96.3, 5652.0], [96.4, 5666.0], [96.5, 5682.0], [96.6, 5690.0], [96.7, 5716.0], [96.8, 5725.0], [96.9, 5732.0], [97.0, 5741.0], [97.1, 5749.0], [97.2, 5757.0], [97.3, 5769.0], [97.4, 5779.0], [97.5, 5798.0], [97.6, 5834.0], [97.7, 5856.0], [97.8, 5860.0], [97.9, 5874.0], [98.0, 5897.0], [98.1, 5913.0], [98.2, 5953.0], [98.3, 5968.0], [98.4, 5995.0], [98.5, 6041.0], [98.6, 6051.0], [98.7, 6101.0], [98.8, 6108.0], [98.9, 6120.0], [99.0, 6176.0], [99.1, 6193.0], [99.2, 6267.0], [99.3, 6283.0], [99.4, 6332.0], [99.5, 6446.0], [99.6, 6465.0], [99.7, 6644.0], [99.8, 6712.0], [99.9, 7022.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 125.0, "series": [{"data": [[600.0, 41.0], [700.0, 46.0], [800.0, 47.0], [900.0, 37.0], [1000.0, 40.0], [1100.0, 32.0], [1200.0, 29.0], [1300.0, 34.0], [1400.0, 28.0], [1500.0, 23.0], [1600.0, 27.0], [1700.0, 19.0], [1800.0, 37.0], [1900.0, 46.0], [2000.0, 42.0], [2100.0, 52.0], [2300.0, 58.0], [2200.0, 59.0], [2400.0, 49.0], [2500.0, 63.0], [2600.0, 45.0], [2700.0, 53.0], [2800.0, 54.0], [2900.0, 68.0], [3000.0, 69.0], [3100.0, 67.0], [3200.0, 49.0], [3300.0, 55.0], [3400.0, 57.0], [3500.0, 67.0], [3600.0, 53.0], [3700.0, 47.0], [3800.0, 53.0], [3900.0, 56.0], [4000.0, 57.0], [4100.0, 62.0], [4200.0, 65.0], [4300.0, 51.0], [4400.0, 61.0], [4500.0, 75.0], [4600.0, 67.0], [4700.0, 61.0], [4800.0, 50.0], [4900.0, 73.0], [5000.0, 53.0], [5100.0, 48.0], [5200.0, 53.0], [5300.0, 49.0], [5600.0, 28.0], [5400.0, 39.0], [5500.0, 33.0], [5700.0, 27.0], [5800.0, 16.0], [6100.0, 13.0], [6000.0, 8.0], [5900.0, 11.0], [6300.0, 4.0], [6200.0, 6.0], [6400.0, 6.0], [6500.0, 1.0], [6600.0, 2.0], [6700.0, 3.0], [6900.0, 1.0], [7000.0, 2.0], [7200.0, 1.0], [100.0, 8.0], [200.0, 53.0], [300.0, 125.0], [400.0, 116.0], [500.0, 70.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 304.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2294.0, "series": [{"data": [[1.0, 402.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 304.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2294.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 575.906000000001, "minX": 1.54961874E12, "maxY": 575.906000000001, "series": [{"data": [[1.54961874E12, 575.906000000001]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 329.0, "minX": 1.0, "maxY": 6751.0, "series": [{"data": [[2.0, 5108.0], [3.0, 5290.0], [4.0, 5163.0], [5.0, 4748.0], [6.0, 4855.0], [7.0, 4991.0], [8.0, 4645.0], [9.0, 5725.0], [10.0, 5111.0], [11.0, 5798.0], [12.0, 5028.0], [13.0, 4726.0], [15.0, 4846.0], [16.0, 5172.0], [18.0, 5326.0], [19.0, 5522.0], [20.0, 4549.0], [21.0, 5326.0], [22.0, 4469.0], [24.0, 5309.0], [25.0, 5652.0], [27.0, 5064.0], [28.0, 4844.0], [29.0, 5683.0], [30.0, 5524.0], [31.0, 5343.0], [33.0, 5074.0], [32.0, 5607.0], [35.0, 5652.0], [34.0, 5208.0], [37.0, 5375.0], [36.0, 5325.0], [39.0, 5559.5], [40.0, 5073.0], [42.0, 5201.0], [45.0, 4795.0], [44.0, 4683.0], [47.0, 5588.0], [46.0, 5049.0], [48.0, 5732.0], [51.0, 4818.0], [50.0, 4841.0], [53.0, 4592.0], [52.0, 4565.0], [55.0, 5234.5], [57.0, 5080.0], [59.0, 4702.0], [58.0, 5287.0], [61.0, 5757.0], [60.0, 5521.0], [63.0, 5487.0], [62.0, 5604.0], [67.0, 5682.0], [66.0, 5049.0], [65.0, 5427.0], [64.0, 5348.0], [71.0, 1037.25], [70.0, 1004.75], [69.0, 1839.0], [68.0, 2975.0], [75.0, 669.2857142857142], [74.0, 911.2], [73.0, 1005.4285714285714], [72.0, 1005.125], [79.0, 658.6470588235294], [78.0, 735.8571428571429], [77.0, 947.5], [76.0, 832.8181818181818], [83.0, 570.6111111111111], [82.0, 807.5], [81.0, 768.909090909091], [80.0, 743.9166666666666], [87.0, 657.9375], [86.0, 581.3333333333333], [85.0, 601.7142857142858], [84.0, 734.5999999999999], [88.0, 725.1818181818182], [89.0, 329.0], [91.0, 5246.0], [90.0, 5484.5], [95.0, 5737.0], [94.0, 4866.0], [93.0, 5101.0], [92.0, 4936.0], [97.0, 1942.0], [99.0, 1276.2], [98.0, 5540.0], [96.0, 4529.0], [100.0, 421.8], [102.0, 1113.2857142857142], [101.0, 1967.0], [103.0, 945.8888888888889], [104.0, 1422.75], [105.0, 1916.3333333333333], [107.0, 2671.25], [108.0, 1803.3333333333333], [110.0, 2510.5], [109.0, 3018.5], [111.0, 4439.0], [112.0, 3849.5], [115.0, 971.6666666666667], [114.0, 2087.666666666667], [113.0, 2105.666666666667], [116.0, 1319.8], [117.0, 444.0], [118.0, 3132.6666666666665], [119.0, 5153.0], [122.0, 954.2857142857142], [121.0, 1331.1666666666665], [120.0, 2067.333333333333], [123.0, 467.0], [125.0, 2796.5], [127.0, 3658.6666666666665], [126.0, 655.0], [124.0, 5007.0], [129.0, 1395.4], [128.0, 2612.5], [132.0, 1783.3333333333333], [133.0, 2410.5], [135.0, 1592.25], [134.0, 5715.0], [131.0, 4638.0], [130.0, 4878.0], [136.0, 2093.0], [138.0, 1460.25], [139.0, 2074.666666666667], [137.0, 2765.0], [141.0, 1045.375], [140.0, 1169.5], [143.0, 2272.333333333333], [142.0, 1403.0], [144.0, 1691.6666666666667], [145.0, 3284.0], [149.0, 2800.5], [151.0, 3017.5], [150.0, 5605.0], [148.0, 4415.0], [147.0, 5178.5], [152.0, 1946.0], [153.0, 2106.666666666667], [154.0, 659.0], [159.0, 1139.875], [157.0, 2472.5], [156.0, 2604.5], [155.0, 3647.3333333333335], [158.0, 5222.0], [161.0, 2022.0], [160.0, 1336.5], [165.0, 2146.0], [164.0, 3062.5], [167.0, 5175.0], [166.0, 5519.0], [163.0, 5246.0], [162.0, 4575.0], [168.0, 2837.0], [169.0, 2684.0], [171.0, 1832.75], [170.0, 2656.5], [172.0, 690.5], [173.0, 3259.3333333333335], [175.0, 2494.5], [174.0, 2927.0], [177.0, 1978.0], [180.0, 3172.0], [182.0, 2177.333333333333], [183.0, 371.0], [181.0, 4809.0], [179.0, 4577.0], [178.0, 5022.0], [176.0, 5372.0], [186.0, 2887.5], [189.0, 1298.8571428571427], [190.0, 653.75], [188.0, 2716.0], [191.0, 4499.5], [187.0, 4591.0], [185.0, 5488.0], [184.0, 5060.5], [193.0, 2348.5], [196.0, 2735.5], [197.0, 2795.5], [199.0, 1357.0], [198.0, 4867.0], [195.0, 5608.0], [194.0, 5482.0], [192.0, 5291.0], [201.0, 1673.8], [202.0, 1263.125], [203.0, 1644.0], [204.0, 2221.333333333333], [207.0, 2002.25], [206.0, 4554.0], [205.0, 5400.0], [200.0, 4867.0], [215.0, 2208.333333333333], [214.0, 2829.0], [213.0, 2165.666666666667], [212.0, 2307.0], [210.0, 4720.0], [209.0, 5105.0], [208.0, 4577.0], [217.0, 2351.333333333333], [219.0, 2144.0], [220.0, 1495.4], [218.0, 3227.0], [222.0, 1917.25], [223.0, 5279.0], [221.0, 4964.0], [216.0, 4727.0], [225.0, 1993.75], [229.0, 3081.0], [228.0, 2531.8], [227.0, 914.0], [230.0, 2537.5], [231.0, 4438.0], [226.0, 4508.0], [224.0, 5511.0], [232.0, 2616.5], [235.0, 2015.0], [236.0, 3010.5], [237.0, 3212.0], [238.0, 2461.333333333333], [239.0, 3230.5], [234.0, 5049.0], [233.0, 5441.0], [243.0, 1639.25], [244.0, 1392.625], [245.0, 2538.5], [246.0, 2001.0], [247.0, 4514.0], [242.0, 4963.0], [241.0, 6283.0], [240.0, 5170.0], [249.0, 3012.0], [251.0, 1973.25], [250.0, 2938.0], [252.0, 1507.3333333333333], [253.0, 1934.6666666666667], [255.0, 1446.2857142857142], [254.0, 2158.2], [248.0, 4103.0], [270.0, 2588.0], [256.0, 2211.666666666667], [259.0, 2697.5], [258.0, 4194.0], [257.0, 4189.0], [263.0, 1226.6], [262.0, 2224.333333333333], [261.0, 4476.5], [264.0, 1748.0], [266.0, 3921.6666666666665], [267.0, 4213.0], [271.0, 4807.0], [269.0, 5122.0], [268.0, 5029.0], [274.0, 1809.0], [278.0, 1988.2], [273.0, 1970.0], [277.0, 2453.4], [276.0, 1044.375], [275.0, 1560.6666666666665], [284.0, 5183.0], [279.0, 2980.0], [272.0, 4478.0], [285.0, 2164.0], [283.0, 2900.0], [282.0, 5827.0], [281.0, 5381.0], [280.0, 5487.0], [287.0, 2322.0], [286.0, 2142.666666666667], [300.0, 1998.2], [290.0, 2631.0], [291.0, 5048.0], [295.0, 3993.0], [289.0, 4582.0], [288.0, 4989.0], [294.0, 2647.0], [293.0, 3110.5], [292.0, 6712.0], [301.0, 2718.0], [303.0, 4710.0], [299.0, 4656.0], [298.0, 5947.0], [297.0, 4145.0], [296.0, 4384.0], [319.0, 1311.6666666666665], [309.0, 2846.5], [308.0, 5321.0], [310.0, 3992.5], [311.0, 2583.5], [304.0, 4955.0], [306.0, 5042.0], [305.0, 4285.0], [316.0, 4247.0], [307.0, 4606.0], [314.0, 1714.8], [313.0, 2672.0], [312.0, 3088.5], [315.0, 3870.0], [318.0, 1554.125], [317.0, 3181.666666666667], [321.0, 1226.857142857143], [320.0, 1552.25], [322.0, 1384.6], [323.0, 1989.142857142857], [325.0, 1924.2], [324.0, 2663.5], [327.0, 2796.666666666667], [326.0, 2663.0], [329.0, 1721.5], [332.0, 3058.0], [333.0, 2670.666666666667], [335.0, 6115.0], [328.0, 5805.0], [334.0, 6644.0], [330.0, 2765.0], [331.0, 2576.75], [348.0, 2396.0], [336.0, 3151.5], [338.0, 2215.0], [337.0, 4523.0], [339.0, 4223.0], [340.0, 1637.0], [341.0, 4692.5], [343.0, 1881.0], [342.0, 4876.0], [347.0, 1863.25], [346.0, 3216.0], [351.0, 2435.3333333333335], [345.0, 5193.0], [344.0, 6458.0], [350.0, 6751.0], [349.0, 6045.0], [354.0, 3126.0], [352.0, 2780.0], [353.0, 4385.0], [355.0, 2614.0], [365.0, 4310.0], [364.0, 3873.0], [357.0, 2166.0], [356.0, 2850.0], [358.0, 1721.8333333333333], [359.0, 2822.5], [360.0, 2157.0], [361.0, 4815.0], [363.0, 3982.0], [362.0, 3896.0], [367.0, 3755.6666666666665], [381.0, 2982.0], [369.0, 2738.5], [370.0, 3625.5], [372.0, 3125.0], [373.0, 1788.0], [374.0, 3145.5], [375.0, 5716.0], [368.0, 6110.0], [378.0, 2419.0], [383.0, 6450.0], [377.0, 5533.0], [376.0, 3650.0], [382.0, 3647.0], [380.0, 1394.2], [371.0, 6193.0], [379.0, 2439.6666666666665], [398.0, 3663.0], [399.0, 3950.0], [397.0, 6106.0], [396.0, 4616.0], [395.0, 4050.0], [394.0, 4994.0], [393.0, 4511.0], [392.0, 3966.0], [391.0, 4573.0], [385.0, 4319.0], [384.0, 4279.0], [387.0, 4103.0], [386.0, 4539.0], [390.0, 4598.0], [389.0, 5318.0], [388.0, 6027.0], [414.0, 6041.0], [415.0, 5994.0], [413.0, 4556.0], [412.0, 3616.0], [411.0, 5068.0], [410.0, 5899.0], [409.0, 4797.0], [408.0, 4798.0], [407.0, 4346.0], [401.0, 5188.0], [400.0, 6550.0], [403.0, 5114.0], [402.0, 5555.0], [406.0, 3831.0], [405.0, 5024.0], [404.0, 5365.0], [430.0, 5602.0], [431.0, 3864.0], [429.0, 5363.0], [428.0, 4630.0], [427.0, 5779.0], [426.0, 3924.0], [425.0, 4940.0], [424.0, 6304.0], [423.0, 3774.0], [417.0, 5500.0], [416.0, 5942.0], [419.0, 4145.0], [418.0, 4385.0], [422.0, 3872.0], [421.0, 6160.0], [420.0, 5023.0], [446.0, 5862.0], [447.0, 4294.0], [445.0, 5599.0], [444.0, 5357.0], [443.0, 3552.0], [442.0, 4493.0], [441.0, 4213.0], [440.0, 3580.0], [439.0, 4154.0], [433.0, 6105.0], [432.0, 5407.0], [435.0, 4830.0], [434.0, 5213.0], [438.0, 5721.0], [437.0, 5179.0], [436.0, 3873.0], [462.0, 5548.0], [463.0, 4973.0], [461.0, 5062.0], [460.0, 5963.0], [459.0, 6281.0], [458.0, 6051.0], [457.0, 6214.0], [456.0, 4988.0], [455.0, 3768.0], [449.0, 4893.0], [451.0, 5464.0], [450.0, 4084.0], [454.0, 4904.0], [453.0, 3541.0], [452.0, 4794.0], [477.0, 5913.0], [479.0, 5334.0], [476.0, 5284.0], [467.0, 4023.0], [466.0, 4849.0], [465.0, 4527.0], [464.0, 5583.0], [475.0, 6043.0], [474.0, 3225.0], [473.0, 6190.0], [472.0, 5345.0], [471.0, 5860.0], [470.0, 3896.0], [469.0, 3413.0], [468.0, 4421.0], [494.0, 5131.0], [495.0, 3262.0], [493.0, 4363.0], [492.0, 5961.0], [491.0, 5491.0], [490.0, 5324.0], [489.0, 5525.0], [488.0, 3677.0], [487.0, 3748.0], [481.0, 5651.0], [480.0, 4854.0], [483.0, 3371.0], [482.0, 4926.0], [486.0, 5147.0], [485.0, 5432.0], [484.0, 5393.0], [510.0, 5995.0], [511.0, 5748.0], [509.0, 3161.0], [508.0, 3337.0], [507.0, 6085.0], [506.0, 5065.0], [505.0, 4747.0], [504.0, 4936.0], [503.0, 4828.0], [497.0, 4942.0], [496.0, 5646.0], [499.0, 5897.0], [498.0, 5741.0], [502.0, 4528.0], [501.0, 5857.0], [500.0, 4788.0], [540.0, 2640.0], [543.0, 3440.0], [529.0, 5319.0], [528.0, 5303.0], [531.0, 3952.0], [530.0, 4688.0], [533.0, 5229.0], [532.0, 5855.0], [542.0, 4017.0], [541.0, 4143.0], [539.0, 2864.5], [538.0, 3214.5], [537.0, 3630.0], [536.0, 3089.5], [527.0, 5968.0], [513.0, 4579.0], [512.0, 4741.0], [515.0, 4469.0], [514.0, 4679.0], [517.0, 4446.0], [516.0, 4647.0], [519.0, 4887.0], [518.0, 5860.0], [526.0, 4911.0], [525.0, 5562.0], [524.0, 5130.0], [523.0, 5558.0], [522.0, 5056.0], [521.0, 5473.0], [520.0, 5082.0], [535.0, 5388.0], [534.0, 5555.0], [570.0, 3048.5], [548.0, 2539.75], [549.0, 2759.4], [550.0, 2498.166666666667], [551.0, 2566.6], [569.0, 3567.0], [568.0, 5648.0], [571.0, 2395.4], [572.0, 2467.4], [574.0, 3041.0], [575.0, 3150.333333333333], [560.0, 4442.0], [573.0, 2945.0], [561.0, 3235.666666666667], [566.0, 3396.333333333333], [567.0, 5756.0], [565.0, 2536.4], [564.0, 3025.666666666667], [563.0, 5607.0], [562.0, 4643.0], [553.0, 2215.6363636363635], [552.0, 2176.0], [547.0, 2060.6], [546.0, 2283.0], [545.0, 2842.25], [544.0, 2644.75], [554.0, 3457.5], [555.0, 3026.333333333333], [559.0, 3564.5], [558.0, 4250.0], [557.0, 5469.0], [556.0, 5378.0], [600.0, 3741.0], [587.0, 2689.0], [576.0, 3216.0], [579.0, 3557.0], [578.0, 5615.0], [577.0, 6465.0], [581.0, 5426.0], [580.0, 4578.0], [583.0, 5635.0], [582.0, 4666.0], [604.0, 4166.0], [603.0, 4100.0], [602.0, 4737.0], [601.0, 5583.0], [605.0, 2941.4], [606.0, 2417.75], [607.0, 4206.0], [584.0, 2496.0], [585.0, 2602.5], [586.0, 3662.0], [588.0, 3224.0], [589.0, 4600.0], [590.0, 3773.5], [591.0, 4921.0], [592.0, 3212.0], [594.0, 3060.0], [593.0, 5245.0], [597.0, 3246.0], [596.0, 4617.0], [599.0, 2930.25], [598.0, 5171.0], [595.0, 3918.5], [614.0, 3684.5], [609.0, 2531.625], [608.0, 3381.666666666667], [622.0, 2390.0], [621.0, 4899.0], [623.0, 4473.0], [619.0, 2522.0], [618.0, 5012.0], [620.0, 2685.4285714285716], [610.0, 2924.2], [611.0, 2958.0], [613.0, 2544.25], [612.0, 6313.0], [615.0, 2705.6666666666665], [633.0, 4522.0], [632.0, 5310.0], [627.0, 3014.5], [626.0, 5210.0], [625.0, 4301.0], [624.0, 4770.0], [637.0, 3212.0], [638.0, 5123.0], [639.0, 5784.0], [636.0, 2979.0], [635.0, 3355.666666666667], [634.0, 3086.25], [629.0, 2733.6], [631.0, 3785.5], [630.0, 3405.0], [628.0, 2393.285714285714], [616.0, 3287.0], [617.0, 3679.0], [647.0, 3532.0], [641.0, 3834.0], [640.0, 2619.0], [655.0, 2996.0], [654.0, 5871.0], [651.0, 3687.0], [652.0, 5154.0], [653.0, 2552.5], [644.0, 2126.6666666666665], [646.0, 4607.0], [645.0, 4300.5], [643.0, 4457.5], [642.0, 2980.4], [656.0, 2973.6666666666665], [664.0, 2809.6666666666665], [666.0, 4698.0], [665.0, 4966.0], [668.0, 3015.3333333333335], [669.0, 3293.6666666666665], [671.0, 2759.714285714286], [670.0, 5289.0], [667.0, 3017.5], [657.0, 3894.0], [659.0, 3501.0], [658.0, 4760.0], [661.0, 3558.5], [660.0, 4464.0], [663.0, 3118.6666666666665], [662.0, 2526.1666666666665], [648.0, 3703.666666666667], [650.0, 2565.0], [649.0, 2710.6666666666665], [678.0, 3529.0], [673.0, 2519.6], [672.0, 2483.0], [687.0, 2821.8], [686.0, 2733.2], [685.0, 2884.5], [674.0, 3431.6666666666665], [676.0, 2871.3333333333335], [677.0, 3890.0], [675.0, 4074.0], [689.0, 2896.25], [694.0, 3704.5], [695.0, 4716.0], [693.0, 3941.666666666667], [691.0, 3668.0], [690.0, 5768.0], [688.0, 3494.5], [703.0, 4382.0], [701.0, 4307.0], [702.0, 2929.6666666666665], [697.0, 2596.75], [696.0, 3826.0], [679.0, 3862.0], [699.0, 4800.0], [698.0, 5182.0], [700.0, 3788.5], [681.0, 2945.6], [680.0, 2874.6666666666665], [682.0, 2682.75], [684.0, 3200.2], [683.0, 2965.875], [709.0, 3719.0], [717.0, 2714.0], [707.0, 3037.5], [704.0, 4161.5], [706.0, 5179.0], [705.0, 4396.0], [718.0, 2849.571428571429], [719.0, 2786.2222222222217], [708.0, 3188.0], [710.0, 3521.0], [711.0, 4313.0], [729.0, 3250.3333333333335], [730.0, 3451.6666666666665], [731.0, 2949.75], [732.0, 2695.3333333333335], [733.0, 3677.0], [734.0, 3903.333333333333], [735.0, 3718.0], [728.0, 2614.25], [720.0, 3281.6666666666665], [721.0, 2343.25], [723.0, 2641.666666666666], [725.0, 2573.428571428571], [726.0, 2392.3], [727.0, 3023.25], [724.0, 2447.285714285714], [722.0, 3098.75], [714.0, 3553.0], [713.0, 2688.0], [712.0, 3846.0], [716.0, 3818.0], [715.0, 5256.0], [743.0, 2854.6], [737.0, 2538.7499999999995], [736.0, 3035.2], [751.0, 3735.0], [750.0, 3487.0], [749.0, 3537.5], [739.0, 2530.0], [738.0, 2737.4], [753.0, 2982.6666666666665], [754.0, 2542.5], [755.0, 2882.0], [757.0, 3184.5], [759.0, 4194.0], [758.0, 3765.0], [756.0, 2862.6], [752.0, 2830.6], [762.0, 2765.4], [764.0, 6059.0], [763.0, 3537.5], [766.0, 4210.0], [765.0, 4819.0], [767.0, 3222.5], [761.0, 2864.8], [760.0, 2680.166666666667], [742.0, 3471.0], [741.0, 4436.0], [740.0, 3676.0], [747.0, 2872.8], [748.0, 2954.6666666666665], [746.0, 2829.0], [745.0, 2983.5], [744.0, 5571.0], [793.0, 3060.8], [769.0, 3150.4285714285716], [770.0, 3513.75], [771.0, 4717.0], [773.0, 4008.0], [772.0, 3593.0], [768.0, 2969.5], [775.0, 3680.5], [776.0, 2901.6666666666665], [777.0, 2429.5], [779.0, 2862.5], [778.0, 3408.0], [780.0, 4163.0], [782.0, 5060.0], [781.0, 3930.0], [783.0, 3708.0], [785.0, 3087.5], [787.0, 2731.5], [788.0, 3186.25], [789.0, 4068.0], [791.0, 5598.0], [790.0, 3334.0], [786.0, 2863.0], [784.0, 3526.0], [798.0, 2890.2000000000003], [799.0, 2982.8888888888887], [796.0, 2551.875], [797.0, 2831.5625], [795.0, 3361.6], [794.0, 3552.8], [792.0, 4208.0], [825.0, 3010.555555555556], [803.0, 2962.777777777778], [800.0, 3262.1666666666665], [815.0, 2667.0], [814.0, 4035.0], [813.0, 5235.0], [811.0, 3557.25], [812.0, 3186.5], [801.0, 2859.4117647058824], [802.0, 3080.8461538461543], [804.0, 2967.0], [806.0, 3411.714285714286], [808.0, 3326.2], [809.0, 3251.0], [810.0, 3007.2], [807.0, 3252.2], [824.0, 4403.0], [816.0, 2952.428571428571], [831.0, 3306.3333333333335], [828.0, 3746.0], [829.0, 3695.0], [830.0, 4464.0], [826.0, 3120.25], [827.0, 3702.0], [818.0, 3795.3333333333335], [819.0, 3455.0], [820.0, 3052.0], [821.0, 3228.0], [822.0, 3088.6666666666665], [823.0, 3766.75], [817.0, 3360.5], [805.0, 2937.2], [835.0, 3690.0], [845.0, 3168.5], [833.0, 3274.833333333333], [832.0, 3295.5], [846.0, 3236.5], [847.0, 3149.0], [834.0, 3366.4], [838.0, 3964.6666666666665], [837.0, 3300.0], [836.0, 3485.0], [839.0, 3193.0], [857.0, 3347.1666666666665], [856.0, 3351.0], [848.0, 3334.5], [863.0, 3340.4], [862.0, 3232.4285714285716], [861.0, 3140.0], [860.0, 4408.0], [859.0, 4184.0], [858.0, 2814.0], [849.0, 3410.8333333333335], [850.0, 3001.25], [851.0, 4439.0], [852.0, 3699.0], [853.0, 3476.714285714286], [854.0, 3364.0], [855.0, 3438.0], [843.0, 4039.0], [842.0, 3222.0], [841.0, 4146.0], [840.0, 3773.0], [844.0, 3863.0], [871.0, 4027.0], [867.0, 4126.25], [864.0, 3217.272727272727], [878.0, 3698.0], [879.0, 3206.571428571429], [874.0, 2932.0], [876.0, 3652.3333333333335], [875.0, 3244.75], [877.0, 3479.833333333333], [866.0, 3027.571428571429], [865.0, 3848.0], [868.0, 3110.6666666666665], [869.0, 3019.5], [880.0, 3049.0], [895.0, 4786.0], [894.0, 2954.0], [892.0, 3388.4], [893.0, 3303.6666666666665], [888.0, 3361.5], [890.0, 4041.0], [889.0, 3983.0], [891.0, 3223.8888888888887], [881.0, 4747.5], [885.0, 3862.6666666666665], [887.0, 3762.3333333333335], [886.0, 4131.5], [884.0, 3228.3333333333335], [883.0, 4646.0], [882.0, 4914.0], [870.0, 2811.0], [872.0, 3998.5], [873.0, 3313.0], [920.0, 3611.6363636363635], [908.0, 4235.25], [897.0, 3484.6666666666665], [896.0, 3247.3333333333335], [911.0, 4930.0], [910.0, 5269.0], [909.0, 5377.0], [899.0, 3671.0], [898.0, 3901.0], [901.0, 4928.0], [900.0, 4331.0], [903.0, 4011.0], [902.0, 3514.0], [921.0, 3483.75], [922.0, 3240.5714285714284], [927.0, 3490.0], [912.0, 2977.0], [926.0, 3247.1666666666665], [925.0, 3321.0], [924.0, 3469.7000000000003], [923.0, 3568.0000000000005], [904.0, 3697.0], [905.0, 4040.5], [906.0, 4666.5], [907.0, 4446.5], [913.0, 3098.0], [915.0, 2991.3333333333335], [914.0, 5066.0], [916.0, 3638.4], [918.0, 3484.6], [917.0, 3558.2], [919.0, 3208.785714285714], [954.0, 3999.0], [931.0, 4810.0], [929.0, 3699.5], [928.0, 4128.333333333333], [943.0, 4692.0], [942.0, 3674.0], [930.0, 4108.0], [932.0, 4254.5], [933.0, 3513.0], [935.0, 5102.0], [934.0, 5666.0], [944.0, 3632.0], [959.0, 4396.0], [956.0, 3164.2], [955.0, 4431.0], [957.0, 3275.0], [958.0, 3209.75], [953.0, 3584.5], [952.0, 2844.3333333333335], [936.0, 3779.0], [938.0, 3593.0], [937.0, 4781.0], [940.0, 4460.0], [939.0, 2501.0], [941.0, 3795.0], [947.0, 3294.5], [948.0, 3676.0], [950.0, 3411.0], [949.0, 4193.0], [951.0, 3301.0], [946.0, 3836.3333333333335], [965.0, 3271.5], [961.0, 3684.5], [960.0, 3481.666666666666], [962.0, 3540.25], [963.0, 3139.4285714285716], [964.0, 3714.428571428571], [980.0, 3395.1], [979.0, 4152.5], [988.0, 3680.5], [989.0, 3537.3333333333335], [991.0, 3219.0], [978.0, 3934.0], [977.0, 5465.0], [976.0, 4767.0], [990.0, 3872.5], [987.0, 3560.714285714286], [985.0, 3131.75], [984.0, 4525.0], [967.0, 4846.0], [966.0, 4453.0], [986.0, 3791.0], [982.0, 3610.0], [983.0, 4599.0], [981.0, 3180.1428571428573], [969.0, 4285.0], [968.0, 4294.0], [970.0, 3932.0], [973.0, 3594.75], [972.0, 5024.0], [971.0, 4149.0], [974.0, 4324.0], [975.0, 4957.0], [1019.0, 4759.0], [992.0, 2614.0], [1007.0, 4001.0], [1006.0, 4343.0], [1005.0, 4375.0], [1004.0, 4490.0], [1003.0, 3723.5], [1002.0, 5690.0], [1000.0, 3203.0], [1023.0, 3669.0], [1009.0, 4795.0], [1008.0, 3961.0], [1011.0, 3532.0], [1010.0, 4790.0], [1013.0, 4883.0], [1012.0, 4995.0], [1021.0, 5649.0], [1020.0, 3832.0], [1018.0, 2690.0], [1017.0, 3844.0], [1016.0, 4332.0], [999.0, 4108.0], [998.0, 4348.0], [996.0, 4766.0], [995.0, 4798.0], [994.0, 4591.0], [993.0, 3701.0], [1015.0, 4594.0], [1014.0, 5729.0], [1080.0, 4088.0], [1076.0, 3564.0], [1084.0, 4916.0], [1056.0, 4199.0], [1058.0, 4239.0], [1060.0, 4206.0], [1062.0, 3843.0], [1064.0, 3569.0], [1066.0, 4750.0], [1068.0, 5049.0], [1070.0, 3718.0], [1086.0, 4633.0], [1082.0, 4347.0], [1078.0, 3436.0], [1074.0, 4438.0], [1072.0, 3566.0], [1024.0, 4157.0], [1026.0, 2717.0], [1028.0, 4138.0], [1030.0, 4019.0], [1032.0, 3739.0], [1034.0, 4169.0], [1036.0, 4177.0], [1038.0, 3605.0], [1054.0, 5368.0], [1052.0, 3838.0], [1050.0, 4618.0], [1048.0, 3581.0], [1046.0, 4334.0], [1044.0, 4413.0], [1042.0, 3679.0], [1040.0, 2915.0], [1144.0, 3764.0], [1140.0, 3767.5], [1148.0, 3898.3333333333335], [1120.0, 4531.0], [1122.0, 4143.0], [1124.0, 4757.0], [1126.0, 4102.0], [1128.0, 3240.0], [1130.0, 3162.0], [1132.0, 3530.0], [1134.0, 3910.0], [1150.0, 5366.5], [1146.0, 3952.0], [1142.0, 4497.25], [1138.0, 3578.6666666666665], [1136.0, 3919.0], [1088.0, 3784.0], [1092.0, 5343.0], [1096.0, 4039.0], [1098.0, 2073.0], [1100.0, 4002.0], [1102.0, 4460.0], [1118.0, 4495.0], [1116.0, 3813.0], [1112.0, 4214.0], [1110.0, 3973.0], [1108.0, 3503.0], [1106.0, 5193.0], [1104.0, 3703.0], [1154.0, 5264.0], [1160.0, 4569.333333333333], [1178.0, 4100.0], [1176.0, 3531.0], [1174.0, 3879.0], [1152.0, 3680.3333333333335], [1156.0, 4404.5], [1158.0, 3395.5], [1162.0, 3951.5], [1164.0, 3869.5], [1166.0, 3649.5], [1180.0, 4089.6666666666665], [1172.0, 3690.0], [1170.0, 4379.0], [1168.0, 3327.0], [1085.0, 4780.0], [1087.0, 3746.0], [1057.0, 3583.0], [1059.0, 4538.0], [1061.0, 4967.0], [1063.0, 3910.0], [1065.0, 2066.0], [1067.0, 4658.0], [1069.0, 3586.0], [1071.0, 4564.0], [1083.0, 4270.0], [1081.0, 3687.0], [1079.0, 5070.0], [1077.0, 3433.0], [1075.0, 2441.0], [1073.0, 3917.0], [1055.0, 4651.0], [1025.0, 4806.0], [1027.0, 4214.0], [1029.0, 4615.0], [1031.0, 4264.0], [1033.0, 2726.0], [1035.0, 5285.0], [1037.0, 2555.0], [1039.0, 4283.0], [1053.0, 3536.0], [1049.0, 4107.0], [1047.0, 4038.0], [1045.0, 4431.0], [1043.0, 3819.0], [1041.0, 3184.0], [1149.0, 4537.333333333333], [1151.0, 3998.0], [1121.0, 4294.0], [1123.0, 3453.0], [1125.0, 3941.0], [1127.0, 3317.0], [1129.0, 3966.0], [1131.0, 4318.0], [1133.0, 4207.0], [1135.0, 3489.0], [1147.0, 4699.0], [1145.0, 4301.0], [1143.0, 4393.0], [1141.0, 4062.4444444444443], [1139.0, 3609.1428571428573], [1137.0, 3473.5], [1119.0, 4631.0], [1089.0, 3402.0], [1091.0, 4359.5], [1095.0, 4180.5], [1093.0, 4264.0], [1097.0, 3917.0], [1099.0, 3440.0], [1101.0, 4249.0], [1103.0, 4661.0], [1117.0, 4245.0], [1115.0, 3894.5], [1113.0, 4005.0], [1111.0, 3525.0], [1109.0, 3353.0], [1107.0, 4689.0], [1105.0, 3831.0], [1155.0, 4826.0], [1175.0, 4182.166666666667], [1181.0, 3816.3333333333335], [1153.0, 5320.0], [1157.0, 5107.0], [1159.0, 3782.3333333333335], [1161.0, 3935.0], [1163.0, 4145.666666666667], [1165.0, 4239.0], [1167.0, 3404.0], [1179.0, 4225.0], [1177.0, 3440.0], [1173.0, 3445.5], [1171.0, 4603.0], [1169.0, 4213.0], [1.0, 4487.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[575.906000000001, 3047.3179999999975]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1181.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12700.0, "minX": 1.54961874E12, "maxY": 21047.016666666666, "series": [{"data": [[1.54961874E12, 21047.016666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961874E12, 12700.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3047.3179999999975, "minX": 1.54961874E12, "maxY": 3047.3179999999975, "series": [{"data": [[1.54961874E12, 3047.3179999999975]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961874E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3047.3079999999977, "minX": 1.54961874E12, "maxY": 3047.3079999999977, "series": [{"data": [[1.54961874E12, 3047.3079999999977]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961874E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 84.10966666666671, "minX": 1.54961874E12, "maxY": 84.10966666666671, "series": [{"data": [[1.54961874E12, 84.10966666666671]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961874E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 154.0, "minX": 1.54961874E12, "maxY": 7239.0, "series": [{"data": [[1.54961874E12, 7239.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961874E12, 154.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961874E12, 5208.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961874E12, 6175.909999999998]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961874E12, 5531.649999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3137.0, "minX": 50.0, "maxY": 3137.0, "series": [{"data": [[50.0, 3137.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3137.0, "minX": 50.0, "maxY": 3137.0, "series": [{"data": [[50.0, 3137.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961874E12, "maxY": 50.0, "series": [{"data": [[1.54961874E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961874E12, "maxY": 50.0, "series": [{"data": [[1.54961874E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961874E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961874E12, "maxY": 50.0, "series": [{"data": [[1.54961874E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961874E12, "title": "Transactions Per Second"}},
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
