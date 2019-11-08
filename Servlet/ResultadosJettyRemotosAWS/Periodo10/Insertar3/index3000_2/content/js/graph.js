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
        data: {"result": {"minY": 100.0, "minX": 0.0, "maxY": 7027.0, "series": [{"data": [[0.0, 100.0], [0.1, 116.0], [0.2, 118.0], [0.3, 130.0], [0.4, 133.0], [0.5, 137.0], [0.6, 139.0], [0.7, 141.0], [0.8, 148.0], [0.9, 149.0], [1.0, 152.0], [1.1, 153.0], [1.2, 155.0], [1.3, 156.0], [1.4, 158.0], [1.5, 159.0], [1.6, 160.0], [1.7, 166.0], [1.8, 170.0], [1.9, 174.0], [2.0, 175.0], [2.1, 179.0], [2.2, 181.0], [2.3, 185.0], [2.4, 189.0], [2.5, 193.0], [2.6, 194.0], [2.7, 198.0], [2.8, 200.0], [2.9, 204.0], [3.0, 205.0], [3.1, 207.0], [3.2, 209.0], [3.3, 212.0], [3.4, 215.0], [3.5, 218.0], [3.6, 219.0], [3.7, 220.0], [3.8, 225.0], [3.9, 227.0], [4.0, 230.0], [4.1, 231.0], [4.2, 233.0], [4.3, 235.0], [4.4, 243.0], [4.5, 244.0], [4.6, 245.0], [4.7, 246.0], [4.8, 251.0], [4.9, 252.0], [5.0, 255.0], [5.1, 256.0], [5.2, 257.0], [5.3, 260.0], [5.4, 263.0], [5.5, 264.0], [5.6, 267.0], [5.7, 269.0], [5.8, 270.0], [5.9, 272.0], [6.0, 274.0], [6.1, 276.0], [6.2, 279.0], [6.3, 283.0], [6.4, 285.0], [6.5, 287.0], [6.6, 289.0], [6.7, 290.0], [6.8, 293.0], [6.9, 298.0], [7.0, 301.0], [7.1, 302.0], [7.2, 303.0], [7.3, 308.0], [7.4, 309.0], [7.5, 311.0], [7.6, 312.0], [7.7, 315.0], [7.8, 315.0], [7.9, 321.0], [8.0, 324.0], [8.1, 328.0], [8.2, 329.0], [8.3, 332.0], [8.4, 334.0], [8.5, 337.0], [8.6, 339.0], [8.7, 343.0], [8.8, 346.0], [8.9, 350.0], [9.0, 353.0], [9.1, 356.0], [9.2, 360.0], [9.3, 368.0], [9.4, 372.0], [9.5, 377.0], [9.6, 378.0], [9.7, 387.0], [9.8, 391.0], [9.9, 394.0], [10.0, 398.0], [10.1, 400.0], [10.2, 405.0], [10.3, 410.0], [10.4, 418.0], [10.5, 419.0], [10.6, 423.0], [10.7, 429.0], [10.8, 433.0], [10.9, 438.0], [11.0, 442.0], [11.1, 447.0], [11.2, 448.0], [11.3, 453.0], [11.4, 458.0], [11.5, 466.0], [11.6, 470.0], [11.7, 476.0], [11.8, 481.0], [11.9, 486.0], [12.0, 490.0], [12.1, 494.0], [12.2, 505.0], [12.3, 510.0], [12.4, 516.0], [12.5, 526.0], [12.6, 531.0], [12.7, 537.0], [12.8, 548.0], [12.9, 551.0], [13.0, 559.0], [13.1, 561.0], [13.2, 569.0], [13.3, 572.0], [13.4, 579.0], [13.5, 592.0], [13.6, 602.0], [13.7, 609.0], [13.8, 617.0], [13.9, 622.0], [14.0, 629.0], [14.1, 638.0], [14.2, 657.0], [14.3, 663.0], [14.4, 670.0], [14.5, 674.0], [14.6, 692.0], [14.7, 699.0], [14.8, 707.0], [14.9, 713.0], [15.0, 723.0], [15.1, 733.0], [15.2, 739.0], [15.3, 752.0], [15.4, 762.0], [15.5, 776.0], [15.6, 790.0], [15.7, 800.0], [15.8, 815.0], [15.9, 821.0], [16.0, 843.0], [16.1, 860.0], [16.2, 869.0], [16.3, 921.0], [16.4, 955.0], [16.5, 994.0], [16.6, 1024.0], [16.7, 1070.0], [16.8, 1095.0], [16.9, 1104.0], [17.0, 1122.0], [17.1, 1165.0], [17.2, 1202.0], [17.3, 1219.0], [17.4, 1224.0], [17.5, 1235.0], [17.6, 1236.0], [17.7, 1255.0], [17.8, 1264.0], [17.9, 1282.0], [18.0, 1291.0], [18.1, 1299.0], [18.2, 1335.0], [18.3, 1340.0], [18.4, 1351.0], [18.5, 1357.0], [18.6, 1361.0], [18.7, 1364.0], [18.8, 1388.0], [18.9, 1389.0], [19.0, 1399.0], [19.1, 1408.0], [19.2, 1417.0], [19.3, 1426.0], [19.4, 1432.0], [19.5, 1435.0], [19.6, 1438.0], [19.7, 1443.0], [19.8, 1447.0], [19.9, 1454.0], [20.0, 1465.0], [20.1, 1478.0], [20.2, 1486.0], [20.3, 1494.0], [20.4, 1507.0], [20.5, 1518.0], [20.6, 1521.0], [20.7, 1533.0], [20.8, 1540.0], [20.9, 1553.0], [21.0, 1558.0], [21.1, 1565.0], [21.2, 1572.0], [21.3, 1579.0], [21.4, 1588.0], [21.5, 1593.0], [21.6, 1601.0], [21.7, 1604.0], [21.8, 1608.0], [21.9, 1616.0], [22.0, 1631.0], [22.1, 1634.0], [22.2, 1641.0], [22.3, 1664.0], [22.4, 1673.0], [22.5, 1678.0], [22.6, 1687.0], [22.7, 1691.0], [22.8, 1709.0], [22.9, 1716.0], [23.0, 1743.0], [23.1, 1747.0], [23.2, 1752.0], [23.3, 1757.0], [23.4, 1765.0], [23.5, 1769.0], [23.6, 1781.0], [23.7, 1783.0], [23.8, 1806.0], [23.9, 1810.0], [24.0, 1824.0], [24.1, 1826.0], [24.2, 1848.0], [24.3, 1862.0], [24.4, 1868.0], [24.5, 1880.0], [24.6, 1890.0], [24.7, 1891.0], [24.8, 1901.0], [24.9, 1907.0], [25.0, 1910.0], [25.1, 1920.0], [25.2, 1925.0], [25.3, 1929.0], [25.4, 1943.0], [25.5, 1944.0], [25.6, 1947.0], [25.7, 1953.0], [25.8, 1954.0], [25.9, 1956.0], [26.0, 1963.0], [26.1, 1967.0], [26.2, 1979.0], [26.3, 1997.0], [26.4, 2013.0], [26.5, 2019.0], [26.6, 2021.0], [26.7, 2026.0], [26.8, 2030.0], [26.9, 2038.0], [27.0, 2045.0], [27.1, 2061.0], [27.2, 2066.0], [27.3, 2068.0], [27.4, 2074.0], [27.5, 2079.0], [27.6, 2082.0], [27.7, 2094.0], [27.8, 2104.0], [27.9, 2109.0], [28.0, 2110.0], [28.1, 2118.0], [28.2, 2120.0], [28.3, 2136.0], [28.4, 2140.0], [28.5, 2148.0], [28.6, 2153.0], [28.7, 2157.0], [28.8, 2161.0], [28.9, 2163.0], [29.0, 2176.0], [29.1, 2183.0], [29.2, 2187.0], [29.3, 2188.0], [29.4, 2196.0], [29.5, 2200.0], [29.6, 2214.0], [29.7, 2231.0], [29.8, 2238.0], [29.9, 2249.0], [30.0, 2258.0], [30.1, 2262.0], [30.2, 2267.0], [30.3, 2274.0], [30.4, 2284.0], [30.5, 2289.0], [30.6, 2301.0], [30.7, 2307.0], [30.8, 2313.0], [30.9, 2322.0], [31.0, 2332.0], [31.1, 2342.0], [31.2, 2345.0], [31.3, 2348.0], [31.4, 2349.0], [31.5, 2359.0], [31.6, 2364.0], [31.7, 2368.0], [31.8, 2372.0], [31.9, 2377.0], [32.0, 2381.0], [32.1, 2385.0], [32.2, 2389.0], [32.3, 2392.0], [32.4, 2399.0], [32.5, 2408.0], [32.6, 2415.0], [32.7, 2419.0], [32.8, 2424.0], [32.9, 2427.0], [33.0, 2432.0], [33.1, 2435.0], [33.2, 2438.0], [33.3, 2476.0], [33.4, 2478.0], [33.5, 2483.0], [33.6, 2486.0], [33.7, 2489.0], [33.8, 2495.0], [33.9, 2507.0], [34.0, 2514.0], [34.1, 2521.0], [34.2, 2525.0], [34.3, 2529.0], [34.4, 2532.0], [34.5, 2536.0], [34.6, 2538.0], [34.7, 2545.0], [34.8, 2549.0], [34.9, 2552.0], [35.0, 2556.0], [35.1, 2561.0], [35.2, 2562.0], [35.3, 2566.0], [35.4, 2573.0], [35.5, 2575.0], [35.6, 2580.0], [35.7, 2586.0], [35.8, 2592.0], [35.9, 2608.0], [36.0, 2611.0], [36.1, 2634.0], [36.2, 2638.0], [36.3, 2651.0], [36.4, 2658.0], [36.5, 2662.0], [36.6, 2665.0], [36.7, 2670.0], [36.8, 2676.0], [36.9, 2681.0], [37.0, 2683.0], [37.1, 2690.0], [37.2, 2695.0], [37.3, 2696.0], [37.4, 2700.0], [37.5, 2707.0], [37.6, 2713.0], [37.7, 2719.0], [37.8, 2724.0], [37.9, 2726.0], [38.0, 2730.0], [38.1, 2735.0], [38.2, 2744.0], [38.3, 2752.0], [38.4, 2755.0], [38.5, 2764.0], [38.6, 2766.0], [38.7, 2773.0], [38.8, 2776.0], [38.9, 2787.0], [39.0, 2791.0], [39.1, 2795.0], [39.2, 2799.0], [39.3, 2804.0], [39.4, 2818.0], [39.5, 2823.0], [39.6, 2825.0], [39.7, 2830.0], [39.8, 2836.0], [39.9, 2839.0], [40.0, 2847.0], [40.1, 2850.0], [40.2, 2862.0], [40.3, 2867.0], [40.4, 2872.0], [40.5, 2875.0], [40.6, 2880.0], [40.7, 2885.0], [40.8, 2889.0], [40.9, 2892.0], [41.0, 2897.0], [41.1, 2907.0], [41.2, 2910.0], [41.3, 2914.0], [41.4, 2917.0], [41.5, 2920.0], [41.6, 2922.0], [41.7, 2923.0], [41.8, 2936.0], [41.9, 2939.0], [42.0, 2944.0], [42.1, 2950.0], [42.2, 2956.0], [42.3, 2963.0], [42.4, 2971.0], [42.5, 2976.0], [42.6, 2977.0], [42.7, 2982.0], [42.8, 2989.0], [42.9, 2999.0], [43.0, 3009.0], [43.1, 3014.0], [43.2, 3020.0], [43.3, 3030.0], [43.4, 3042.0], [43.5, 3044.0], [43.6, 3048.0], [43.7, 3053.0], [43.8, 3055.0], [43.9, 3061.0], [44.0, 3064.0], [44.1, 3068.0], [44.2, 3074.0], [44.3, 3082.0], [44.4, 3082.0], [44.5, 3089.0], [44.6, 3101.0], [44.7, 3106.0], [44.8, 3113.0], [44.9, 3123.0], [45.0, 3131.0], [45.1, 3137.0], [45.2, 3148.0], [45.3, 3154.0], [45.4, 3158.0], [45.5, 3163.0], [45.6, 3171.0], [45.7, 3188.0], [45.8, 3201.0], [45.9, 3204.0], [46.0, 3212.0], [46.1, 3223.0], [46.2, 3229.0], [46.3, 3234.0], [46.4, 3240.0], [46.5, 3248.0], [46.6, 3253.0], [46.7, 3256.0], [46.8, 3260.0], [46.9, 3270.0], [47.0, 3272.0], [47.1, 3284.0], [47.2, 3292.0], [47.3, 3298.0], [47.4, 3307.0], [47.5, 3312.0], [47.6, 3322.0], [47.7, 3326.0], [47.8, 3329.0], [47.9, 3332.0], [48.0, 3334.0], [48.1, 3349.0], [48.2, 3352.0], [48.3, 3356.0], [48.4, 3358.0], [48.5, 3366.0], [48.6, 3377.0], [48.7, 3378.0], [48.8, 3390.0], [48.9, 3394.0], [49.0, 3403.0], [49.1, 3409.0], [49.2, 3421.0], [49.3, 3422.0], [49.4, 3423.0], [49.5, 3429.0], [49.6, 3437.0], [49.7, 3441.0], [49.8, 3452.0], [49.9, 3456.0], [50.0, 3465.0], [50.1, 3470.0], [50.2, 3476.0], [50.3, 3480.0], [50.4, 3485.0], [50.5, 3489.0], [50.6, 3497.0], [50.7, 3504.0], [50.8, 3507.0], [50.9, 3524.0], [51.0, 3525.0], [51.1, 3534.0], [51.2, 3540.0], [51.3, 3547.0], [51.4, 3551.0], [51.5, 3559.0], [51.6, 3560.0], [51.7, 3562.0], [51.8, 3565.0], [51.9, 3570.0], [52.0, 3575.0], [52.1, 3582.0], [52.2, 3588.0], [52.3, 3590.0], [52.4, 3595.0], [52.5, 3602.0], [52.6, 3606.0], [52.7, 3611.0], [52.8, 3622.0], [52.9, 3624.0], [53.0, 3627.0], [53.1, 3633.0], [53.2, 3634.0], [53.3, 3637.0], [53.4, 3646.0], [53.5, 3648.0], [53.6, 3659.0], [53.7, 3671.0], [53.8, 3679.0], [53.9, 3683.0], [54.0, 3689.0], [54.1, 3697.0], [54.2, 3699.0], [54.3, 3701.0], [54.4, 3703.0], [54.5, 3717.0], [54.6, 3720.0], [54.7, 3724.0], [54.8, 3726.0], [54.9, 3731.0], [55.0, 3739.0], [55.1, 3745.0], [55.2, 3746.0], [55.3, 3750.0], [55.4, 3756.0], [55.5, 3761.0], [55.6, 3766.0], [55.7, 3768.0], [55.8, 3775.0], [55.9, 3785.0], [56.0, 3786.0], [56.1, 3788.0], [56.2, 3792.0], [56.3, 3799.0], [56.4, 3802.0], [56.5, 3807.0], [56.6, 3811.0], [56.7, 3815.0], [56.8, 3817.0], [56.9, 3820.0], [57.0, 3822.0], [57.1, 3827.0], [57.2, 3832.0], [57.3, 3836.0], [57.4, 3840.0], [57.5, 3842.0], [57.6, 3844.0], [57.7, 3849.0], [57.8, 3855.0], [57.9, 3859.0], [58.0, 3867.0], [58.1, 3874.0], [58.2, 3875.0], [58.3, 3879.0], [58.4, 3884.0], [58.5, 3885.0], [58.6, 3886.0], [58.7, 3892.0], [58.8, 3896.0], [58.9, 3899.0], [59.0, 3899.0], [59.1, 3904.0], [59.2, 3906.0], [59.3, 3914.0], [59.4, 3918.0], [59.5, 3923.0], [59.6, 3929.0], [59.7, 3931.0], [59.8, 3932.0], [59.9, 3938.0], [60.0, 3946.0], [60.1, 3953.0], [60.2, 3956.0], [60.3, 3962.0], [60.4, 3964.0], [60.5, 3968.0], [60.6, 3973.0], [60.7, 3976.0], [60.8, 3980.0], [60.9, 3981.0], [61.0, 3984.0], [61.1, 3992.0], [61.2, 3995.0], [61.3, 4000.0], [61.4, 4002.0], [61.5, 4005.0], [61.6, 4010.0], [61.7, 4011.0], [61.8, 4012.0], [61.9, 4016.0], [62.0, 4023.0], [62.1, 4025.0], [62.2, 4030.0], [62.3, 4035.0], [62.4, 4041.0], [62.5, 4050.0], [62.6, 4051.0], [62.7, 4052.0], [62.8, 4056.0], [62.9, 4065.0], [63.0, 4067.0], [63.1, 4072.0], [63.2, 4076.0], [63.3, 4081.0], [63.4, 4089.0], [63.5, 4091.0], [63.6, 4095.0], [63.7, 4101.0], [63.8, 4104.0], [63.9, 4106.0], [64.0, 4109.0], [64.1, 4116.0], [64.2, 4120.0], [64.3, 4125.0], [64.4, 4126.0], [64.5, 4127.0], [64.6, 4129.0], [64.7, 4132.0], [64.8, 4134.0], [64.9, 4138.0], [65.0, 4140.0], [65.1, 4143.0], [65.2, 4147.0], [65.3, 4152.0], [65.4, 4155.0], [65.5, 4157.0], [65.6, 4163.0], [65.7, 4165.0], [65.8, 4168.0], [65.9, 4169.0], [66.0, 4172.0], [66.1, 4177.0], [66.2, 4179.0], [66.3, 4186.0], [66.4, 4188.0], [66.5, 4192.0], [66.6, 4196.0], [66.7, 4201.0], [66.8, 4203.0], [66.9, 4204.0], [67.0, 4209.0], [67.1, 4216.0], [67.2, 4220.0], [67.3, 4224.0], [67.4, 4226.0], [67.5, 4226.0], [67.6, 4230.0], [67.7, 4235.0], [67.8, 4238.0], [67.9, 4239.0], [68.0, 4242.0], [68.1, 4246.0], [68.2, 4253.0], [68.3, 4256.0], [68.4, 4257.0], [68.5, 4259.0], [68.6, 4261.0], [68.7, 4265.0], [68.8, 4267.0], [68.9, 4268.0], [69.0, 4270.0], [69.1, 4281.0], [69.2, 4286.0], [69.3, 4289.0], [69.4, 4296.0], [69.5, 4299.0], [69.6, 4305.0], [69.7, 4310.0], [69.8, 4317.0], [69.9, 4318.0], [70.0, 4321.0], [70.1, 4327.0], [70.2, 4329.0], [70.3, 4332.0], [70.4, 4336.0], [70.5, 4339.0], [70.6, 4348.0], [70.7, 4352.0], [70.8, 4354.0], [70.9, 4359.0], [71.0, 4363.0], [71.1, 4364.0], [71.2, 4368.0], [71.3, 4374.0], [71.4, 4384.0], [71.5, 4393.0], [71.6, 4402.0], [71.7, 4406.0], [71.8, 4414.0], [71.9, 4417.0], [72.0, 4418.0], [72.1, 4421.0], [72.2, 4426.0], [72.3, 4431.0], [72.4, 4436.0], [72.5, 4439.0], [72.6, 4443.0], [72.7, 4446.0], [72.8, 4448.0], [72.9, 4450.0], [73.0, 4451.0], [73.1, 4455.0], [73.2, 4472.0], [73.3, 4477.0], [73.4, 4477.0], [73.5, 4482.0], [73.6, 4484.0], [73.7, 4488.0], [73.8, 4500.0], [73.9, 4500.0], [74.0, 4512.0], [74.1, 4515.0], [74.2, 4518.0], [74.3, 4521.0], [74.4, 4526.0], [74.5, 4530.0], [74.6, 4533.0], [74.7, 4536.0], [74.8, 4543.0], [74.9, 4555.0], [75.0, 4565.0], [75.1, 4567.0], [75.2, 4571.0], [75.3, 4578.0], [75.4, 4598.0], [75.5, 4600.0], [75.6, 4602.0], [75.7, 4604.0], [75.8, 4605.0], [75.9, 4609.0], [76.0, 4610.0], [76.1, 4614.0], [76.2, 4615.0], [76.3, 4618.0], [76.4, 4619.0], [76.5, 4625.0], [76.6, 4632.0], [76.7, 4635.0], [76.8, 4639.0], [76.9, 4646.0], [77.0, 4650.0], [77.1, 4651.0], [77.2, 4662.0], [77.3, 4667.0], [77.4, 4668.0], [77.5, 4673.0], [77.6, 4675.0], [77.7, 4680.0], [77.8, 4684.0], [77.9, 4685.0], [78.0, 4691.0], [78.1, 4693.0], [78.2, 4695.0], [78.3, 4700.0], [78.4, 4705.0], [78.5, 4710.0], [78.6, 4712.0], [78.7, 4717.0], [78.8, 4720.0], [78.9, 4722.0], [79.0, 4728.0], [79.1, 4736.0], [79.2, 4740.0], [79.3, 4746.0], [79.4, 4755.0], [79.5, 4763.0], [79.6, 4771.0], [79.7, 4774.0], [79.8, 4780.0], [79.9, 4786.0], [80.0, 4791.0], [80.1, 4792.0], [80.2, 4795.0], [80.3, 4802.0], [80.4, 4804.0], [80.5, 4812.0], [80.6, 4816.0], [80.7, 4819.0], [80.8, 4833.0], [80.9, 4844.0], [81.0, 4848.0], [81.1, 4851.0], [81.2, 4855.0], [81.3, 4862.0], [81.4, 4868.0], [81.5, 4871.0], [81.6, 4876.0], [81.7, 4879.0], [81.8, 4884.0], [81.9, 4899.0], [82.0, 4905.0], [82.1, 4908.0], [82.2, 4912.0], [82.3, 4916.0], [82.4, 4926.0], [82.5, 4932.0], [82.6, 4939.0], [82.7, 4941.0], [82.8, 4944.0], [82.9, 4950.0], [83.0, 4955.0], [83.1, 4968.0], [83.2, 4972.0], [83.3, 4980.0], [83.4, 4985.0], [83.5, 4991.0], [83.6, 4994.0], [83.7, 5003.0], [83.8, 5007.0], [83.9, 5011.0], [84.0, 5017.0], [84.1, 5020.0], [84.2, 5025.0], [84.3, 5032.0], [84.4, 5045.0], [84.5, 5047.0], [84.6, 5051.0], [84.7, 5052.0], [84.8, 5056.0], [84.9, 5058.0], [85.0, 5063.0], [85.1, 5068.0], [85.2, 5072.0], [85.3, 5077.0], [85.4, 5080.0], [85.5, 5083.0], [85.6, 5086.0], [85.7, 5090.0], [85.8, 5094.0], [85.9, 5095.0], [86.0, 5097.0], [86.1, 5107.0], [86.2, 5110.0], [86.3, 5113.0], [86.4, 5117.0], [86.5, 5119.0], [86.6, 5123.0], [86.7, 5131.0], [86.8, 5139.0], [86.9, 5149.0], [87.0, 5156.0], [87.1, 5158.0], [87.2, 5161.0], [87.3, 5167.0], [87.4, 5172.0], [87.5, 5174.0], [87.6, 5178.0], [87.7, 5180.0], [87.8, 5187.0], [87.9, 5192.0], [88.0, 5202.0], [88.1, 5209.0], [88.2, 5219.0], [88.3, 5224.0], [88.4, 5231.0], [88.5, 5233.0], [88.6, 5237.0], [88.7, 5240.0], [88.8, 5249.0], [88.9, 5252.0], [89.0, 5254.0], [89.1, 5258.0], [89.2, 5262.0], [89.3, 5276.0], [89.4, 5279.0], [89.5, 5285.0], [89.6, 5292.0], [89.7, 5293.0], [89.8, 5302.0], [89.9, 5312.0], [90.0, 5316.0], [90.1, 5320.0], [90.2, 5322.0], [90.3, 5324.0], [90.4, 5327.0], [90.5, 5336.0], [90.6, 5339.0], [90.7, 5343.0], [90.8, 5347.0], [90.9, 5352.0], [91.0, 5354.0], [91.1, 5361.0], [91.2, 5366.0], [91.3, 5369.0], [91.4, 5370.0], [91.5, 5378.0], [91.6, 5382.0], [91.7, 5389.0], [91.8, 5396.0], [91.9, 5403.0], [92.0, 5406.0], [92.1, 5414.0], [92.2, 5423.0], [92.3, 5428.0], [92.4, 5458.0], [92.5, 5468.0], [92.6, 5472.0], [92.7, 5475.0], [92.8, 5481.0], [92.9, 5489.0], [93.0, 5494.0], [93.1, 5499.0], [93.2, 5505.0], [93.3, 5508.0], [93.4, 5513.0], [93.5, 5535.0], [93.6, 5540.0], [93.7, 5544.0], [93.8, 5546.0], [93.9, 5550.0], [94.0, 5559.0], [94.1, 5567.0], [94.2, 5588.0], [94.3, 5602.0], [94.4, 5612.0], [94.5, 5619.0], [94.6, 5623.0], [94.7, 5626.0], [94.8, 5638.0], [94.9, 5657.0], [95.0, 5666.0], [95.1, 5672.0], [95.2, 5683.0], [95.3, 5689.0], [95.4, 5728.0], [95.5, 5735.0], [95.6, 5742.0], [95.7, 5749.0], [95.8, 5763.0], [95.9, 5776.0], [96.0, 5781.0], [96.1, 5787.0], [96.2, 5795.0], [96.3, 5806.0], [96.4, 5817.0], [96.5, 5822.0], [96.6, 5836.0], [96.7, 5846.0], [96.8, 5864.0], [96.9, 5875.0], [97.0, 5899.0], [97.1, 5906.0], [97.2, 5920.0], [97.3, 5959.0], [97.4, 5978.0], [97.5, 5997.0], [97.6, 6004.0], [97.7, 6022.0], [97.8, 6043.0], [97.9, 6078.0], [98.0, 6114.0], [98.1, 6163.0], [98.2, 6267.0], [98.3, 6312.0], [98.4, 6337.0], [98.5, 6445.0], [98.6, 6462.0], [98.7, 6511.0], [98.8, 6567.0], [98.9, 6583.0], [99.0, 6593.0], [99.1, 6605.0], [99.2, 6612.0], [99.3, 6650.0], [99.4, 6676.0], [99.5, 6726.0], [99.6, 6756.0], [99.7, 6789.0], [99.8, 6847.0], [99.9, 6888.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 126.0, "series": [{"data": [[600.0, 34.0], [700.0, 29.0], [800.0, 18.0], [900.0, 8.0], [1000.0, 9.0], [1100.0, 9.0], [1200.0, 28.0], [1300.0, 27.0], [1400.0, 39.0], [1500.0, 38.0], [1600.0, 35.0], [1700.0, 30.0], [1800.0, 31.0], [1900.0, 46.0], [2000.0, 44.0], [2100.0, 51.0], [2300.0, 56.0], [2200.0, 32.0], [2400.0, 43.0], [2500.0, 60.0], [2600.0, 46.0], [2700.0, 55.0], [2800.0, 54.0], [2900.0, 57.0], [3000.0, 50.0], [3100.0, 36.0], [3200.0, 46.0], [3300.0, 48.0], [3400.0, 51.0], [3500.0, 55.0], [3600.0, 53.0], [3700.0, 63.0], [3800.0, 81.0], [3900.0, 69.0], [4000.0, 70.0], [4100.0, 92.0], [4300.0, 61.0], [4200.0, 85.0], [4400.0, 67.0], [4500.0, 51.0], [4600.0, 84.0], [4800.0, 50.0], [4700.0, 59.0], [5100.0, 58.0], [4900.0, 53.0], [5000.0, 70.0], [5300.0, 63.0], [5200.0, 54.0], [5400.0, 39.0], [5500.0, 34.0], [5600.0, 32.0], [5700.0, 27.0], [5800.0, 23.0], [6000.0, 12.0], [6100.0, 5.0], [5900.0, 17.0], [6300.0, 7.0], [6200.0, 2.0], [6400.0, 6.0], [6600.0, 11.0], [6500.0, 12.0], [6900.0, 1.0], [6800.0, 6.0], [6700.0, 9.0], [7000.0, 1.0], [100.0, 82.0], [200.0, 126.0], [300.0, 94.0], [400.0, 63.0], [500.0, 43.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 244.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2391.0, "series": [{"data": [[1.0, 244.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 365.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2391.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 599.1833333333341, "minX": 1.54961892E12, "maxY": 599.1833333333341, "series": [{"data": [[1.54961892E12, 599.1833333333341]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961892E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 205.0, "minX": 1.0, "maxY": 6959.0, "series": [{"data": [[2.0, 5105.0], [4.0, 5327.5], [5.0, 5110.0], [6.0, 5080.0], [7.0, 5559.0], [8.0, 5388.0], [10.0, 5313.0], [12.0, 5353.0], [13.0, 5496.0], [14.0, 5602.0], [15.0, 6574.0], [16.0, 5468.0], [17.0, 5496.0], [18.0, 5174.0], [19.0, 6593.0], [20.0, 5058.0], [21.0, 5414.0], [22.0, 6165.0], [23.0, 5109.0], [24.0, 5978.0], [25.0, 5671.0], [26.0, 5167.0], [27.0, 5414.0], [28.0, 2441.6666666666665], [29.0, 901.4285714285713], [30.0, 742.7272727272727], [31.0, 1336.8], [33.0, 1137.2], [32.0, 896.2857142857143], [35.0, 901.875], [34.0, 938.0000000000001], [37.0, 1508.125], [36.0, 205.0], [39.0, 782.1999999999999], [38.0, 941.7142857142857], [41.0, 2087.666666666667], [40.0, 1054.1666666666665], [43.0, 1867.3333333333333], [42.0, 2660.0], [45.0, 1107.2307692307693], [44.0, 252.71428571428572], [47.0, 2117.666666666667], [46.0, 1164.7142857142858], [49.0, 2757.0], [48.0, 1926.0], [51.0, 1296.4], [50.0, 1139.5], [53.0, 978.5714285714286], [52.0, 722.1818181818182], [55.0, 830.5555555555555], [54.0, 798.1], [57.0, 1459.0], [56.0, 251.85714285714286], [59.0, 1505.75], [58.0, 1500.4], [61.0, 271.0], [60.0, 1263.8], [63.0, 808.1111111111111], [62.0, 1540.125], [67.0, 891.2222222222222], [66.0, 1581.5], [65.0, 1241.8], [64.0, 1367.8333333333335], [69.0, 1346.6666666666667], [68.0, 900.375], [70.0, 286.0], [71.0, 2723.0], [72.0, 961.1428571428571], [75.0, 5983.0], [74.0, 5998.0], [73.0, 5510.0], [76.0, 1934.3333333333333], [77.0, 1968.6666666666667], [78.0, 1966.6666666666667], [79.0, 5619.0], [83.0, 5493.0], [82.0, 5481.0], [81.0, 5763.0], [80.0, 6888.0], [85.0, 1552.0], [84.0, 2039.6666666666667], [87.0, 1236.8], [86.0, 5201.0], [89.0, 1977.0], [91.0, 2720.0], [90.0, 4992.0], [88.0, 5320.0], [95.0, 5416.5], [93.0, 5449.0], [92.0, 5074.0], [98.0, 3025.5], [99.0, 1377.0], [97.0, 5068.0], [96.0, 5845.0], [101.0, 379.3], [102.0, 1155.2307692307693], [103.0, 889.0833333333334], [100.0, 1920.0], [104.0, 1072.111111111111], [105.0, 1311.0], [107.0, 1941.0], [106.0, 2713.0], [108.0, 1529.0], [111.0, 372.0], [110.0, 5368.0], [109.0, 5026.0], [115.0, 1975.0], [114.0, 1538.0], [113.0, 2048.75], [112.0, 5289.5], [118.0, 2151.333333333333], [119.0, 2507.666666666667], [117.0, 6078.0], [116.0, 5267.0], [120.0, 2075.333333333333], [121.0, 2716.5], [123.0, 5071.0], [122.0, 5095.0], [124.0, 3713.5], [126.0, 1656.3333333333333], [127.0, 2152.0], [125.0, 559.0], [130.0, 1421.6], [131.0, 1950.0], [129.0, 2899.0], [132.0, 2755.0], [135.0, 2934.5], [134.0, 5786.0], [133.0, 6676.0], [128.0, 6511.0], [137.0, 2791.5], [136.0, 2820.0], [140.0, 2014.3333333333333], [139.0, 2881.0], [143.0, 2295.666666666667], [142.0, 6399.5], [138.0, 6568.0], [144.0, 1064.888888888889], [145.0, 1336.5], [146.0, 2102.333333333333], [147.0, 1629.75], [149.0, 2625.666666666667], [148.0, 2902.0], [151.0, 5257.0], [150.0, 4994.0], [154.0, 3130.5], [153.0, 3700.0], [155.0, 2921.0], [159.0, 5321.0], [158.0, 5110.0], [157.0, 5009.0], [156.0, 5547.0], [152.0, 5252.0], [162.0, 1654.5], [165.0, 1429.2], [164.0, 1588.2], [163.0, 2296.0], [167.0, 2123.25], [166.0, 1401.0], [161.0, 5474.0], [160.0, 5179.0], [169.0, 3749.6666666666665], [168.0, 723.0], [172.0, 1936.0], [171.0, 1822.2], [170.0, 2911.0], [175.0, 6534.0], [174.0, 6412.0], [173.0, 6668.0], [177.0, 2000.6666666666667], [176.0, 1058.090909090909], [179.0, 3041.0], [180.0, 2683.0], [183.0, 1453.1666666666667], [182.0, 1752.75], [181.0, 5192.0], [178.0, 5592.0], [184.0, 2336.666666666667], [186.0, 3573.5], [187.0, 3540.0], [190.0, 2812.0], [189.0, 2363.333333333333], [191.0, 2221.333333333333], [188.0, 6445.0], [185.0, 5344.0], [192.0, 2066.5], [193.0, 2405.333333333333], [194.0, 2194.333333333333], [196.0, 672.3333333333334], [195.0, 2229.666666666667], [197.0, 2551.8], [198.0, 2363.333333333333], [199.0, 769.6666666666666], [200.0, 2626.8333333333335], [202.0, 1471.0], [203.0, 1618.6], [205.0, 790.0], [207.0, 5140.0], [206.0, 6673.5], [204.0, 6706.0], [201.0, 6738.0], [215.0, 5985.5], [213.0, 5563.0], [212.0, 5801.5], [211.0, 5872.0], [209.0, 6583.0], [208.0, 6135.0], [223.0, 6096.5], [221.0, 5278.0], [219.0, 5911.0], [218.0, 4980.0], [217.0, 5051.0], [216.0, 6606.0], [231.0, 5503.0], [230.0, 6650.0], [229.0, 6756.0], [228.0, 5820.0], [227.0, 5776.0], [226.0, 5780.0], [225.0, 5473.0], [224.0, 5213.0], [239.0, 6337.0], [238.0, 5178.0], [237.0, 5307.0], [236.0, 5640.0], [234.0, 5339.0], [233.0, 5806.0], [232.0, 5318.0], [247.0, 5020.0], [246.0, 6267.0], [245.0, 5283.0], [244.0, 5507.0], [243.0, 6605.0], [242.0, 5900.0], [241.0, 6312.0], [240.0, 5618.0], [255.0, 4928.0], [254.0, 6959.0], [253.0, 5047.0], [252.0, 5064.0], [251.0, 6847.0], [250.0, 6448.0], [249.0, 5542.0], [248.0, 5251.0], [270.0, 4753.0], [271.0, 4151.0], [269.0, 5864.0], [268.0, 4684.0], [267.0, 5997.0], [266.0, 4697.0], [265.0, 5686.0], [264.0, 5017.0], [263.0, 5121.0], [257.0, 4163.0], [256.0, 5545.0], [259.0, 5846.0], [258.0, 5786.0], [262.0, 4201.0], [261.0, 4065.0], [260.0, 5742.0], [286.0, 5536.0], [287.0, 4998.0], [285.0, 4266.0], [284.0, 4335.0], [283.0, 4640.0], [282.0, 5070.0], [281.0, 4737.0], [279.0, 4720.0], [272.0, 5624.0], [274.0, 5774.0], [273.0, 4623.0], [278.0, 5687.0], [277.0, 4851.0], [276.0, 5334.0], [302.0, 4926.0], [303.0, 4605.0], [301.0, 5787.0], [300.0, 5542.0], [299.0, 5689.0], [298.0, 5915.0], [296.0, 4153.0], [295.0, 5607.0], [289.0, 5875.0], [288.0, 5608.0], [291.0, 4965.0], [290.0, 5667.0], [294.0, 4868.0], [293.0, 5224.5], [318.0, 4912.0], [319.0, 6163.0], [317.0, 4567.0], [316.0, 4914.0], [315.0, 5844.0], [314.0, 5024.0], [312.0, 4561.0], [311.0, 4973.0], [305.0, 4513.0], [304.0, 4777.0], [307.0, 6456.0], [306.0, 5828.0], [310.0, 4878.0], [309.0, 5095.0], [308.0, 5743.0], [334.0, 4685.0], [335.0, 4426.0], [333.0, 4425.0], [332.0, 4203.0], [331.0, 4081.0], [330.0, 5626.0], [329.0, 5742.0], [328.0, 4763.0], [327.0, 4939.0], [321.0, 4142.0], [320.0, 4877.0], [323.0, 4693.0], [322.0, 4578.0], [326.0, 6163.0], [325.0, 4971.0], [324.0, 4476.0], [350.0, 4691.0], [351.0, 4905.0], [349.0, 5052.0], [348.0, 4610.0], [347.0, 5997.0], [346.0, 5540.0], [345.0, 4951.0], [344.0, 4668.0], [343.0, 5518.0], [336.0, 5666.0], [339.0, 5051.0], [338.0, 4494.0], [342.0, 4101.0], [341.0, 5561.0], [340.0, 5139.0], [366.0, 4677.5], [367.0, 2713.0], [364.0, 5566.0], [355.0, 4863.0], [354.0, 5396.0], [353.0, 5346.0], [352.0, 6009.0], [362.0, 6038.0], [361.0, 5794.0], [360.0, 5653.0], [359.0, 5422.0], [358.0, 6239.0], [357.0, 5803.0], [356.0, 6043.0], [370.0, 2526.0], [377.0, 3653.3333333333335], [379.0, 5028.0], [378.0, 4244.0], [376.0, 1243.0], [375.0, 2828.0], [374.0, 2761.0], [373.0, 2009.6666666666665], [372.0, 2589.333333333333], [371.0, 2212.6], [381.0, 4421.0], [380.0, 4556.0], [383.0, 1969.6], [382.0, 5631.0], [369.0, 2497.0], [368.0, 2469.0], [398.0, 2762.666666666667], [385.0, 2411.0], [384.0, 2296.5], [391.0, 3838.0], [390.0, 5295.0], [388.0, 4887.0], [387.0, 3255.0], [386.0, 5781.0], [397.0, 6010.0], [396.0, 4655.0], [393.0, 2673.0], [392.0, 1417.0], [394.0, 3161.0], [395.0, 2893.5], [399.0, 3257.0], [412.0, 2797.5], [400.0, 3490.5], [404.0, 2495.0], [403.0, 2974.0], [402.0, 4822.5], [405.0, 2196.2], [407.0, 5967.0], [406.0, 5305.0], [411.0, 2690.3333333333335], [410.0, 2998.0], [415.0, 2593.333333333333], [409.0, 5624.0], [408.0, 4618.0], [414.0, 5404.0], [413.0, 4774.0], [429.0, 4500.0], [418.0, 1897.625], [417.0, 3221.5], [423.0, 3863.0], [416.0, 5659.0], [419.0, 3370.0], [428.0, 4071.5], [422.0, 3714.0], [421.0, 2418.5], [420.0, 5171.0], [425.0, 2520.0], [424.0, 5869.0], [426.0, 5203.0], [431.0, 3309.6666666666665], [430.0, 1381.0], [446.0, 3918.0], [432.0, 2167.2], [439.0, 5376.0], [438.0, 4712.0], [437.0, 5817.0], [436.0, 4935.0], [433.0, 1799.6666666666667], [441.0, 3427.3333333333335], [443.0, 3529.5], [445.0, 2462.0], [447.0, 3533.5], [444.0, 5091.0], [435.0, 4768.0], [434.0, 5274.0], [442.0, 4753.0], [461.0, 3563.5], [452.0, 2517.5], [453.0, 4216.0], [455.0, 4437.0], [449.0, 4211.0], [448.0, 5821.0], [454.0, 5621.0], [451.0, 1461.5], [450.0, 3786.0], [458.0, 4177.0], [459.0, 3081.5], [463.0, 5316.0], [456.0, 5225.0], [462.0, 4054.0], [460.0, 4816.0], [477.0, 3846.5], [465.0, 1832.5], [469.0, 2653.0], [468.0, 5181.5], [471.0, 5692.0], [464.0, 5369.0], [470.0, 5113.0], [473.0, 3276.5], [472.0, 4305.0], [476.0, 3591.5], [466.0, 5278.0], [478.0, 2755.6666666666665], [479.0, 2522.6666666666665], [475.0, 5312.0], [474.0, 4420.0], [492.0, 2542.0], [482.0, 2092.3333333333335], [483.0, 1983.4], [484.0, 2650.666666666667], [485.0, 4010.0], [487.0, 6090.0], [481.0, 3989.0], [480.0, 5032.0], [486.0, 4637.0], [488.0, 3494.5], [491.0, 2626.5], [490.0, 5888.0], [493.0, 3522.5], [495.0, 5544.0], [494.0, 3816.0], [511.0, 5673.0], [505.0, 2161.625], [510.0, 4650.0], [509.0, 4283.0], [508.0, 4417.0], [499.0, 5753.0], [498.0, 5293.0], [497.0, 5827.0], [496.0, 5285.0], [507.0, 4535.0], [506.0, 4567.0], [504.0, 5481.0], [503.0, 4904.0], [502.0, 4436.0], [501.0, 4605.0], [500.0, 4586.0], [540.0, 2466.2], [527.0, 3073.333333333333], [515.0, 3206.5], [514.0, 4317.0], [513.0, 5935.0], [512.0, 4619.0], [517.0, 4241.0], [516.0, 4231.0], [519.0, 5176.0], [518.0, 4258.0], [536.0, 2588.2], [537.0, 3346.5], [539.0, 5187.0], [538.0, 4202.0], [542.0, 2530.0], [543.0, 2355.3333333333335], [528.0, 5210.0], [541.0, 2998.3333333333335], [524.0, 3216.5], [523.0, 3091.5], [522.0, 5302.0], [521.0, 5354.5], [525.0, 2694.0], [526.0, 3266.0], [529.0, 1963.0], [530.0, 2022.0], [531.0, 4254.0], [533.0, 1978.181818181818], [534.0, 2259.0], [535.0, 2649.6666666666665], [532.0, 2193.875], [569.0, 3231.0], [556.0, 2784.0], [544.0, 2762.333333333333], [545.0, 3184.5], [546.0, 3445.5], [548.0, 3480.0], [547.0, 3650.0], [550.0, 5077.0], [549.0, 5505.0], [568.0, 2725.0], [551.0, 5090.0], [565.0, 3142.0], [564.0, 5513.0], [563.0, 4170.0], [562.0, 4092.0], [561.0, 4025.5], [574.0, 3351.0], [573.0, 5899.0], [572.0, 4106.0], [571.0, 5096.0], [570.0, 4497.0], [575.0, 2248.5], [553.0, 2982.5], [552.0, 3525.0], [554.0, 3758.0], [555.0, 2908.75], [558.0, 2864.5], [557.0, 5663.0], [559.0, 5138.0], [567.0, 3189.333333333333], [566.0, 2667.5], [579.0, 3046.3333333333335], [588.0, 2867.333333333333], [577.0, 3089.5], [576.0, 3139.333333333333], [590.0, 2833.3333333333335], [589.0, 5237.0], [591.0, 3874.0], [578.0, 3279.0], [583.0, 2376.5], [582.0, 4100.0], [581.0, 3750.0], [580.0, 4267.0], [600.0, 2771.0], [603.0, 3804.0], [602.0, 5138.0], [601.0, 5056.0], [604.0, 3346.0], [606.0, 3119.5], [607.0, 4015.0], [592.0, 5154.0], [605.0, 3070.0], [593.0, 3466.5], [597.0, 3473.5], [599.0, 5858.0], [598.0, 5365.0], [596.0, 2447.3333333333335], [595.0, 4984.0], [594.0, 4989.0], [585.0, 2907.5], [586.0, 2666.0], [584.0, 2638.6666666666665], [587.0, 2333.6666666666665], [614.0, 2578.0], [609.0, 2875.0], [608.0, 3701.0], [620.0, 3769.0], [619.0, 6022.0], [618.0, 4586.0], [622.0, 4173.0], [621.0, 5252.0], [623.0, 4772.0], [610.0, 2481.0], [613.0, 2316.8571428571427], [612.0, 2546.2], [611.0, 2540.4], [625.0, 2646.6666666666665], [624.0, 5119.0], [638.0, 2507.4], [637.0, 3703.0], [636.0, 4625.0], [635.0, 4530.0], [639.0, 1436.0], [632.0, 3862.5], [615.0, 3786.0], [633.0, 2430.0], [634.0, 2794.5], [626.0, 3036.0], [628.0, 3404.0], [630.0, 2774.3749999999995], [631.0, 2005.8], [629.0, 2873.0], [617.0, 1269.5], [616.0, 2582.5], [665.0, 2432.6666666666665], [643.0, 2622.5], [641.0, 3475.0], [640.0, 4967.5], [642.0, 3746.0], [646.0, 3328.5], [645.0, 4955.0], [644.0, 5354.0], [664.0, 3107.3333333333335], [647.0, 3798.0], [666.0, 2649.428571428571], [667.0, 3232.3333333333335], [669.0, 2410.0], [671.0, 4366.0], [670.0, 4650.0], [668.0, 2591.857142857143], [652.0, 2690.2], [651.0, 4814.0], [650.0, 3622.0], [649.0, 3695.0], [648.0, 5019.0], [654.0, 3269.0], [653.0, 4610.0], [656.0, 3388.0], [655.0, 2592.3333333333335], [657.0, 2328.75], [658.0, 2367.75], [662.0, 2831.0], [661.0, 4076.0], [660.0, 4046.0], [659.0, 5087.0], [663.0, 5118.0], [675.0, 3427.5], [683.0, 3413.8], [674.0, 3227.5], [673.0, 4530.0], [672.0, 2914.0], [687.0, 2684.714285714286], [686.0, 2528.0], [685.0, 2554.3333333333335], [684.0, 5051.0], [676.0, 2571.5], [677.0, 3719.0], [681.0, 3323.0], [679.0, 2082.1666666666665], [696.0, 3820.5], [697.0, 4034.5], [698.0, 3138.6666666666665], [700.0, 2416.3333333333335], [702.0, 2756.333333333333], [703.0, 2846.0], [701.0, 3358.3333333333335], [699.0, 2693.1111111111113], [689.0, 2645.0], [690.0, 3500.0], [691.0, 3963.5], [693.0, 3459.3333333333335], [694.0, 3386.666666666667], [695.0, 3860.5], [692.0, 3799.0], [688.0, 2389.0], [678.0, 3130.75], [680.0, 3199.2], [682.0, 2025.75], [732.0, 5095.0], [707.0, 3414.3333333333335], [706.0, 4101.0], [705.0, 5047.0], [704.0, 4809.0], [718.0, 3268.6250000000005], [719.0, 3484.5], [710.0, 4072.5], [709.0, 4739.0], [708.0, 4939.0], [728.0, 3372.4], [711.0, 4443.0], [730.0, 2671.1666666666665], [731.0, 3465.0], [733.0, 5020.0], [735.0, 3604.0], [734.0, 4188.0], [729.0, 3161.3333333333335], [720.0, 2428.8571428571427], [722.0, 2944.2307692307695], [721.0, 3263.222222222222], [724.0, 2610.3333333333335], [725.0, 2579.375], [726.0, 2603.3999999999996], [727.0, 2377.5], [723.0, 2674.2000000000003], [713.0, 2605.636363636364], [715.0, 2815.8333333333335], [714.0, 3231.8571428571427], [712.0, 2625.4], [716.0, 3421.6], [717.0, 2983.2], [737.0, 3468.5], [747.0, 2875.583333333333], [736.0, 3736.0], [751.0, 3033.5], [750.0, 3432.8], [749.0, 3328.1428571428573], [748.0, 2727.0], [740.0, 2488.0], [739.0, 4318.0], [738.0, 4393.0], [742.0, 2734.75], [743.0, 3525.0], [761.0, 3056.0], [762.0, 2663.6], [764.0, 3323.3333333333335], [763.0, 3393.0], [765.0, 3346.333333333334], [766.0, 3148.0], [767.0, 3077.3333333333335], [760.0, 3278.0], [752.0, 2878.8888888888887], [753.0, 3466.8], [755.0, 3818.5], [754.0, 5249.0], [756.0, 3298.4285714285716], [757.0, 3309.6666666666665], [759.0, 2988.75], [758.0, 3258.6666666666665], [741.0, 3350.3333333333335], [744.0, 3486.75], [745.0, 3126.285714285714], [746.0, 2999.0], [792.0, 3054.4], [770.0, 3226.857142857143], [771.0, 4150.333333333333], [772.0, 4235.0], [769.0, 3086.5], [768.0, 3153.0], [773.0, 3757.0], [775.0, 3785.0], [774.0, 4909.0], [784.0, 3542.5], [799.0, 3000.8], [797.0, 3440.5], [796.0, 4825.0], [798.0, 3385.5], [793.0, 2900.2], [794.0, 3195.25], [795.0, 3230.0], [786.0, 2911.5714285714284], [787.0, 3289.333333333333], [791.0, 3734.0], [790.0, 4727.0], [789.0, 4998.0], [788.0, 4911.0], [785.0, 3780.25], [780.0, 3377.0], [779.0, 5338.0], [778.0, 4933.0], [777.0, 3312.0], [776.0, 4817.0], [782.0, 3820.0], [783.0, 3307.0], [781.0, 2758.0], [807.0, 3296.125], [803.0, 3426.0], [800.0, 4099.0], [802.0, 4256.0], [801.0, 4876.0], [815.0, 3273.25], [814.0, 3135.0], [813.0, 3479.3333333333335], [804.0, 3143.285714285714], [805.0, 2891.6666666666665], [806.0, 3185.714285714286], [808.0, 3729.0], [809.0, 2920.0], [816.0, 3906.75], [817.0, 4475.0], [830.0, 4226.0], [831.0, 4021.0], [826.0, 2672.0], [828.0, 4027.0], [827.0, 4858.0], [829.0, 4247.5], [824.0, 3523.0], [825.0, 3531.0], [818.0, 3125.5], [822.0, 3701.0], [821.0, 4533.0], [820.0, 5401.0], [819.0, 4812.0], [823.0, 3180.6666666666665], [810.0, 3437.3333333333335], [812.0, 3307.75], [811.0, 3470.0], [838.0, 2923.2999999999997], [845.0, 3364.75], [836.0, 3406.0], [832.0, 3313.0], [833.0, 5004.0], [835.0, 5058.0], [834.0, 4268.0], [847.0, 3367.5], [846.0, 3352.833333333333], [837.0, 3420.5], [839.0, 3094.9999999999995], [856.0, 4680.0], [858.0, 3190.714285714286], [857.0, 2512.25], [848.0, 3221.4285714285716], [863.0, 4870.0], [862.0, 4615.0], [861.0, 3135.4285714285716], [860.0, 3497.3333333333335], [859.0, 2950.1428571428573], [850.0, 3205.285714285714], [851.0, 3226.2], [853.0, 3404.6666666666665], [854.0, 3585.5], [855.0, 5172.0], [852.0, 4053.5], [849.0, 3423.5], [843.0, 3100.6], [844.0, 3893.3333333333335], [842.0, 3236.5], [841.0, 3064.6666666666665], [840.0, 3193.625], [869.0, 3285.75], [865.0, 3445.0], [866.0, 3735.0], [864.0, 3753.75], [878.0, 3463.75], [879.0, 4456.0], [867.0, 3453.4], [868.0, 3594.0], [871.0, 3311.0], [870.0, 4895.0], [888.0, 4671.0], [890.0, 3776.6666666666665], [892.0, 3556.6666666666665], [893.0, 3237.0], [895.0, 3776.5], [880.0, 3900.0], [894.0, 3674.5], [891.0, 3119.8571428571427], [889.0, 4171.0], [881.0, 3371.25], [884.0, 3188.2], [883.0, 4928.0], [882.0, 4442.0], [885.0, 3296.5], [886.0, 3992.6666666666665], [887.0, 4068.0], [873.0, 3225.5], [872.0, 4111.0], [874.0, 2778.0], [876.0, 3746.0], [875.0, 5046.0], [877.0, 3285.5], [924.0, 3853.0], [897.0, 3695.0], [898.0, 3855.0], [899.0, 3932.0], [901.0, 4526.0], [900.0, 3908.0], [903.0, 4477.0], [902.0, 3752.0], [921.0, 4153.0], [920.0, 4239.0], [896.0, 3484.6666666666665], [911.0, 4414.0], [910.0, 4515.0], [909.0, 4051.0], [908.0, 4705.0], [907.0, 4105.0], [906.0, 4258.0], [905.0, 4848.0], [904.0, 4460.0], [927.0, 3859.0], [912.0, 3807.0], [914.0, 4052.0], [913.0, 4565.0], [917.0, 4590.0], [915.0, 4125.0], [919.0, 4667.0], [918.0, 4329.0], [926.0, 5180.0], [925.0, 4093.0], [923.0, 3622.0], [922.0, 3720.0], [953.0, 3859.0], [958.0, 4117.0], [959.0, 4536.0], [945.0, 4880.0], [944.0, 3906.0], [947.0, 4672.0], [946.0, 3899.0], [949.0, 4160.0], [948.0, 3965.0], [957.0, 4155.0], [955.0, 4081.0], [954.0, 4339.0], [952.0, 4679.0], [935.0, 4444.0], [934.0, 4719.0], [933.0, 5107.0], [932.0, 4684.0], [931.0, 4804.0], [930.0, 4003.0], [929.0, 3563.0], [928.0, 4368.0], [943.0, 5324.0], [942.0, 4172.0], [941.0, 4484.0], [940.0, 4053.0], [939.0, 4101.0], [938.0, 4674.5], [936.0, 3992.0], [951.0, 4662.0], [950.0, 4310.0], [988.0, 4533.0], [991.0, 4268.0], [977.0, 4384.0], [976.0, 3982.0], [979.0, 4637.0], [978.0, 4139.0], [981.0, 4500.0], [980.0, 4217.0], [990.0, 4447.0], [989.0, 4932.0], [987.0, 3899.0], [986.0, 3857.0], [985.0, 4921.0], [984.0, 4267.0], [975.0, 3914.0], [961.0, 3917.0], [960.0, 4788.0], [963.0, 3982.0], [962.0, 4439.0], [965.0, 3847.0], [964.0, 4684.0], [967.0, 4483.0], [966.0, 4500.0], [974.0, 4197.0], [973.0, 4447.0], [972.0, 3867.0], [971.0, 5403.0], [970.0, 4386.5], [968.0, 4209.0], [983.0, 4860.0], [982.0, 4693.0], [1020.0, 4238.0], [1023.0, 4128.0], [1008.0, 4337.0], [1011.0, 4979.0], [1010.0, 4387.5], [1013.0, 4626.0], [1012.0, 4125.0], [1022.0, 4152.0], [1021.0, 4352.0], [1019.0, 5489.0], [1018.0, 4241.0], [1017.0, 4527.0], [1016.0, 4163.0], [1007.0, 3587.0], [993.0, 4804.0], [992.0, 4227.0], [995.0, 5550.0], [994.0, 3534.0], [997.0, 4288.0], [996.0, 3905.0], [999.0, 4025.0], [998.0, 4297.0], [1006.0, 4512.0], [1005.0, 3842.0], [1004.0, 4705.0], [1003.0, 4252.0], [1002.0, 4236.0], [1001.0, 5149.0], [1000.0, 4345.0], [1015.0, 4602.0], [1014.0, 4072.0], [1030.0, 3272.0], [1076.0, 3741.75], [1080.0, 4023.8888888888887], [1082.0, 4046.25], [1078.0, 3802.818181818182], [1074.0, 4171.0], [1072.0, 4122.0], [1024.0, 4451.0], [1026.0, 3885.0], [1028.0, 4507.0], [1032.0, 4132.0], [1034.0, 5343.0], [1036.0, 4598.0], [1038.0, 4472.0], [1054.0, 4714.0], [1052.0, 3816.0], [1050.0, 3055.0], [1048.0, 4483.0], [1046.0, 4800.0], [1044.0, 4415.0], [1042.0, 4261.0], [1040.0, 3979.0], [1086.0, 3978.0], [1058.0, 4256.0], [1056.0, 3804.0], [1060.0, 3912.3333333333335], [1062.0, 3728.428571428571], [1064.0, 3377.2], [1066.0, 4030.666666666667], [1068.0, 3784.1249999999995], [1070.0, 4215.75], [1084.0, 3739.2], [1100.0, 3869.0], [1114.0, 4352.111111111111], [1096.0, 3921.4166666666665], [1092.0, 4866.0], [1088.0, 4540.0], [1090.0, 3855.0], [1118.0, 3316.5], [1116.0, 3994.6], [1112.0, 3702.714285714286], [1108.0, 4078.875], [1106.0, 3960.0], [1110.0, 3876.8], [1104.0, 3723.0], [1098.0, 4092.1111111111113], [1094.0, 3885.6], [1102.0, 4364.333333333333], [1136.0, 4128.0], [1140.0, 4105.0], [1142.0, 3801.875], [1150.0, 4162.5], [1148.0, 4230.5], [1146.0, 4576.0], [1138.0, 3860.0], [1120.0, 3979.8333333333335], [1122.0, 3866.3333333333335], [1130.0, 4136.0], [1128.0, 3441.0], [1126.0, 4144.0], [1132.0, 4120.0], [1134.0, 3991.0], [1124.0, 4349.5], [1156.0, 3852.0], [1154.0, 4025.7], [1158.0, 4084.0], [1152.0, 4523.0], [1029.0, 4943.0], [1085.0, 3998.25], [1081.0, 3830.5], [1079.0, 3669.7500000000005], [1077.0, 3706.5], [1075.0, 3694.0], [1073.0, 3882.5], [1055.0, 4520.0], [1025.0, 4354.0], [1027.0, 3892.0], [1031.0, 4791.0], [1033.0, 4745.0], [1035.0, 4334.0], [1037.0, 4242.0], [1039.0, 4143.0], [1053.0, 4327.0], [1051.0, 4599.0], [1049.0, 4773.0], [1047.0, 4968.0], [1045.0, 4364.0], [1043.0, 4900.0], [1041.0, 3590.0], [1087.0, 3702.0], [1059.0, 4635.0], [1057.0, 4127.0], [1061.0, 3628.4], [1063.0, 3166.0], [1065.0, 3928.0], [1067.0, 3874.285714285714], [1069.0, 4052.2000000000003], [1071.0, 3997.75], [1083.0, 4013.0], [1097.0, 4009.9999999999995], [1091.0, 3635.0], [1119.0, 3902.75], [1089.0, 3872.0], [1117.0, 3791.3333333333335], [1115.0, 3868.3333333333335], [1113.0, 4283.1], [1111.0, 3632.5454545454545], [1109.0, 4004.5], [1107.0, 3801.9], [1105.0, 3061.5], [1099.0, 3623.875], [1095.0, 3912.65], [1093.0, 3761.6666666666665], [1101.0, 4020.25], [1103.0, 4015.8], [1137.0, 3825.0], [1139.0, 4059.0], [1149.0, 3969.1666666666665], [1151.0, 4277.75], [1147.0, 4403.4], [1145.0, 3922.5], [1143.0, 4327.0], [1141.0, 4266.5], [1121.0, 4476.666666666667], [1125.0, 3702.3333333333335], [1129.0, 4133.0], [1127.0, 3891.0], [1131.0, 3819.0], [1133.0, 4157.333333333333], [1135.0, 4729.5], [1123.0, 4134.0], [1155.0, 4147.571428571428], [1153.0, 4024.6666666666665], [1157.0, 3839.2], [1.0, 5512.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[599.1833333333341, 3194.964333333329]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1158.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12700.0, "minX": 1.54961892E12, "maxY": 21047.45, "series": [{"data": [[1.54961892E12, 21047.45]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961892E12, 12700.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961892E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3194.964333333329, "minX": 1.54961892E12, "maxY": 3194.964333333329, "series": [{"data": [[1.54961892E12, 3194.964333333329]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961892E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3194.9566666666647, "minX": 1.54961892E12, "maxY": 3194.9566666666647, "series": [{"data": [[1.54961892E12, 3194.9566666666647]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961892E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 86.95166666666671, "minX": 1.54961892E12, "maxY": 86.95166666666671, "series": [{"data": [[1.54961892E12, 86.95166666666671]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961892E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 100.0, "minX": 1.54961892E12, "maxY": 7027.0, "series": [{"data": [[1.54961892E12, 7027.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961892E12, 100.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961892E12, 5315.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961892E12, 6592.959999999999]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961892E12, 5665.849999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961892E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3467.0, "minX": 50.0, "maxY": 3467.0, "series": [{"data": [[50.0, 3467.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3467.0, "minX": 50.0, "maxY": 3467.0, "series": [{"data": [[50.0, 3467.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961892E12, "maxY": 50.0, "series": [{"data": [[1.54961892E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961892E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961892E12, "maxY": 50.0, "series": [{"data": [[1.54961892E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961892E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961892E12, "maxY": 50.0, "series": [{"data": [[1.54961892E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961892E12, "title": "Transactions Per Second"}},
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
