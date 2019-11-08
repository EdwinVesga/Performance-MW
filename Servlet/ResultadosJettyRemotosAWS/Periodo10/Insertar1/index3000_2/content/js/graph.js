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
        data: {"result": {"minY": 95.0, "minX": 0.0, "maxY": 7933.0, "series": [{"data": [[0.0, 95.0], [0.1, 123.0], [0.2, 134.0], [0.3, 138.0], [0.4, 142.0], [0.5, 146.0], [0.6, 147.0], [0.7, 149.0], [0.8, 151.0], [0.9, 154.0], [1.0, 155.0], [1.1, 156.0], [1.2, 158.0], [1.3, 160.0], [1.4, 164.0], [1.5, 170.0], [1.6, 172.0], [1.7, 173.0], [1.8, 175.0], [1.9, 178.0], [2.0, 180.0], [2.1, 183.0], [2.2, 186.0], [2.3, 192.0], [2.4, 195.0], [2.5, 197.0], [2.6, 200.0], [2.7, 202.0], [2.8, 203.0], [2.9, 205.0], [3.0, 209.0], [3.1, 214.0], [3.2, 218.0], [3.3, 219.0], [3.4, 227.0], [3.5, 233.0], [3.6, 244.0], [3.7, 252.0], [3.8, 260.0], [3.9, 264.0], [4.0, 282.0], [4.1, 287.0], [4.2, 303.0], [4.3, 328.0], [4.4, 358.0], [4.5, 454.0], [4.6, 472.0], [4.7, 487.0], [4.8, 514.0], [4.9, 518.0], [5.0, 550.0], [5.1, 570.0], [5.2, 591.0], [5.3, 603.0], [5.4, 618.0], [5.5, 646.0], [5.6, 652.0], [5.7, 662.0], [5.8, 669.0], [5.9, 674.0], [6.0, 709.0], [6.1, 711.0], [6.2, 717.0], [6.3, 723.0], [6.4, 737.0], [6.5, 743.0], [6.6, 749.0], [6.7, 753.0], [6.8, 758.0], [6.9, 764.0], [7.0, 767.0], [7.1, 775.0], [7.2, 781.0], [7.3, 787.0], [7.4, 791.0], [7.5, 800.0], [7.6, 807.0], [7.7, 810.0], [7.8, 816.0], [7.9, 824.0], [8.0, 833.0], [8.1, 843.0], [8.2, 848.0], [8.3, 855.0], [8.4, 860.0], [8.5, 875.0], [8.6, 885.0], [8.7, 892.0], [8.8, 901.0], [8.9, 909.0], [9.0, 919.0], [9.1, 923.0], [9.2, 930.0], [9.3, 938.0], [9.4, 944.0], [9.5, 947.0], [9.6, 949.0], [9.7, 955.0], [9.8, 957.0], [9.9, 966.0], [10.0, 973.0], [10.1, 976.0], [10.2, 978.0], [10.3, 982.0], [10.4, 986.0], [10.5, 992.0], [10.6, 1003.0], [10.7, 1012.0], [10.8, 1032.0], [10.9, 1037.0], [11.0, 1057.0], [11.1, 1070.0], [11.2, 1074.0], [11.3, 1086.0], [11.4, 1097.0], [11.5, 1101.0], [11.6, 1106.0], [11.7, 1113.0], [11.8, 1115.0], [11.9, 1122.0], [12.0, 1130.0], [12.1, 1137.0], [12.2, 1142.0], [12.3, 1145.0], [12.4, 1164.0], [12.5, 1169.0], [12.6, 1178.0], [12.7, 1197.0], [12.8, 1216.0], [12.9, 1219.0], [13.0, 1223.0], [13.1, 1228.0], [13.2, 1236.0], [13.3, 1241.0], [13.4, 1245.0], [13.5, 1262.0], [13.6, 1290.0], [13.7, 1300.0], [13.8, 1305.0], [13.9, 1309.0], [14.0, 1324.0], [14.1, 1330.0], [14.2, 1338.0], [14.3, 1343.0], [14.4, 1349.0], [14.5, 1362.0], [14.6, 1364.0], [14.7, 1372.0], [14.8, 1392.0], [14.9, 1394.0], [15.0, 1398.0], [15.1, 1401.0], [15.2, 1420.0], [15.3, 1446.0], [15.4, 1450.0], [15.5, 1460.0], [15.6, 1469.0], [15.7, 1483.0], [15.8, 1487.0], [15.9, 1503.0], [16.0, 1506.0], [16.1, 1512.0], [16.2, 1529.0], [16.3, 1535.0], [16.4, 1542.0], [16.5, 1551.0], [16.6, 1565.0], [16.7, 1571.0], [16.8, 1575.0], [16.9, 1592.0], [17.0, 1607.0], [17.1, 1610.0], [17.2, 1612.0], [17.3, 1624.0], [17.4, 1628.0], [17.5, 1638.0], [17.6, 1645.0], [17.7, 1665.0], [17.8, 1677.0], [17.9, 1693.0], [18.0, 1712.0], [18.1, 1722.0], [18.2, 1725.0], [18.3, 1732.0], [18.4, 1735.0], [18.5, 1749.0], [18.6, 1761.0], [18.7, 1770.0], [18.8, 1772.0], [18.9, 1786.0], [19.0, 1793.0], [19.1, 1801.0], [19.2, 1805.0], [19.3, 1811.0], [19.4, 1815.0], [19.5, 1819.0], [19.6, 1822.0], [19.7, 1831.0], [19.8, 1835.0], [19.9, 1839.0], [20.0, 1852.0], [20.1, 1857.0], [20.2, 1866.0], [20.3, 1870.0], [20.4, 1880.0], [20.5, 1885.0], [20.6, 1889.0], [20.7, 1893.0], [20.8, 1899.0], [20.9, 1917.0], [21.0, 1921.0], [21.1, 1932.0], [21.2, 1935.0], [21.3, 1937.0], [21.4, 1942.0], [21.5, 1948.0], [21.6, 1963.0], [21.7, 1967.0], [21.8, 1970.0], [21.9, 1975.0], [22.0, 1981.0], [22.1, 1989.0], [22.2, 1994.0], [22.3, 2007.0], [22.4, 2021.0], [22.5, 2030.0], [22.6, 2039.0], [22.7, 2043.0], [22.8, 2055.0], [22.9, 2062.0], [23.0, 2077.0], [23.1, 2081.0], [23.2, 2082.0], [23.3, 2088.0], [23.4, 2094.0], [23.5, 2104.0], [23.6, 2111.0], [23.7, 2119.0], [23.8, 2122.0], [23.9, 2129.0], [24.0, 2130.0], [24.1, 2138.0], [24.2, 2141.0], [24.3, 2147.0], [24.4, 2150.0], [24.5, 2155.0], [24.6, 2167.0], [24.7, 2171.0], [24.8, 2174.0], [24.9, 2177.0], [25.0, 2181.0], [25.1, 2185.0], [25.2, 2190.0], [25.3, 2194.0], [25.4, 2197.0], [25.5, 2206.0], [25.6, 2209.0], [25.7, 2211.0], [25.8, 2219.0], [25.9, 2232.0], [26.0, 2238.0], [26.1, 2250.0], [26.2, 2264.0], [26.3, 2270.0], [26.4, 2276.0], [26.5, 2286.0], [26.6, 2291.0], [26.7, 2300.0], [26.8, 2302.0], [26.9, 2309.0], [27.0, 2318.0], [27.1, 2331.0], [27.2, 2333.0], [27.3, 2340.0], [27.4, 2345.0], [27.5, 2354.0], [27.6, 2359.0], [27.7, 2365.0], [27.8, 2374.0], [27.9, 2382.0], [28.0, 2389.0], [28.1, 2396.0], [28.2, 2399.0], [28.3, 2408.0], [28.4, 2416.0], [28.5, 2424.0], [28.6, 2425.0], [28.7, 2431.0], [28.8, 2437.0], [28.9, 2443.0], [29.0, 2452.0], [29.1, 2465.0], [29.2, 2468.0], [29.3, 2475.0], [29.4, 2482.0], [29.5, 2493.0], [29.6, 2495.0], [29.7, 2499.0], [29.8, 2501.0], [29.9, 2504.0], [30.0, 2509.0], [30.1, 2522.0], [30.2, 2527.0], [30.3, 2527.0], [30.4, 2535.0], [30.5, 2546.0], [30.6, 2549.0], [30.7, 2551.0], [30.8, 2554.0], [30.9, 2561.0], [31.0, 2567.0], [31.1, 2568.0], [31.2, 2575.0], [31.3, 2581.0], [31.4, 2582.0], [31.5, 2585.0], [31.6, 2587.0], [31.7, 2599.0], [31.8, 2604.0], [31.9, 2613.0], [32.0, 2615.0], [32.1, 2621.0], [32.2, 2624.0], [32.3, 2628.0], [32.4, 2633.0], [32.5, 2640.0], [32.6, 2644.0], [32.7, 2650.0], [32.8, 2654.0], [32.9, 2656.0], [33.0, 2659.0], [33.1, 2662.0], [33.2, 2666.0], [33.3, 2672.0], [33.4, 2678.0], [33.5, 2685.0], [33.6, 2693.0], [33.7, 2695.0], [33.8, 2703.0], [33.9, 2707.0], [34.0, 2711.0], [34.1, 2719.0], [34.2, 2723.0], [34.3, 2729.0], [34.4, 2732.0], [34.5, 2735.0], [34.6, 2737.0], [34.7, 2737.0], [34.8, 2741.0], [34.9, 2744.0], [35.0, 2747.0], [35.1, 2748.0], [35.2, 2757.0], [35.3, 2765.0], [35.4, 2773.0], [35.5, 2776.0], [35.6, 2780.0], [35.7, 2785.0], [35.8, 2787.0], [35.9, 2788.0], [36.0, 2791.0], [36.1, 2792.0], [36.2, 2798.0], [36.3, 2806.0], [36.4, 2809.0], [36.5, 2814.0], [36.6, 2817.0], [36.7, 2819.0], [36.8, 2823.0], [36.9, 2829.0], [37.0, 2838.0], [37.1, 2841.0], [37.2, 2848.0], [37.3, 2854.0], [37.4, 2855.0], [37.5, 2859.0], [37.6, 2871.0], [37.7, 2878.0], [37.8, 2883.0], [37.9, 2889.0], [38.0, 2894.0], [38.1, 2902.0], [38.2, 2907.0], [38.3, 2911.0], [38.4, 2918.0], [38.5, 2925.0], [38.6, 2929.0], [38.7, 2932.0], [38.8, 2939.0], [38.9, 2944.0], [39.0, 2945.0], [39.1, 2946.0], [39.2, 2949.0], [39.3, 2954.0], [39.4, 2959.0], [39.5, 2967.0], [39.6, 2971.0], [39.7, 2977.0], [39.8, 2984.0], [39.9, 2990.0], [40.0, 2991.0], [40.1, 2995.0], [40.2, 2999.0], [40.3, 3005.0], [40.4, 3010.0], [40.5, 3011.0], [40.6, 3012.0], [40.7, 3015.0], [40.8, 3019.0], [40.9, 3026.0], [41.0, 3027.0], [41.1, 3032.0], [41.2, 3036.0], [41.3, 3042.0], [41.4, 3047.0], [41.5, 3052.0], [41.6, 3056.0], [41.7, 3060.0], [41.8, 3065.0], [41.9, 3069.0], [42.0, 3071.0], [42.1, 3074.0], [42.2, 3076.0], [42.3, 3085.0], [42.4, 3094.0], [42.5, 3098.0], [42.6, 3108.0], [42.7, 3110.0], [42.8, 3120.0], [42.9, 3125.0], [43.0, 3127.0], [43.1, 3131.0], [43.2, 3135.0], [43.3, 3142.0], [43.4, 3144.0], [43.5, 3148.0], [43.6, 3149.0], [43.7, 3153.0], [43.8, 3155.0], [43.9, 3161.0], [44.0, 3163.0], [44.1, 3165.0], [44.2, 3169.0], [44.3, 3178.0], [44.4, 3184.0], [44.5, 3187.0], [44.6, 3191.0], [44.7, 3200.0], [44.8, 3202.0], [44.9, 3205.0], [45.0, 3205.0], [45.1, 3210.0], [45.2, 3214.0], [45.3, 3220.0], [45.4, 3223.0], [45.5, 3225.0], [45.6, 3230.0], [45.7, 3234.0], [45.8, 3236.0], [45.9, 3241.0], [46.0, 3243.0], [46.1, 3245.0], [46.2, 3250.0], [46.3, 3250.0], [46.4, 3255.0], [46.5, 3263.0], [46.6, 3267.0], [46.7, 3270.0], [46.8, 3276.0], [46.9, 3279.0], [47.0, 3285.0], [47.1, 3291.0], [47.2, 3298.0], [47.3, 3302.0], [47.4, 3306.0], [47.5, 3313.0], [47.6, 3318.0], [47.7, 3322.0], [47.8, 3326.0], [47.9, 3328.0], [48.0, 3335.0], [48.1, 3339.0], [48.2, 3346.0], [48.3, 3353.0], [48.4, 3357.0], [48.5, 3363.0], [48.6, 3366.0], [48.7, 3368.0], [48.8, 3375.0], [48.9, 3377.0], [49.0, 3382.0], [49.1, 3383.0], [49.2, 3386.0], [49.3, 3389.0], [49.4, 3393.0], [49.5, 3404.0], [49.6, 3410.0], [49.7, 3414.0], [49.8, 3425.0], [49.9, 3434.0], [50.0, 3438.0], [50.1, 3442.0], [50.2, 3447.0], [50.3, 3449.0], [50.4, 3451.0], [50.5, 3454.0], [50.6, 3461.0], [50.7, 3468.0], [50.8, 3471.0], [50.9, 3474.0], [51.0, 3484.0], [51.1, 3488.0], [51.2, 3493.0], [51.3, 3496.0], [51.4, 3500.0], [51.5, 3504.0], [51.6, 3509.0], [51.7, 3511.0], [51.8, 3520.0], [51.9, 3522.0], [52.0, 3525.0], [52.1, 3526.0], [52.2, 3529.0], [52.3, 3531.0], [52.4, 3533.0], [52.5, 3542.0], [52.6, 3546.0], [52.7, 3550.0], [52.8, 3555.0], [52.9, 3565.0], [53.0, 3576.0], [53.1, 3585.0], [53.2, 3590.0], [53.3, 3597.0], [53.4, 3599.0], [53.5, 3609.0], [53.6, 3612.0], [53.7, 3616.0], [53.8, 3622.0], [53.9, 3631.0], [54.0, 3632.0], [54.1, 3635.0], [54.2, 3637.0], [54.3, 3639.0], [54.4, 3643.0], [54.5, 3648.0], [54.6, 3649.0], [54.7, 3652.0], [54.8, 3657.0], [54.9, 3663.0], [55.0, 3664.0], [55.1, 3666.0], [55.2, 3670.0], [55.3, 3676.0], [55.4, 3679.0], [55.5, 3682.0], [55.6, 3691.0], [55.7, 3699.0], [55.8, 3702.0], [55.9, 3704.0], [56.0, 3714.0], [56.1, 3721.0], [56.2, 3726.0], [56.3, 3731.0], [56.4, 3732.0], [56.5, 3743.0], [56.6, 3750.0], [56.7, 3755.0], [56.8, 3759.0], [56.9, 3767.0], [57.0, 3778.0], [57.1, 3779.0], [57.2, 3780.0], [57.3, 3785.0], [57.4, 3788.0], [57.5, 3793.0], [57.6, 3801.0], [57.7, 3805.0], [57.8, 3808.0], [57.9, 3818.0], [58.0, 3828.0], [58.1, 3831.0], [58.2, 3834.0], [58.3, 3839.0], [58.4, 3846.0], [58.5, 3857.0], [58.6, 3863.0], [58.7, 3864.0], [58.8, 3870.0], [58.9, 3880.0], [59.0, 3881.0], [59.1, 3887.0], [59.2, 3897.0], [59.3, 3907.0], [59.4, 3909.0], [59.5, 3919.0], [59.6, 3920.0], [59.7, 3925.0], [59.8, 3932.0], [59.9, 3938.0], [60.0, 3944.0], [60.1, 3950.0], [60.2, 3953.0], [60.3, 3959.0], [60.4, 3967.0], [60.5, 3969.0], [60.6, 3975.0], [60.7, 3979.0], [60.8, 3987.0], [60.9, 3996.0], [61.0, 4003.0], [61.1, 4009.0], [61.2, 4012.0], [61.3, 4015.0], [61.4, 4019.0], [61.5, 4021.0], [61.6, 4027.0], [61.7, 4030.0], [61.8, 4036.0], [61.9, 4042.0], [62.0, 4048.0], [62.1, 4051.0], [62.2, 4058.0], [62.3, 4061.0], [62.4, 4063.0], [62.5, 4068.0], [62.6, 4076.0], [62.7, 4078.0], [62.8, 4082.0], [62.9, 4087.0], [63.0, 4095.0], [63.1, 4100.0], [63.2, 4105.0], [63.3, 4108.0], [63.4, 4109.0], [63.5, 4117.0], [63.6, 4120.0], [63.7, 4127.0], [63.8, 4130.0], [63.9, 4133.0], [64.0, 4137.0], [64.1, 4145.0], [64.2, 4148.0], [64.3, 4156.0], [64.4, 4165.0], [64.5, 4167.0], [64.6, 4174.0], [64.7, 4178.0], [64.8, 4184.0], [64.9, 4187.0], [65.0, 4191.0], [65.1, 4195.0], [65.2, 4211.0], [65.3, 4217.0], [65.4, 4226.0], [65.5, 4237.0], [65.6, 4247.0], [65.7, 4254.0], [65.8, 4259.0], [65.9, 4263.0], [66.0, 4269.0], [66.1, 4275.0], [66.2, 4278.0], [66.3, 4283.0], [66.4, 4296.0], [66.5, 4303.0], [66.6, 4309.0], [66.7, 4311.0], [66.8, 4314.0], [66.9, 4323.0], [67.0, 4327.0], [67.1, 4334.0], [67.2, 4352.0], [67.3, 4354.0], [67.4, 4356.0], [67.5, 4361.0], [67.6, 4365.0], [67.7, 4367.0], [67.8, 4371.0], [67.9, 4374.0], [68.0, 4375.0], [68.1, 4382.0], [68.2, 4387.0], [68.3, 4391.0], [68.4, 4392.0], [68.5, 4395.0], [68.6, 4399.0], [68.7, 4404.0], [68.8, 4410.0], [68.9, 4413.0], [69.0, 4415.0], [69.1, 4418.0], [69.2, 4424.0], [69.3, 4432.0], [69.4, 4440.0], [69.5, 4448.0], [69.6, 4451.0], [69.7, 4461.0], [69.8, 4468.0], [69.9, 4471.0], [70.0, 4475.0], [70.1, 4481.0], [70.2, 4490.0], [70.3, 4493.0], [70.4, 4497.0], [70.5, 4499.0], [70.6, 4509.0], [70.7, 4512.0], [70.8, 4516.0], [70.9, 4523.0], [71.0, 4525.0], [71.1, 4527.0], [71.2, 4534.0], [71.3, 4539.0], [71.4, 4541.0], [71.5, 4543.0], [71.6, 4552.0], [71.7, 4556.0], [71.8, 4563.0], [71.9, 4565.0], [72.0, 4568.0], [72.1, 4574.0], [72.2, 4580.0], [72.3, 4586.0], [72.4, 4591.0], [72.5, 4596.0], [72.6, 4598.0], [72.7, 4599.0], [72.8, 4607.0], [72.9, 4608.0], [73.0, 4616.0], [73.1, 4620.0], [73.2, 4634.0], [73.3, 4638.0], [73.4, 4649.0], [73.5, 4653.0], [73.6, 4656.0], [73.7, 4659.0], [73.8, 4660.0], [73.9, 4667.0], [74.0, 4669.0], [74.1, 4675.0], [74.2, 4687.0], [74.3, 4689.0], [74.4, 4692.0], [74.5, 4698.0], [74.6, 4703.0], [74.7, 4717.0], [74.8, 4719.0], [74.9, 4726.0], [75.0, 4729.0], [75.1, 4734.0], [75.2, 4739.0], [75.3, 4740.0], [75.4, 4745.0], [75.5, 4750.0], [75.6, 4755.0], [75.7, 4759.0], [75.8, 4764.0], [75.9, 4767.0], [76.0, 4775.0], [76.1, 4778.0], [76.2, 4782.0], [76.3, 4789.0], [76.4, 4791.0], [76.5, 4794.0], [76.6, 4796.0], [76.7, 4800.0], [76.8, 4811.0], [76.9, 4815.0], [77.0, 4822.0], [77.1, 4827.0], [77.2, 4837.0], [77.3, 4837.0], [77.4, 4839.0], [77.5, 4845.0], [77.6, 4853.0], [77.7, 4854.0], [77.8, 4858.0], [77.9, 4860.0], [78.0, 4868.0], [78.1, 4873.0], [78.2, 4875.0], [78.3, 4877.0], [78.4, 4879.0], [78.5, 4882.0], [78.6, 4890.0], [78.7, 4891.0], [78.8, 4894.0], [78.9, 4898.0], [79.0, 4901.0], [79.1, 4909.0], [79.2, 4913.0], [79.3, 4914.0], [79.4, 4917.0], [79.5, 4919.0], [79.6, 4925.0], [79.7, 4929.0], [79.8, 4934.0], [79.9, 4936.0], [80.0, 4945.0], [80.1, 4949.0], [80.2, 4952.0], [80.3, 4956.0], [80.4, 4959.0], [80.5, 4966.0], [80.6, 4970.0], [80.7, 4972.0], [80.8, 4977.0], [80.9, 4981.0], [81.0, 4983.0], [81.1, 4987.0], [81.2, 4996.0], [81.3, 4998.0], [81.4, 5000.0], [81.5, 5009.0], [81.6, 5011.0], [81.7, 5015.0], [81.8, 5017.0], [81.9, 5027.0], [82.0, 5029.0], [82.1, 5033.0], [82.2, 5036.0], [82.3, 5040.0], [82.4, 5044.0], [82.5, 5050.0], [82.6, 5053.0], [82.7, 5055.0], [82.8, 5062.0], [82.9, 5064.0], [83.0, 5070.0], [83.1, 5076.0], [83.2, 5080.0], [83.3, 5090.0], [83.4, 5094.0], [83.5, 5097.0], [83.6, 5101.0], [83.7, 5105.0], [83.8, 5117.0], [83.9, 5119.0], [84.0, 5122.0], [84.1, 5126.0], [84.2, 5135.0], [84.3, 5142.0], [84.4, 5156.0], [84.5, 5158.0], [84.6, 5162.0], [84.7, 5168.0], [84.8, 5172.0], [84.9, 5179.0], [85.0, 5190.0], [85.1, 5192.0], [85.2, 5196.0], [85.3, 5200.0], [85.4, 5205.0], [85.5, 5209.0], [85.6, 5211.0], [85.7, 5225.0], [85.8, 5230.0], [85.9, 5236.0], [86.0, 5239.0], [86.1, 5246.0], [86.2, 5248.0], [86.3, 5252.0], [86.4, 5258.0], [86.5, 5258.0], [86.6, 5260.0], [86.7, 5262.0], [86.8, 5269.0], [86.9, 5272.0], [87.0, 5276.0], [87.1, 5280.0], [87.2, 5284.0], [87.3, 5288.0], [87.4, 5294.0], [87.5, 5300.0], [87.6, 5309.0], [87.7, 5313.0], [87.8, 5316.0], [87.9, 5322.0], [88.0, 5334.0], [88.1, 5348.0], [88.2, 5360.0], [88.3, 5372.0], [88.4, 5375.0], [88.5, 5381.0], [88.6, 5382.0], [88.7, 5387.0], [88.8, 5390.0], [88.9, 5394.0], [89.0, 5402.0], [89.1, 5407.0], [89.2, 5420.0], [89.3, 5426.0], [89.4, 5434.0], [89.5, 5438.0], [89.6, 5452.0], [89.7, 5460.0], [89.8, 5462.0], [89.9, 5466.0], [90.0, 5471.0], [90.1, 5474.0], [90.2, 5479.0], [90.3, 5489.0], [90.4, 5496.0], [90.5, 5515.0], [90.6, 5519.0], [90.7, 5525.0], [90.8, 5528.0], [90.9, 5536.0], [91.0, 5537.0], [91.1, 5540.0], [91.2, 5544.0], [91.3, 5549.0], [91.4, 5554.0], [91.5, 5558.0], [91.6, 5561.0], [91.7, 5567.0], [91.8, 5577.0], [91.9, 5579.0], [92.0, 5588.0], [92.1, 5599.0], [92.2, 5606.0], [92.3, 5610.0], [92.4, 5618.0], [92.5, 5624.0], [92.6, 5633.0], [92.7, 5653.0], [92.8, 5654.0], [92.9, 5659.0], [93.0, 5670.0], [93.1, 5679.0], [93.2, 5683.0], [93.3, 5690.0], [93.4, 5700.0], [93.5, 5707.0], [93.6, 5722.0], [93.7, 5735.0], [93.8, 5753.0], [93.9, 5765.0], [94.0, 5771.0], [94.1, 5785.0], [94.2, 5804.0], [94.3, 5819.0], [94.4, 5838.0], [94.5, 5846.0], [94.6, 5850.0], [94.7, 5860.0], [94.8, 5880.0], [94.9, 5889.0], [95.0, 5899.0], [95.1, 5903.0], [95.2, 5906.0], [95.3, 5928.0], [95.4, 5935.0], [95.5, 5942.0], [95.6, 5948.0], [95.7, 5956.0], [95.8, 5975.0], [95.9, 5990.0], [96.0, 5996.0], [96.1, 6006.0], [96.2, 6021.0], [96.3, 6032.0], [96.4, 6050.0], [96.5, 6064.0], [96.6, 6074.0], [96.7, 6083.0], [96.8, 6095.0], [96.9, 6106.0], [97.0, 6121.0], [97.1, 6128.0], [97.2, 6151.0], [97.3, 6194.0], [97.4, 6236.0], [97.5, 6251.0], [97.6, 6268.0], [97.7, 6286.0], [97.8, 6309.0], [97.9, 6332.0], [98.0, 6355.0], [98.1, 6370.0], [98.2, 6378.0], [98.3, 6383.0], [98.4, 6412.0], [98.5, 6430.0], [98.6, 6459.0], [98.7, 6508.0], [98.8, 6545.0], [98.9, 6586.0], [99.0, 6621.0], [99.1, 6692.0], [99.2, 6738.0], [99.3, 6807.0], [99.4, 6890.0], [99.5, 6978.0], [99.6, 7222.0], [99.7, 7337.0], [99.8, 7467.0], [99.9, 7725.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 78.0, "series": [{"data": [[0.0, 1.0], [600.0, 21.0], [700.0, 46.0], [800.0, 39.0], [900.0, 54.0], [1000.0, 27.0], [1100.0, 37.0], [1200.0, 29.0], [1300.0, 40.0], [1400.0, 26.0], [1500.0, 32.0], [1600.0, 28.0], [1700.0, 34.0], [1800.0, 53.0], [1900.0, 43.0], [2000.0, 36.0], [2100.0, 59.0], [2200.0, 38.0], [2300.0, 46.0], [2400.0, 45.0], [2500.0, 61.0], [2600.0, 61.0], [2700.0, 73.0], [2800.0, 56.0], [2900.0, 64.0], [3000.0, 69.0], [3100.0, 64.0], [3200.0, 78.0], [3300.0, 66.0], [3400.0, 57.0], [3500.0, 62.0], [3700.0, 56.0], [3600.0, 69.0], [3800.0, 50.0], [3900.0, 51.0], [4000.0, 64.0], [4100.0, 62.0], [4300.0, 65.0], [4200.0, 40.0], [4500.0, 65.0], [4600.0, 55.0], [4400.0, 58.0], [4800.0, 69.0], [4700.0, 64.0], [5000.0, 66.0], [5100.0, 52.0], [4900.0, 71.0], [5200.0, 66.0], [5300.0, 44.0], [5500.0, 51.0], [5400.0, 44.0], [5600.0, 38.0], [5800.0, 25.0], [5700.0, 24.0], [6000.0, 25.0], [5900.0, 31.0], [6100.0, 13.0], [6200.0, 14.0], [6300.0, 17.0], [6400.0, 10.0], [6500.0, 8.0], [6600.0, 5.0], [6700.0, 5.0], [6800.0, 4.0], [6900.0, 3.0], [7100.0, 1.0], [7000.0, 1.0], [7200.0, 3.0], [7400.0, 2.0], [7300.0, 2.0], [7600.0, 1.0], [7700.0, 2.0], [7900.0, 2.0], [100.0, 76.0], [200.0, 49.0], [300.0, 8.0], [400.0, 8.0], [500.0, 16.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 142.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2523.0, "series": [{"data": [[1.0, 335.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 142.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2523.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 637.5763333333314, "minX": 1.54961856E12, "maxY": 637.5763333333314, "series": [{"data": [[1.54961856E12, 637.5763333333314]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 172.0, "minX": 1.0, "maxY": 7927.0, "series": [{"data": [[2.0, 5055.0], [3.0, 5944.0], [4.0, 4952.0], [5.0, 5606.0], [6.0, 5480.0], [7.0, 5466.0], [8.0, 5077.0], [9.0, 5246.0], [10.0, 4886.0], [11.0, 5089.0], [13.0, 5288.0], [14.0, 4959.0], [15.0, 5279.0], [16.0, 4860.0], [17.0, 6007.0], [18.0, 4998.0], [19.0, 5819.0], [20.0, 5094.0], [22.0, 5163.0], [23.0, 5753.0], [25.0, 5033.0], [26.0, 5577.0], [28.0, 5471.0], [29.0, 5121.0], [30.0, 5363.0], [33.0, 677.2727272727273], [32.0, 3558.3333333333335], [35.0, 1155.1666666666667], [34.0, 809.8888888888889], [37.0, 1084.0], [36.0, 1270.2], [39.0, 601.5999999999999], [38.0, 777.3333333333334], [41.0, 1140.3333333333335], [40.0, 797.0], [43.0, 891.7142857142857], [42.0, 1039.8333333333335], [45.0, 512.8888888888889], [44.0, 212.16666666666666], [46.0, 1569.875], [47.0, 1069.5], [48.0, 859.0], [49.0, 1610.0], [50.0, 969.0], [51.0, 1831.3333333333333], [52.0, 172.0], [53.0, 5432.0], [55.0, 5610.0], [54.0, 4868.0], [56.0, 4959.0], [59.0, 5197.0], [58.0, 5787.5], [61.0, 5981.0], [60.0, 4880.0], [63.0, 5563.0], [62.0, 5671.0], [67.0, 5302.0], [66.0, 5746.0], [65.0, 4847.0], [64.0, 5838.0], [71.0, 5458.0], [70.0, 4764.0], [69.0, 4858.0], [68.0, 5431.0], [75.0, 5579.0], [74.0, 5548.0], [73.0, 5276.0], [72.0, 5564.0], [79.0, 5487.0], [77.0, 5465.0], [76.0, 5348.0], [83.0, 5272.0], [82.0, 5050.0], [81.0, 5663.0], [80.0, 5355.0], [87.0, 5622.0], [86.0, 5202.0], [85.0, 4729.0], [84.0, 5493.0], [91.0, 4871.0], [90.0, 4987.0], [89.0, 5375.0], [88.0, 5790.0], [95.0, 5687.0], [94.0, 5299.0], [93.0, 5948.0], [92.0, 5105.0], [99.0, 5760.0], [98.0, 5051.0], [97.0, 5452.0], [96.0, 5402.0], [103.0, 5850.0], [102.0, 5549.0], [101.0, 5095.0], [100.0, 4771.0], [107.0, 5690.0], [106.0, 5779.5], [104.0, 5558.0], [111.0, 6811.0], [110.0, 5636.0], [109.0, 5785.0], [108.0, 5554.0], [115.0, 5460.0], [114.0, 4740.0], [113.0, 5223.0], [112.0, 6148.0], [119.0, 5179.0], [118.0, 5847.0], [117.0, 5294.0], [116.0, 6022.0], [123.0, 5586.0], [122.0, 4755.0], [121.0, 5489.0], [120.0, 5094.0], [127.0, 5142.0], [126.0, 5300.0], [125.0, 5537.0], [124.0, 4736.0], [135.0, 5166.0], [134.0, 4802.0], [133.0, 5522.0], [132.0, 5275.0], [131.0, 5294.0], [130.0, 5407.0], [129.0, 4837.0], [128.0, 5335.0], [143.0, 4650.0], [142.0, 5028.0], [141.0, 5570.0], [140.0, 5605.0], [139.0, 6512.0], [138.0, 5162.0], [137.0, 5235.0], [136.0, 4997.0], [151.0, 5377.0], [150.0, 4783.0], [149.0, 4854.0], [148.0, 4968.0], [147.0, 5486.0], [146.0, 4619.0], [145.0, 5209.0], [144.0, 4956.0], [159.0, 4986.0], [158.0, 5209.0], [157.0, 5139.0], [156.0, 5281.0], [155.0, 5635.0], [154.0, 5390.0], [153.0, 4791.0], [152.0, 5389.0], [164.0, 2112.333333333333], [167.0, 2491.333333333333], [166.0, 4891.0], [165.0, 5070.0], [163.0, 5260.0], [162.0, 5103.0], [161.0, 4959.0], [160.0, 5479.0], [169.0, 2314.0], [170.0, 3503.0], [175.0, 2533.333333333333], [174.0, 4899.0], [173.0, 5262.0], [172.0, 5716.0], [171.0, 4580.0], [168.0, 5994.0], [178.0, 2415.6], [177.0, 644.0], [176.0, 2105.333333333333], [181.0, 2581.333333333333], [183.0, 5461.0], [182.0, 5381.0], [180.0, 5653.0], [179.0, 5033.0], [184.0, 2192.666666666667], [191.0, 4949.0], [190.0, 5657.0], [189.0, 4692.0], [188.0, 5082.0], [187.0, 5599.0], [186.0, 5162.0], [194.0, 3213.5], [199.0, 2138.6666666666665], [198.0, 821.5], [197.0, 4875.0], [196.0, 4854.0], [195.0, 5206.0], [193.0, 4519.0], [192.0, 5445.0], [200.0, 3445.0], [202.0, 2698.5], [205.0, 662.0], [207.0, 1887.6666666666667], [206.0, 5195.5], [204.0, 4915.0], [203.0, 4811.0], [201.0, 4638.0], [213.0, 2307.0], [214.0, 1850.75], [215.0, 1932.0], [212.0, 5676.0], [210.0, 5473.0], [209.0, 5462.0], [208.0, 5247.0], [219.0, 1711.25], [220.0, 2551.0], [221.0, 2843.5], [223.0, 1749.8], [222.0, 2048.5], [218.0, 5679.0], [217.0, 5558.0], [216.0, 4586.0], [224.0, 1902.75], [226.0, 2348.0], [225.0, 827.0], [227.0, 3301.75], [228.0, 2683.5], [229.0, 2682.5], [230.0, 3357.5], [231.0, 2449.0], [232.0, 2298.0], [234.0, 1097.0], [236.0, 1774.5], [238.0, 2429.25], [237.0, 2044.3333333333333], [235.0, 3984.3333333333335], [239.0, 3321.5], [233.0, 4935.0], [240.0, 919.0], [241.0, 2757.6], [242.0, 1956.2], [243.0, 1313.3333333333335], [244.0, 1474.625], [246.0, 1116.6], [245.0, 1646.2857142857142], [247.0, 2165.166666666667], [249.0, 2910.5], [250.0, 1506.3333333333335], [252.0, 2134.8], [251.0, 1578.857142857143], [253.0, 1536.0], [255.0, 5920.0], [254.0, 4380.0], [248.0, 4761.0], [259.0, 2855.0], [256.0, 2185.666666666667], [257.0, 2800.0], [258.0, 4938.0], [260.0, 2999.0], [261.0, 6978.0], [265.0, 2100.333333333333], [267.0, 2114.333333333333], [266.0, 7222.0], [264.0, 2279.0], [263.0, 1622.5], [262.0, 4419.0], [270.0, 2746.0], [271.0, 6294.0], [269.0, 864.4444444444445], [268.0, 1769.4], [287.0, 5536.0], [274.0, 3237.0], [278.0, 3108.0], [277.0, 5190.0], [276.0, 7097.0], [279.0, 5404.0], [273.0, 4733.0], [272.0, 4384.0], [283.0, 3308.0], [286.0, 4730.0], [285.0, 5935.0], [284.0, 4524.0], [275.0, 5141.0], [282.0, 5466.0], [281.0, 5126.0], [280.0, 4659.0], [301.0, 2455.0], [290.0, 2584.333333333333], [289.0, 2894.5], [292.0, 2196.0], [293.0, 2950.5], [295.0, 4660.0], [288.0, 5360.0], [294.0, 5934.0], [298.0, 3723.5], [299.0, 6641.0], [297.0, 3944.0], [296.0, 1003.0], [303.0, 5578.0], [302.0, 6041.0], [300.0, 3043.0], [291.0, 6554.0], [316.0, 2302.333333333333], [306.0, 3579.75], [307.0, 6738.0], [305.0, 618.0], [308.0, 2276.0], [309.0, 5076.0], [311.0, 4365.0], [304.0, 5889.0], [310.0, 6097.0], [315.0, 1446.5714285714287], [314.0, 5525.0], [313.0, 2684.5], [318.0, 4407.0], [317.0, 893.0], [319.0, 4917.0], [312.0, 5391.0], [333.0, 3069.5], [320.0, 2626.25], [324.0, 3340.5], [325.0, 6082.0], [327.0, 5387.0], [326.0, 5248.0], [328.0, 2844.5], [329.0, 3567.0], [332.0, 2118.333333333333], [323.0, 6078.0], [322.0, 5474.0], [321.0, 4387.0], [335.0, 2307.333333333333], [334.0, 4663.0], [331.0, 5156.0], [330.0, 5211.0], [351.0, 2926.0], [337.0, 3678.5], [338.0, 5190.0], [348.0, 6106.0], [339.0, 5028.0], [336.0, 3095.5], [343.0, 2373.666666666667], [342.0, 4838.0], [341.0, 4827.0], [340.0, 5456.0], [346.0, 1834.2], [347.0, 6692.0], [345.0, 2116.0], [344.0, 2579.0], [350.0, 7168.0], [349.0, 4636.0], [366.0, 1806.5], [358.0, 3412.5], [353.0, 2615.5], [355.0, 6051.0], [354.0, 5887.0], [359.0, 5016.0], [352.0, 5752.0], [357.0, 3828.6666666666665], [363.0, 3376.5], [367.0, 2674.5], [360.0, 5211.0], [365.0, 5561.0], [364.0, 4247.0], [362.0, 4724.5], [380.0, 2999.666666666667], [369.0, 2424.25], [371.0, 5422.0], [370.0, 4476.0], [368.0, 2755.666666666667], [375.0, 3143.5], [374.0, 4365.0], [373.0, 4922.0], [372.0, 5230.0], [377.0, 2481.666666666667], [378.0, 2751.333333333333], [379.0, 5707.0], [381.0, 3820.5], [383.0, 2356.666666666667], [376.0, 6370.0], [382.0, 5906.0], [397.0, 2436.0], [384.0, 2165.6], [386.0, 5626.0], [385.0, 5196.0], [396.0, 4867.0], [387.0, 6412.0], [389.0, 2569.0], [388.0, 4645.0], [390.0, 4018.0], [391.0, 2198.75], [393.0, 2374.0], [392.0, 2736.5], [394.0, 3497.0], [395.0, 5905.0], [398.0, 2532.666666666667], [399.0, 2782.666666666667], [407.0, 3724.0], [405.0, 2078.2], [406.0, 2547.75], [404.0, 3364.5], [408.0, 3417.666666666667], [410.0, 3858.5], [409.0, 4281.0], [412.0, 1460.5], [403.0, 4371.0], [402.0, 4274.0], [401.0, 4354.0], [400.0, 5519.0], [414.0, 2256.666666666667], [413.0, 3405.0], [415.0, 2793.0], [411.0, 2998.0], [431.0, 4095.0], [416.0, 1321.5], [423.0, 5988.0], [422.0, 5120.0], [421.0, 4567.0], [420.0, 5074.0], [418.0, 4330.0], [424.0, 3202.0], [426.0, 2642.4], [427.0, 5435.0], [425.0, 3163.666666666667], [430.0, 5194.0], [429.0, 5211.0], [428.0, 4080.0], [419.0, 6744.0], [444.0, 3969.5], [433.0, 2818.75], [434.0, 3782.0], [435.0, 4823.0], [432.0, 2478.0], [440.0, 2684.5], [439.0, 2235.75], [438.0, 5871.0], [437.0, 5955.0], [436.0, 3927.0], [442.0, 2558.333333333333], [443.0, 3322.333333333333], [441.0, 2362.0], [445.0, 3775.5], [447.0, 6106.0], [446.0, 6810.0], [448.0, 3912.0], [452.0, 2397.6], [451.0, 2475.25], [460.0, 2021.75], [461.0, 3264.0], [463.0, 4864.666666666667], [456.0, 5269.0], [450.0, 2432.2], [449.0, 3649.0], [455.0, 2219.25], [454.0, 2684.0], [453.0, 3979.0], [458.0, 2422.8], [459.0, 3468.666666666667], [457.0, 3018.0], [476.0, 2879.5], [469.0, 3808.0], [468.0, 4469.0], [472.0, 2381.25], [471.0, 3592.0], [467.0, 5372.0], [466.0, 5903.0], [465.0, 6716.0], [464.0, 5003.0], [470.0, 5722.0], [474.0, 3140.5], [473.0, 3483.333333333333], [475.0, 4153.0], [477.0, 2856.333333333333], [479.0, 2794.0], [478.0, 4616.0], [492.0, 3522.0], [488.0, 2933.5], [487.0, 3516.5], [480.0, 3632.0], [483.0, 5395.5], [481.0, 3631.0], [486.0, 5317.0], [485.0, 4890.0], [484.0, 5097.0], [489.0, 2648.6], [490.0, 2857.0], [491.0, 3347.0], [494.0, 3345.0], [495.0, 5767.0], [493.0, 5158.0], [509.0, 2776.333333333333], [501.0, 2589.0], [500.0, 2626.333333333333], [508.0, 3622.666666666667], [499.0, 4976.0], [498.0, 6380.0], [497.0, 4974.0], [503.0, 4652.0], [502.0, 5122.0], [507.0, 3089.0], [511.0, 2732.0], [510.0, 4966.0], [506.0, 4755.0], [505.0, 5217.0], [519.0, 2608.75], [515.0, 2750.0], [513.0, 3622.5], [514.0, 4736.0], [527.0, 4586.0], [512.0, 4109.0], [525.0, 3388.666666666667], [524.0, 4848.0], [526.0, 3163.3333333333335], [516.0, 3373.5], [517.0, 3006.3333333333335], [520.0, 2336.285714285714], [529.0, 2368.0], [528.0, 2769.0], [536.0, 2050.0], [537.0, 3073.3333333333335], [539.0, 3286.5], [538.0, 6261.0], [540.0, 4767.0], [542.0, 2809.6666666666665], [543.0, 6194.0], [541.0, 2956.333333333333], [531.0, 2479.5384615384614], [533.0, 5097.0], [532.0, 5942.0], [535.0, 2217.5], [534.0, 4656.0], [530.0, 2375.875], [518.0, 2694.2], [521.0, 2412.0], [522.0, 2605.857142857143], [523.0, 2602.7272727272725], [551.0, 3197.5], [546.0, 3555.5], [544.0, 3430.0], [545.0, 5428.0], [559.0, 3307.0], [558.0, 2981.333333333333], [548.0, 2771.75], [549.0, 3111.0], [550.0, 5200.0], [547.0, 4227.5], [562.0, 3506.0], [566.0, 2975.0], [565.0, 7927.0], [564.0, 4424.0], [563.0, 6251.0], [567.0, 3498.5], [561.0, 2745.75], [575.0, 2986.75], [560.0, 5898.0], [573.0, 2195.0], [574.0, 2592.1428571428573], [572.0, 2007.1333333333332], [571.0, 2452.4285714285716], [569.0, 2293.3333333333335], [568.0, 4753.0], [570.0, 2527.5714285714284], [556.0, 2757.75], [557.0, 2412.9], [555.0, 3336.25], [554.0, 5415.0], [553.0, 6332.0], [552.0, 4681.0], [583.0, 3767.5], [579.0, 2771.0], [577.0, 2579.25], [576.0, 2595.0], [591.0, 5427.0], [586.0, 3060.0], [588.0, 4988.0], [587.0, 5248.0], [589.0, 2817.0], [578.0, 2269.9999999999995], [580.0, 2934.5], [582.0, 3465.5], [581.0, 3444.5], [584.0, 3336.0], [585.0, 3135.333333333333], [594.0, 2665.333333333333], [593.0, 5106.0], [592.0, 4490.0], [607.0, 3637.333333333333], [606.0, 2197.0], [605.0, 4278.0], [603.0, 2908.0], [602.0, 4977.0], [601.0, 5064.0], [600.0, 5384.0], [604.0, 2855.0], [595.0, 2730.4], [596.0, 2813.8333333333335], [597.0, 2569.9090909090914], [598.0, 2579.777777777778], [599.0, 3806.5], [632.0, 2843.571428571429], [611.0, 3317.3333333333335], [608.0, 3748.5], [610.0, 6287.0], [609.0, 5245.0], [623.0, 3570.0], [614.0, 3959.333333333333], [615.0, 4311.0], [633.0, 2803.0], [634.0, 2671.333333333333], [636.0, 2690.4], [637.0, 3213.0], [638.0, 2964.75], [639.0, 2668.4], [635.0, 2413.8], [624.0, 2570.3], [626.0, 2861.4444444444443], [627.0, 2637.25], [629.0, 3890.5], [628.0, 4660.0], [631.0, 2953.8333333333335], [630.0, 3452.5], [625.0, 2389.4], [613.0, 3306.6666666666665], [612.0, 2924.3333333333335], [617.0, 2838.7999999999997], [618.0, 2543.0], [616.0, 2232.0], [620.0, 3552.3333333333335], [619.0, 4156.0], [621.0, 5956.0], [622.0, 4800.5], [668.0, 4395.0], [644.0, 2892.0], [640.0, 2941.0], [641.0, 5788.0], [655.0, 4567.0], [654.0, 4311.0], [653.0, 4717.0], [652.0, 5117.0], [651.0, 5670.0], [650.0, 7467.0], [649.0, 6309.0], [648.0, 7704.0], [642.0, 2506.6666666666665], [643.0, 3152.0], [671.0, 5063.0], [656.0, 4834.0], [658.0, 4936.0], [657.0, 4010.0], [661.0, 4337.5], [659.0, 4526.0], [663.0, 4419.0], [662.0, 5285.0], [670.0, 5586.0], [669.0, 4689.0], [667.0, 4794.0], [666.0, 5544.0], [665.0, 4388.0], [664.0, 4468.0], [647.0, 6524.0], [646.0, 4793.0], [645.0, 5065.0], [700.0, 4971.0], [703.0, 5225.0], [689.0, 6067.0], [688.0, 4789.0], [691.0, 4452.0], [690.0, 4037.0], [693.0, 7387.0], [692.0, 5077.0], [702.0, 4960.0], [701.0, 4554.0], [699.0, 5474.0], [698.0, 6639.0], [697.0, 5168.0], [696.0, 4426.0], [687.0, 5192.0], [673.0, 4413.0], [672.0, 5388.0], [675.0, 5252.0], [674.0, 4187.0], [677.0, 4440.0], [676.0, 4934.0], [679.0, 5415.0], [678.0, 5990.0], [686.0, 5244.0], [685.0, 4557.0], [684.0, 5239.0], [683.0, 5318.0], [682.0, 5473.0], [681.0, 5290.0], [680.0, 5765.0], [695.0, 7439.0], [694.0, 6095.0], [732.0, 4122.0], [735.0, 4799.0], [720.0, 4071.0], [722.0, 5044.0], [721.0, 5170.0], [724.0, 4539.0], [723.0, 4877.0], [734.0, 5477.0], [733.0, 5381.0], [731.0, 5100.0], [730.0, 4767.0], [729.0, 3700.0], [728.0, 4555.0], [719.0, 3726.0], [704.0, 4740.0], [706.0, 5008.0], [705.0, 4062.0], [708.0, 5112.0], [707.0, 4468.0], [711.0, 4391.0], [710.0, 5720.5], [718.0, 4490.0], [717.0, 5249.0], [716.0, 5426.0], [715.0, 4898.0], [714.0, 4352.0], [713.0, 4837.0], [712.0, 4925.0], [727.0, 4421.5], [726.0, 3938.0], [764.0, 5258.0], [767.0, 4815.0], [753.0, 4800.0], [752.0, 4573.0], [755.0, 3934.0], [754.0, 5015.0], [757.0, 4399.0], [756.0, 4516.0], [766.0, 4445.0], [765.0, 5316.0], [763.0, 4762.0], [762.0, 4275.0], [761.0, 3979.0], [760.0, 4133.0], [751.0, 4653.0], [737.0, 4989.0], [736.0, 4913.0], [739.0, 6378.0], [738.0, 4148.0], [741.0, 4858.0], [740.0, 7282.0], [743.0, 6151.0], [742.0, 5567.0], [750.0, 4177.0], [749.0, 4226.0], [748.0, 5176.0], [747.0, 3755.0], [746.0, 4051.0], [745.0, 4778.0], [744.0, 4837.0], [759.0, 5334.0], [758.0, 4130.0], [796.0, 3039.3333333333335], [799.0, 3019.6666666666665], [785.0, 2998.5], [784.0, 3030.166666666667], [787.0, 3359.8], [786.0, 3096.285714285714], [789.0, 3214.1428571428573], [788.0, 3191.4], [798.0, 3023.3], [797.0, 3042.9], [795.0, 3002.8333333333335], [794.0, 3103.2], [793.0, 3424.75], [792.0, 2992.4285714285716], [783.0, 3714.0], [768.0, 4327.0], [770.0, 4975.0], [769.0, 5119.0], [773.0, 4033.75], [771.0, 4361.0], [775.0, 3321.3333333333335], [774.0, 2763.714285714286], [782.0, 3049.1428571428573], [781.0, 2895.0], [780.0, 3296.75], [779.0, 3096.285714285714], [778.0, 2870.75], [777.0, 3277.0], [776.0, 2795.375], [791.0, 3196.714285714286], [790.0, 2664.6666666666665], [825.0, 3766.666666666667], [803.0, 4226.5], [801.0, 3387.6666666666665], [800.0, 3207.666666666667], [811.0, 2816.0], [812.0, 4110.5], [814.0, 5438.0], [813.0, 5037.0], [815.0, 3613.0], [802.0, 3206.714285714286], [804.0, 3243.3333333333335], [805.0, 3448.5], [810.0, 3009.166666666667], [808.0, 3305.0], [809.0, 3637.0], [807.0, 2583.0], [824.0, 3311.0], [826.0, 3865.0], [827.0, 3608.0], [828.0, 3682.6666666666665], [829.0, 3143.5], [831.0, 3921.75], [830.0, 3619.75], [816.0, 4338.0], [818.0, 3101.166666666667], [820.0, 3665.0], [819.0, 3907.0], [821.0, 3387.6666666666665], [822.0, 2961.2], [823.0, 3479.375], [817.0, 4031.5], [806.0, 3705.6666666666665], [857.0, 4143.5], [832.0, 3284.2], [835.0, 2737.0], [834.0, 5402.0], [833.0, 4907.0], [836.0, 4619.5], [838.0, 3871.0], [837.0, 4734.0], [840.0, 3801.0], [842.0, 5700.0], [841.0, 3943.0], [839.0, 4592.0], [843.0, 3180.0], [845.0, 4310.666666666667], [844.0, 3772.5], [847.0, 3083.25], [846.0, 4879.0], [848.0, 2989.833333333333], [862.0, 4510.5], [861.0, 4656.0], [860.0, 4608.0], [859.0, 4061.0], [858.0, 4777.0], [863.0, 3616.5], [856.0, 3479.4], [849.0, 3390.714285714286], [851.0, 3237.625], [855.0, 3377.0], [854.0, 3340.125], [853.0, 2983.25], [852.0, 3244.857142857143], [850.0, 2986.6], [871.0, 3518.6], [865.0, 3548.0], [864.0, 2897.5], [876.0, 3524.3333333333335], [878.0, 3932.0], [877.0, 3196.3333333333335], [879.0, 4076.5], [868.0, 3526.3333333333335], [866.0, 4509.0], [869.0, 3535.3333333333335], [870.0, 3499.230769230769], [885.0, 2972.285714285714], [886.0, 3873.0], [887.0, 3578.75], [884.0, 3739.6666666666665], [882.0, 3649.0], [890.0, 4188.0], [891.0, 4134.0], [893.0, 2549.0], [892.0, 4538.0], [895.0, 4198.0], [881.0, 4313.0], [880.0, 6592.0], [894.0, 5427.0], [889.0, 3274.6], [888.0, 3693.2], [883.0, 3985.0], [875.0, 3304.6], [874.0, 3515.125], [873.0, 3036.0], [872.0, 4819.0], [903.0, 3289.8571428571427], [898.0, 3334.3333333333335], [897.0, 3449.5], [911.0, 4005.3333333333335], [896.0, 5117.0], [909.0, 3422.0], [910.0, 3551.0], [899.0, 4071.3333333333335], [900.0, 3969.0], [901.0, 3674.25], [902.0, 3492.2], [905.0, 3331.3333333333335], [913.0, 3858.3333333333335], [912.0, 6361.0], [926.0, 3549.2], [927.0, 3913.5], [923.0, 3405.5], [924.0, 3500.25], [925.0, 3503.2], [920.0, 4080.0], [921.0, 4323.0], [922.0, 4099.333333333333], [914.0, 4600.5], [917.0, 3521.3333333333335], [916.0, 5010.0], [915.0, 4177.0], [919.0, 3430.75], [918.0, 3371.875], [904.0, 4000.5], [906.0, 3413.6666666666665], [907.0, 3899.333333333333], [908.0, 4553.5], [952.0, 3760.25], [932.0, 2982.4285714285716], [930.0, 3847.6], [928.0, 3573.0], [929.0, 6237.0], [943.0, 3939.0], [942.0, 3599.0], [941.0, 6012.0], [940.0, 4750.0], [939.0, 6268.0], [933.0, 3805.4], [931.0, 3741.5], [934.0, 3555.0], [935.0, 3537.0], [953.0, 3466.25], [954.0, 3330.0], [955.0, 3630.333333333333], [956.0, 3543.75], [958.0, 3916.4], [959.0, 4220.0], [944.0, 5928.0], [945.0, 3966.5], [946.0, 4044.0], [947.0, 2621.0], [948.0, 4125.25], [949.0, 4509.5], [951.0, 4878.0], [950.0, 4027.0], [936.0, 3948.0], [937.0, 5462.0], [938.0, 3953.5], [963.0, 3921.5], [972.0, 3412.75], [962.0, 3538.6666666666665], [961.0, 5191.0], [960.0, 4374.0], [975.0, 4117.5], [974.0, 3972.0], [973.0, 3531.5], [964.0, 4046.125], [966.0, 3141.75], [984.0, 3536.0], [978.0, 3871.6], [977.0, 4371.0], [976.0, 5833.0], [990.0, 3499.8461538461534], [991.0, 3487.2], [987.0, 3555.0], [986.0, 4690.0], [988.0, 3848.75], [989.0, 3756.8571428571427], [985.0, 3982.5], [979.0, 3734.2], [981.0, 3149.666666666666], [982.0, 3248.2], [983.0, 4450.0], [980.0, 2998.5], [965.0, 3996.6666666666665], [970.0, 3568.0], [969.0, 3738.4], [968.0, 4598.5], [971.0, 3863.375], [999.0, 3837.0], [995.0, 3597.0], [993.0, 3859.2], [992.0, 4177.333333333333], [1007.0, 3679.6], [1005.0, 3400.5], [1006.0, 3902.8], [994.0, 3903.25], [996.0, 3547.714285714286], [998.0, 3449.2], [997.0, 3835.4], [1009.0, 4123.571428571428], [1008.0, 3815.0], [1023.0, 4663.0], [1022.0, 4314.0], [1021.0, 3679.0], [1020.0, 4258.75], [1019.0, 4277.666666666667], [1016.0, 3419.5], [1017.0, 4365.0], [1018.0, 3645.0], [1010.0, 3331.6], [1011.0, 3818.0], [1013.0, 4518.5], [1015.0, 3862.0], [1014.0, 4445.0], [1012.0, 3470.6666666666665], [1002.0, 3597.0], [1001.0, 5381.0], [1000.0, 3298.0], [1003.0, 3616.5], [1004.0, 3982.0], [1030.0, 3655.2], [1038.0, 3797.75], [1024.0, 3882.0], [1054.0, 4528.0], [1048.0, 4109.0], [1050.0, 3828.0], [1052.0, 4127.0], [1040.0, 3723.5], [1042.0, 3596.0], [1044.0, 3625.5], [1046.0, 3646.6], [1026.0, 4091.3333333333335], [1028.0, 3440.428571428571], [1034.0, 4067.0], [1072.0, 4248.0], [1076.0, 3916.0], [1078.0, 3402.0], [1080.0, 3226.8], [1084.0, 3649.8571428571427], [1086.0, 4461.0], [1082.0, 3886.1428571428573], [1074.0, 3558.0], [1058.0, 3955.5], [1060.0, 3089.75], [1062.0, 4007.0], [1066.0, 4378.0], [1064.0, 4327.0], [1068.0, 4047.0], [1070.0, 3370.0], [1056.0, 3808.3333333333335], [1036.0, 3547.0], [1032.0, 3572.5], [1092.0, 4726.5], [1114.0, 3633.0], [1090.0, 3738.5], [1088.0, 4525.5], [1116.0, 4387.0], [1118.0, 3488.4], [1112.0, 4273.0], [1110.0, 3531.25], [1108.0, 4004.6], [1104.0, 3693.0], [1106.0, 3501.5], [1094.0, 3981.0], [1096.0, 4701.5], [1098.0, 3590.0], [1100.0, 3391.0], [1136.0, 3713.0], [1138.0, 3689.0], [1120.0, 3713.5555555555557], [1122.0, 4080.6666666666665], [1124.0, 3796.3333333333335], [1126.0, 4231.8], [1130.0, 4208.0], [1132.0, 4873.0], [1134.0, 3864.6666666666665], [1128.0, 3928.875], [1102.0, 4065.5], [1029.0, 3465.3333333333335], [1025.0, 3662.0], [1055.0, 3765.5], [1053.0, 3027.5], [1047.0, 3517.0], [1049.0, 3664.0], [1051.0, 3518.5], [1041.0, 4191.0], [1043.0, 3244.0], [1045.0, 3425.4], [1031.0, 3587.428571428571], [1027.0, 3360.5], [1033.0, 4251.0], [1037.0, 4080.0], [1039.0, 3914.0000000000005], [1073.0, 3489.0], [1075.0, 3449.6666666666665], [1077.0, 4395.0], [1081.0, 3721.769230769231], [1083.0, 3029.5], [1087.0, 3934.5], [1085.0, 3507.5], [1079.0, 4360.5], [1057.0, 3595.6666666666665], [1059.0, 3853.75], [1067.0, 4574.5], [1065.0, 3932.0], [1063.0, 5276.0], [1069.0, 3576.0], [1071.0, 4194.0], [1061.0, 3277.0], [1035.0, 3449.1666666666665], [1093.0, 3191.0], [1091.0, 4010.6], [1089.0, 3856.6], [1119.0, 4408.5], [1115.0, 3738.8888888888887], [1117.0, 3980.0], [1113.0, 3785.0], [1111.0, 3696.0], [1109.0, 3996.5], [1105.0, 5053.0], [1107.0, 3699.6666666666665], [1095.0, 3881.25], [1097.0, 5130.0], [1099.0, 4726.0], [1101.0, 3631.5], [1103.0, 3569.5], [1137.0, 4039.5], [1139.0, 3573.0], [1121.0, 4046.5714285714284], [1123.0, 4025.0], [1125.0, 3786.833333333333], [1127.0, 3812.428571428571], [1129.0, 4090.25], [1131.0, 4740.0], [1133.0, 3939.0], [1135.0, 4346.0], [1.0, 5348.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[637.5759999999999, 3386.3903333333355]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1139.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12700.0, "minX": 1.54961856E12, "maxY": 21046.466666666667, "series": [{"data": [[1.54961856E12, 21046.466666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961856E12, 12700.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3386.3903333333355, "minX": 1.54961856E12, "maxY": 3386.3903333333355, "series": [{"data": [[1.54961856E12, 3386.3903333333355]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961856E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3386.3836666666607, "minX": 1.54961856E12, "maxY": 3386.3836666666607, "series": [{"data": [[1.54961856E12, 3386.3836666666607]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961856E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 58.875666666666774, "minX": 1.54961856E12, "maxY": 58.875666666666774, "series": [{"data": [[1.54961856E12, 58.875666666666774]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961856E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 95.0, "minX": 1.54961856E12, "maxY": 7933.0, "series": [{"data": [[1.54961856E12, 7933.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961856E12, 95.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961856E12, 5471.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961856E12, 6620.859999999997]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961856E12, 5898.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3439.0, "minX": 50.0, "maxY": 3439.0, "series": [{"data": [[50.0, 3439.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3439.0, "minX": 50.0, "maxY": 3439.0, "series": [{"data": [[50.0, 3439.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961856E12, "maxY": 50.0, "series": [{"data": [[1.54961856E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961856E12, "maxY": 50.0, "series": [{"data": [[1.54961856E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961856E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961856E12, "maxY": 50.0, "series": [{"data": [[1.54961856E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961856E12, "title": "Transactions Per Second"}},
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
