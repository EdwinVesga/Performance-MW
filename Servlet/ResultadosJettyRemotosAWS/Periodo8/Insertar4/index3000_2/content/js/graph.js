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
        data: {"result": {"minY": 167.0, "minX": 0.0, "maxY": 10334.0, "series": [{"data": [[0.0, 167.0], [0.1, 213.0], [0.2, 230.0], [0.3, 245.0], [0.4, 252.0], [0.5, 258.0], [0.6, 260.0], [0.7, 268.0], [0.8, 270.0], [0.9, 271.0], [1.0, 279.0], [1.1, 285.0], [1.2, 285.0], [1.3, 291.0], [1.4, 295.0], [1.5, 300.0], [1.6, 311.0], [1.7, 316.0], [1.8, 321.0], [1.9, 323.0], [2.0, 325.0], [2.1, 327.0], [2.2, 332.0], [2.3, 334.0], [2.4, 343.0], [2.5, 346.0], [2.6, 347.0], [2.7, 350.0], [2.8, 357.0], [2.9, 359.0], [3.0, 363.0], [3.1, 364.0], [3.2, 372.0], [3.3, 373.0], [3.4, 375.0], [3.5, 379.0], [3.6, 392.0], [3.7, 397.0], [3.8, 397.0], [3.9, 405.0], [4.0, 411.0], [4.1, 416.0], [4.2, 418.0], [4.3, 431.0], [4.4, 438.0], [4.5, 446.0], [4.6, 454.0], [4.7, 470.0], [4.8, 476.0], [4.9, 480.0], [5.0, 486.0], [5.1, 492.0], [5.2, 499.0], [5.3, 509.0], [5.4, 511.0], [5.5, 544.0], [5.6, 549.0], [5.7, 562.0], [5.8, 570.0], [5.9, 575.0], [6.0, 580.0], [6.1, 582.0], [6.2, 591.0], [6.3, 609.0], [6.4, 618.0], [6.5, 625.0], [6.6, 631.0], [6.7, 635.0], [6.8, 641.0], [6.9, 656.0], [7.0, 657.0], [7.1, 673.0], [7.2, 682.0], [7.3, 688.0], [7.4, 693.0], [7.5, 704.0], [7.6, 712.0], [7.7, 716.0], [7.8, 727.0], [7.9, 735.0], [8.0, 748.0], [8.1, 757.0], [8.2, 765.0], [8.3, 780.0], [8.4, 785.0], [8.5, 805.0], [8.6, 811.0], [8.7, 826.0], [8.8, 835.0], [8.9, 854.0], [9.0, 864.0], [9.1, 876.0], [9.2, 878.0], [9.3, 888.0], [9.4, 904.0], [9.5, 927.0], [9.6, 939.0], [9.7, 946.0], [9.8, 954.0], [9.9, 958.0], [10.0, 969.0], [10.1, 982.0], [10.2, 992.0], [10.3, 1005.0], [10.4, 1020.0], [10.5, 1045.0], [10.6, 1066.0], [10.7, 1072.0], [10.8, 1079.0], [10.9, 1092.0], [11.0, 1094.0], [11.1, 1105.0], [11.2, 1112.0], [11.3, 1125.0], [11.4, 1139.0], [11.5, 1145.0], [11.6, 1147.0], [11.7, 1168.0], [11.8, 1178.0], [11.9, 1186.0], [12.0, 1197.0], [12.1, 1204.0], [12.2, 1216.0], [12.3, 1239.0], [12.4, 1255.0], [12.5, 1267.0], [12.6, 1287.0], [12.7, 1301.0], [12.8, 1310.0], [12.9, 1326.0], [13.0, 1350.0], [13.1, 1360.0], [13.2, 1366.0], [13.3, 1370.0], [13.4, 1379.0], [13.5, 1384.0], [13.6, 1393.0], [13.7, 1413.0], [13.8, 1423.0], [13.9, 1438.0], [14.0, 1454.0], [14.1, 1464.0], [14.2, 1480.0], [14.3, 1490.0], [14.4, 1501.0], [14.5, 1504.0], [14.6, 1508.0], [14.7, 1512.0], [14.8, 1527.0], [14.9, 1534.0], [15.0, 1552.0], [15.1, 1556.0], [15.2, 1560.0], [15.3, 1565.0], [15.4, 1574.0], [15.5, 1585.0], [15.6, 1594.0], [15.7, 1603.0], [15.8, 1610.0], [15.9, 1613.0], [16.0, 1624.0], [16.1, 1635.0], [16.2, 1646.0], [16.3, 1657.0], [16.4, 1662.0], [16.5, 1673.0], [16.6, 1686.0], [16.7, 1693.0], [16.8, 1707.0], [16.9, 1716.0], [17.0, 1731.0], [17.1, 1741.0], [17.2, 1742.0], [17.3, 1747.0], [17.4, 1759.0], [17.5, 1764.0], [17.6, 1768.0], [17.7, 1773.0], [17.8, 1789.0], [17.9, 1805.0], [18.0, 1819.0], [18.1, 1827.0], [18.2, 1830.0], [18.3, 1839.0], [18.4, 1844.0], [18.5, 1846.0], [18.6, 1853.0], [18.7, 1856.0], [18.8, 1868.0], [18.9, 1871.0], [19.0, 1874.0], [19.1, 1877.0], [19.2, 1891.0], [19.3, 1905.0], [19.4, 1907.0], [19.5, 1916.0], [19.6, 1928.0], [19.7, 1943.0], [19.8, 1945.0], [19.9, 1952.0], [20.0, 1960.0], [20.1, 1974.0], [20.2, 1983.0], [20.3, 1988.0], [20.4, 1997.0], [20.5, 2000.0], [20.6, 2007.0], [20.7, 2009.0], [20.8, 2017.0], [20.9, 2028.0], [21.0, 2036.0], [21.1, 2065.0], [21.2, 2083.0], [21.3, 2100.0], [21.4, 2108.0], [21.5, 2117.0], [21.6, 2127.0], [21.7, 2135.0], [21.8, 2158.0], [21.9, 2161.0], [22.0, 2173.0], [22.1, 2189.0], [22.2, 2195.0], [22.3, 2201.0], [22.4, 2212.0], [22.5, 2219.0], [22.6, 2235.0], [22.7, 2239.0], [22.8, 2251.0], [22.9, 2253.0], [23.0, 2257.0], [23.1, 2260.0], [23.2, 2264.0], [23.3, 2273.0], [23.4, 2281.0], [23.5, 2289.0], [23.6, 2301.0], [23.7, 2305.0], [23.8, 2313.0], [23.9, 2317.0], [24.0, 2321.0], [24.1, 2337.0], [24.2, 2341.0], [24.3, 2342.0], [24.4, 2353.0], [24.5, 2368.0], [24.6, 2380.0], [24.7, 2419.0], [24.8, 2425.0], [24.9, 2442.0], [25.0, 2449.0], [25.1, 2469.0], [25.2, 2475.0], [25.3, 2478.0], [25.4, 2487.0], [25.5, 2500.0], [25.6, 2512.0], [25.7, 2524.0], [25.8, 2529.0], [25.9, 2538.0], [26.0, 2546.0], [26.1, 2555.0], [26.2, 2564.0], [26.3, 2581.0], [26.4, 2598.0], [26.5, 2604.0], [26.6, 2610.0], [26.7, 2615.0], [26.8, 2625.0], [26.9, 2632.0], [27.0, 2641.0], [27.1, 2655.0], [27.2, 2663.0], [27.3, 2671.0], [27.4, 2680.0], [27.5, 2692.0], [27.6, 2705.0], [27.7, 2717.0], [27.8, 2723.0], [27.9, 2729.0], [28.0, 2741.0], [28.1, 2747.0], [28.2, 2757.0], [28.3, 2760.0], [28.4, 2772.0], [28.5, 2783.0], [28.6, 2788.0], [28.7, 2796.0], [28.8, 2811.0], [28.9, 2817.0], [29.0, 2821.0], [29.1, 2830.0], [29.2, 2837.0], [29.3, 2841.0], [29.4, 2858.0], [29.5, 2866.0], [29.6, 2876.0], [29.7, 2886.0], [29.8, 2889.0], [29.9, 2894.0], [30.0, 2900.0], [30.1, 2908.0], [30.2, 2910.0], [30.3, 2919.0], [30.4, 2920.0], [30.5, 2925.0], [30.6, 2929.0], [30.7, 2933.0], [30.8, 2943.0], [30.9, 2947.0], [31.0, 2951.0], [31.1, 2958.0], [31.2, 2961.0], [31.3, 2965.0], [31.4, 2969.0], [31.5, 2975.0], [31.6, 2979.0], [31.7, 2981.0], [31.8, 2986.0], [31.9, 2988.0], [32.0, 2993.0], [32.1, 2998.0], [32.2, 3002.0], [32.3, 3007.0], [32.4, 3014.0], [32.5, 3016.0], [32.6, 3022.0], [32.7, 3028.0], [32.8, 3035.0], [32.9, 3049.0], [33.0, 3058.0], [33.1, 3066.0], [33.2, 3073.0], [33.3, 3075.0], [33.4, 3083.0], [33.5, 3087.0], [33.6, 3092.0], [33.7, 3097.0], [33.8, 3102.0], [33.9, 3109.0], [34.0, 3111.0], [34.1, 3119.0], [34.2, 3132.0], [34.3, 3137.0], [34.4, 3142.0], [34.5, 3145.0], [34.6, 3157.0], [34.7, 3159.0], [34.8, 3168.0], [34.9, 3170.0], [35.0, 3174.0], [35.1, 3179.0], [35.2, 3182.0], [35.3, 3187.0], [35.4, 3192.0], [35.5, 3199.0], [35.6, 3208.0], [35.7, 3212.0], [35.8, 3222.0], [35.9, 3229.0], [36.0, 3243.0], [36.1, 3249.0], [36.2, 3252.0], [36.3, 3253.0], [36.4, 3259.0], [36.5, 3261.0], [36.6, 3265.0], [36.7, 3278.0], [36.8, 3284.0], [36.9, 3291.0], [37.0, 3295.0], [37.1, 3303.0], [37.2, 3305.0], [37.3, 3314.0], [37.4, 3321.0], [37.5, 3330.0], [37.6, 3334.0], [37.7, 3342.0], [37.8, 3345.0], [37.9, 3353.0], [38.0, 3357.0], [38.1, 3360.0], [38.2, 3364.0], [38.3, 3366.0], [38.4, 3375.0], [38.5, 3379.0], [38.6, 3380.0], [38.7, 3384.0], [38.8, 3386.0], [38.9, 3389.0], [39.0, 3393.0], [39.1, 3397.0], [39.2, 3400.0], [39.3, 3401.0], [39.4, 3407.0], [39.5, 3414.0], [39.6, 3419.0], [39.7, 3424.0], [39.8, 3433.0], [39.9, 3438.0], [40.0, 3441.0], [40.1, 3443.0], [40.2, 3449.0], [40.3, 3460.0], [40.4, 3468.0], [40.5, 3470.0], [40.6, 3480.0], [40.7, 3486.0], [40.8, 3492.0], [40.9, 3496.0], [41.0, 3497.0], [41.1, 3503.0], [41.2, 3506.0], [41.3, 3517.0], [41.4, 3524.0], [41.5, 3526.0], [41.6, 3528.0], [41.7, 3532.0], [41.8, 3539.0], [41.9, 3544.0], [42.0, 3548.0], [42.1, 3555.0], [42.2, 3562.0], [42.3, 3565.0], [42.4, 3579.0], [42.5, 3580.0], [42.6, 3584.0], [42.7, 3591.0], [42.8, 3594.0], [42.9, 3600.0], [43.0, 3605.0], [43.1, 3609.0], [43.2, 3612.0], [43.3, 3616.0], [43.4, 3623.0], [43.5, 3632.0], [43.6, 3634.0], [43.7, 3640.0], [43.8, 3643.0], [43.9, 3656.0], [44.0, 3661.0], [44.1, 3664.0], [44.2, 3665.0], [44.3, 3668.0], [44.4, 3675.0], [44.5, 3682.0], [44.6, 3691.0], [44.7, 3693.0], [44.8, 3703.0], [44.9, 3706.0], [45.0, 3708.0], [45.1, 3715.0], [45.2, 3716.0], [45.3, 3720.0], [45.4, 3726.0], [45.5, 3729.0], [45.6, 3738.0], [45.7, 3745.0], [45.8, 3750.0], [45.9, 3753.0], [46.0, 3760.0], [46.1, 3766.0], [46.2, 3768.0], [46.3, 3775.0], [46.4, 3777.0], [46.5, 3785.0], [46.6, 3787.0], [46.7, 3792.0], [46.8, 3799.0], [46.9, 3803.0], [47.0, 3808.0], [47.1, 3812.0], [47.2, 3813.0], [47.3, 3820.0], [47.4, 3824.0], [47.5, 3834.0], [47.6, 3845.0], [47.7, 3848.0], [47.8, 3854.0], [47.9, 3860.0], [48.0, 3866.0], [48.1, 3867.0], [48.2, 3876.0], [48.3, 3884.0], [48.4, 3894.0], [48.5, 3897.0], [48.6, 3905.0], [48.7, 3912.0], [48.8, 3919.0], [48.9, 3923.0], [49.0, 3932.0], [49.1, 3937.0], [49.2, 3941.0], [49.3, 3944.0], [49.4, 3946.0], [49.5, 3954.0], [49.6, 3960.0], [49.7, 3978.0], [49.8, 3981.0], [49.9, 3984.0], [50.0, 3988.0], [50.1, 3997.0], [50.2, 4013.0], [50.3, 4016.0], [50.4, 4021.0], [50.5, 4022.0], [50.6, 4035.0], [50.7, 4042.0], [50.8, 4055.0], [50.9, 4057.0], [51.0, 4066.0], [51.1, 4067.0], [51.2, 4069.0], [51.3, 4078.0], [51.4, 4080.0], [51.5, 4088.0], [51.6, 4093.0], [51.7, 4096.0], [51.8, 4100.0], [51.9, 4103.0], [52.0, 4110.0], [52.1, 4116.0], [52.2, 4124.0], [52.3, 4136.0], [52.4, 4150.0], [52.5, 4160.0], [52.6, 4167.0], [52.7, 4175.0], [52.8, 4183.0], [52.9, 4188.0], [53.0, 4196.0], [53.1, 4210.0], [53.2, 4213.0], [53.3, 4223.0], [53.4, 4227.0], [53.5, 4239.0], [53.6, 4245.0], [53.7, 4254.0], [53.8, 4258.0], [53.9, 4258.0], [54.0, 4265.0], [54.1, 4274.0], [54.2, 4276.0], [54.3, 4291.0], [54.4, 4298.0], [54.5, 4307.0], [54.6, 4309.0], [54.7, 4314.0], [54.8, 4318.0], [54.9, 4321.0], [55.0, 4329.0], [55.1, 4338.0], [55.2, 4346.0], [55.3, 4355.0], [55.4, 4367.0], [55.5, 4374.0], [55.6, 4378.0], [55.7, 4388.0], [55.8, 4392.0], [55.9, 4399.0], [56.0, 4401.0], [56.1, 4414.0], [56.2, 4417.0], [56.3, 4420.0], [56.4, 4425.0], [56.5, 4444.0], [56.6, 4449.0], [56.7, 4457.0], [56.8, 4464.0], [56.9, 4469.0], [57.0, 4482.0], [57.1, 4484.0], [57.2, 4488.0], [57.3, 4495.0], [57.4, 4504.0], [57.5, 4516.0], [57.6, 4519.0], [57.7, 4525.0], [57.8, 4526.0], [57.9, 4535.0], [58.0, 4539.0], [58.1, 4546.0], [58.2, 4558.0], [58.3, 4560.0], [58.4, 4568.0], [58.5, 4572.0], [58.6, 4574.0], [58.7, 4576.0], [58.8, 4588.0], [58.9, 4594.0], [59.0, 4605.0], [59.1, 4614.0], [59.2, 4623.0], [59.3, 4624.0], [59.4, 4633.0], [59.5, 4638.0], [59.6, 4641.0], [59.7, 4651.0], [59.8, 4657.0], [59.9, 4671.0], [60.0, 4680.0], [60.1, 4692.0], [60.2, 4706.0], [60.3, 4709.0], [60.4, 4713.0], [60.5, 4724.0], [60.6, 4728.0], [60.7, 4736.0], [60.8, 4747.0], [60.9, 4760.0], [61.0, 4770.0], [61.1, 4785.0], [61.2, 4788.0], [61.3, 4797.0], [61.4, 4812.0], [61.5, 4816.0], [61.6, 4827.0], [61.7, 4838.0], [61.8, 4839.0], [61.9, 4841.0], [62.0, 4850.0], [62.1, 4856.0], [62.2, 4866.0], [62.3, 4870.0], [62.4, 4876.0], [62.5, 4891.0], [62.6, 4905.0], [62.7, 4921.0], [62.8, 4930.0], [62.9, 4938.0], [63.0, 4946.0], [63.1, 4953.0], [63.2, 4957.0], [63.3, 4959.0], [63.4, 4966.0], [63.5, 4975.0], [63.6, 4988.0], [63.7, 4998.0], [63.8, 5003.0], [63.9, 5011.0], [64.0, 5015.0], [64.1, 5018.0], [64.2, 5032.0], [64.3, 5036.0], [64.4, 5061.0], [64.5, 5069.0], [64.6, 5085.0], [64.7, 5091.0], [64.8, 5099.0], [64.9, 5114.0], [65.0, 5117.0], [65.1, 5122.0], [65.2, 5135.0], [65.3, 5146.0], [65.4, 5152.0], [65.5, 5166.0], [65.6, 5178.0], [65.7, 5182.0], [65.8, 5189.0], [65.9, 5199.0], [66.0, 5214.0], [66.1, 5218.0], [66.2, 5222.0], [66.3, 5230.0], [66.4, 5233.0], [66.5, 5241.0], [66.6, 5246.0], [66.7, 5253.0], [66.8, 5264.0], [66.9, 5282.0], [67.0, 5285.0], [67.1, 5292.0], [67.2, 5302.0], [67.3, 5306.0], [67.4, 5314.0], [67.5, 5317.0], [67.6, 5329.0], [67.7, 5344.0], [67.8, 5373.0], [67.9, 5382.0], [68.0, 5391.0], [68.1, 5395.0], [68.2, 5413.0], [68.3, 5414.0], [68.4, 5424.0], [68.5, 5430.0], [68.6, 5434.0], [68.7, 5457.0], [68.8, 5471.0], [68.9, 5476.0], [69.0, 5500.0], [69.1, 5503.0], [69.2, 5510.0], [69.3, 5517.0], [69.4, 5523.0], [69.5, 5531.0], [69.6, 5535.0], [69.7, 5543.0], [69.8, 5549.0], [69.9, 5559.0], [70.0, 5570.0], [70.1, 5580.0], [70.2, 5586.0], [70.3, 5593.0], [70.4, 5603.0], [70.5, 5606.0], [70.6, 5615.0], [70.7, 5619.0], [70.8, 5623.0], [70.9, 5633.0], [71.0, 5637.0], [71.1, 5641.0], [71.2, 5642.0], [71.3, 5644.0], [71.4, 5662.0], [71.5, 5677.0], [71.6, 5684.0], [71.7, 5706.0], [71.8, 5723.0], [71.9, 5730.0], [72.0, 5737.0], [72.1, 5753.0], [72.2, 5762.0], [72.3, 5776.0], [72.4, 5787.0], [72.5, 5797.0], [72.6, 5808.0], [72.7, 5817.0], [72.8, 5823.0], [72.9, 5837.0], [73.0, 5849.0], [73.1, 5853.0], [73.2, 5870.0], [73.3, 5878.0], [73.4, 5901.0], [73.5, 5936.0], [73.6, 5943.0], [73.7, 5946.0], [73.8, 5954.0], [73.9, 5975.0], [74.0, 5985.0], [74.1, 5997.0], [74.2, 6009.0], [74.3, 6030.0], [74.4, 6037.0], [74.5, 6044.0], [74.6, 6052.0], [74.7, 6057.0], [74.8, 6066.0], [74.9, 6070.0], [75.0, 6090.0], [75.1, 6108.0], [75.2, 6117.0], [75.3, 6124.0], [75.4, 6141.0], [75.5, 6147.0], [75.6, 6158.0], [75.7, 6174.0], [75.8, 6180.0], [75.9, 6186.0], [76.0, 6198.0], [76.1, 6202.0], [76.2, 6209.0], [76.3, 6236.0], [76.4, 6242.0], [76.5, 6249.0], [76.6, 6260.0], [76.7, 6263.0], [76.8, 6280.0], [76.9, 6286.0], [77.0, 6292.0], [77.1, 6304.0], [77.2, 6307.0], [77.3, 6315.0], [77.4, 6322.0], [77.5, 6336.0], [77.6, 6339.0], [77.7, 6350.0], [77.8, 6356.0], [77.9, 6362.0], [78.0, 6377.0], [78.1, 6387.0], [78.2, 6391.0], [78.3, 6397.0], [78.4, 6404.0], [78.5, 6413.0], [78.6, 6421.0], [78.7, 6423.0], [78.8, 6429.0], [78.9, 6441.0], [79.0, 6447.0], [79.1, 6453.0], [79.2, 6461.0], [79.3, 6465.0], [79.4, 6468.0], [79.5, 6479.0], [79.6, 6486.0], [79.7, 6490.0], [79.8, 6497.0], [79.9, 6506.0], [80.0, 6509.0], [80.1, 6509.0], [80.2, 6516.0], [80.3, 6532.0], [80.4, 6536.0], [80.5, 6537.0], [80.6, 6540.0], [80.7, 6547.0], [80.8, 6554.0], [80.9, 6557.0], [81.0, 6561.0], [81.1, 6565.0], [81.2, 6568.0], [81.3, 6569.0], [81.4, 6574.0], [81.5, 6580.0], [81.6, 6585.0], [81.7, 6589.0], [81.8, 6598.0], [81.9, 6601.0], [82.0, 6607.0], [82.1, 6609.0], [82.2, 6613.0], [82.3, 6616.0], [82.4, 6627.0], [82.5, 6633.0], [82.6, 6641.0], [82.7, 6644.0], [82.8, 6645.0], [82.9, 6646.0], [83.0, 6649.0], [83.1, 6658.0], [83.2, 6664.0], [83.3, 6666.0], [83.4, 6670.0], [83.5, 6673.0], [83.6, 6675.0], [83.7, 6678.0], [83.8, 6681.0], [83.9, 6691.0], [84.0, 6696.0], [84.1, 6697.0], [84.2, 6708.0], [84.3, 6719.0], [84.4, 6723.0], [84.5, 6728.0], [84.6, 6731.0], [84.7, 6736.0], [84.8, 6738.0], [84.9, 6742.0], [85.0, 6749.0], [85.1, 6752.0], [85.2, 6755.0], [85.3, 6757.0], [85.4, 6764.0], [85.5, 6767.0], [85.6, 6773.0], [85.7, 6775.0], [85.8, 6780.0], [85.9, 6782.0], [86.0, 6787.0], [86.1, 6794.0], [86.2, 6803.0], [86.3, 6805.0], [86.4, 6808.0], [86.5, 6813.0], [86.6, 6815.0], [86.7, 6819.0], [86.8, 6822.0], [86.9, 6832.0], [87.0, 6838.0], [87.1, 6848.0], [87.2, 6857.0], [87.3, 6859.0], [87.4, 6861.0], [87.5, 6863.0], [87.6, 6871.0], [87.7, 6881.0], [87.8, 6888.0], [87.9, 6892.0], [88.0, 6899.0], [88.1, 6901.0], [88.2, 6908.0], [88.3, 6918.0], [88.4, 6930.0], [88.5, 6933.0], [88.6, 6938.0], [88.7, 6940.0], [88.8, 6951.0], [88.9, 6955.0], [89.0, 6958.0], [89.1, 6967.0], [89.2, 6973.0], [89.3, 6979.0], [89.4, 6982.0], [89.5, 6985.0], [89.6, 6992.0], [89.7, 6995.0], [89.8, 7000.0], [89.9, 7002.0], [90.0, 7003.0], [90.1, 7008.0], [90.2, 7011.0], [90.3, 7017.0], [90.4, 7023.0], [90.5, 7030.0], [90.6, 7034.0], [90.7, 7037.0], [90.8, 7043.0], [90.9, 7047.0], [91.0, 7055.0], [91.1, 7060.0], [91.2, 7062.0], [91.3, 7065.0], [91.4, 7082.0], [91.5, 7089.0], [91.6, 7098.0], [91.7, 7105.0], [91.8, 7109.0], [91.9, 7118.0], [92.0, 7125.0], [92.1, 7133.0], [92.2, 7144.0], [92.3, 7150.0], [92.4, 7156.0], [92.5, 7160.0], [92.6, 7164.0], [92.7, 7169.0], [92.8, 7179.0], [92.9, 7195.0], [93.0, 7200.0], [93.1, 7216.0], [93.2, 7230.0], [93.3, 7236.0], [93.4, 7248.0], [93.5, 7262.0], [93.6, 7273.0], [93.7, 7280.0], [93.8, 7290.0], [93.9, 7304.0], [94.0, 7336.0], [94.1, 7357.0], [94.2, 7370.0], [94.3, 7380.0], [94.4, 7401.0], [94.5, 7418.0], [94.6, 7433.0], [94.7, 7479.0], [94.8, 7493.0], [94.9, 7506.0], [95.0, 7522.0], [95.1, 7532.0], [95.2, 7544.0], [95.3, 7561.0], [95.4, 7575.0], [95.5, 7609.0], [95.6, 7636.0], [95.7, 7650.0], [95.8, 7683.0], [95.9, 7709.0], [96.0, 7730.0], [96.1, 7766.0], [96.2, 7799.0], [96.3, 7825.0], [96.4, 7832.0], [96.5, 7851.0], [96.6, 7916.0], [96.7, 7983.0], [96.8, 8048.0], [96.9, 8082.0], [97.0, 8104.0], [97.1, 8169.0], [97.2, 8196.0], [97.3, 8231.0], [97.4, 8259.0], [97.5, 8273.0], [97.6, 8282.0], [97.7, 8427.0], [97.8, 8457.0], [97.9, 8522.0], [98.0, 8588.0], [98.1, 8610.0], [98.2, 8627.0], [98.3, 8679.0], [98.4, 8745.0], [98.5, 8795.0], [98.6, 8853.0], [98.7, 8874.0], [98.8, 8921.0], [98.9, 9002.0], [99.0, 9065.0], [99.1, 9089.0], [99.2, 9239.0], [99.3, 9364.0], [99.4, 9443.0], [99.5, 9603.0], [99.6, 9739.0], [99.7, 9888.0], [99.8, 9969.0], [99.9, 10062.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 70.0, "series": [{"data": [[100.0, 2.0], [200.0, 42.0], [300.0, 70.0], [400.0, 43.0], [500.0, 31.0], [600.0, 36.0], [700.0, 31.0], [800.0, 27.0], [900.0, 25.0], [1000.0, 25.0], [1100.0, 30.0], [1200.0, 19.0], [1300.0, 29.0], [1400.0, 22.0], [1500.0, 38.0], [1600.0, 33.0], [1700.0, 33.0], [1800.0, 42.0], [1900.0, 36.0], [2000.0, 24.0], [2100.0, 29.0], [2200.0, 40.0], [2300.0, 33.0], [2400.0, 24.0], [2500.0, 28.0], [2600.0, 33.0], [2700.0, 37.0], [2800.0, 36.0], [2900.0, 65.0], [3000.0, 49.0], [3100.0, 53.0], [3300.0, 63.0], [3200.0, 46.0], [3400.0, 57.0], [3500.0, 55.0], [3700.0, 61.0], [3600.0, 57.0], [3800.0, 53.0], [3900.0, 46.0], [4000.0, 49.0], [4300.0, 46.0], [4100.0, 38.0], [4200.0, 42.0], [4400.0, 42.0], [4500.0, 48.0], [4600.0, 35.0], [4700.0, 38.0], [4800.0, 36.0], [5000.0, 33.0], [4900.0, 35.0], [5100.0, 33.0], [5200.0, 38.0], [5300.0, 28.0], [5500.0, 41.0], [5400.0, 26.0], [5600.0, 40.0], [5800.0, 26.0], [5700.0, 25.0], [5900.0, 23.0], [6000.0, 28.0], [6100.0, 30.0], [6200.0, 30.0], [6300.0, 37.0], [6400.0, 46.0], [6500.0, 60.0], [6600.0, 69.0], [6800.0, 56.0], [6700.0, 60.0], [6900.0, 53.0], [7000.0, 55.0], [7100.0, 41.0], [7200.0, 26.0], [7300.0, 16.0], [7400.0, 13.0], [7500.0, 19.0], [7600.0, 13.0], [7700.0, 10.0], [7900.0, 5.0], [7800.0, 10.0], [8100.0, 7.0], [8000.0, 8.0], [8200.0, 12.0], [8400.0, 7.0], [8500.0, 5.0], [8600.0, 8.0], [8700.0, 7.0], [8300.0, 1.0], [8900.0, 3.0], [9000.0, 7.0], [8800.0, 7.0], [9200.0, 3.0], [9100.0, 2.0], [9400.0, 2.0], [9300.0, 2.0], [9500.0, 2.0], [9600.0, 3.0], [9700.0, 1.0], [9800.0, 3.0], [9900.0, 5.0], [10000.0, 1.0], [10200.0, 1.0], [10300.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 10300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 157.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2568.0, "series": [{"data": [[1.0, 275.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 157.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2568.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 782.1020000000018, "minX": 1.54960824E12, "maxY": 782.1020000000018, "series": [{"data": [[1.54960824E12, 782.1020000000018]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 268.0, "minX": 1.0, "maxY": 10334.0, "series": [{"data": [[3.0, 6645.0], [4.0, 6783.0], [5.0, 6641.0], [6.0, 6604.0], [7.0, 6858.0], [9.0, 6895.0], [11.0, 6767.0], [12.0, 6818.0], [13.0, 7060.0], [14.0, 6778.0], [15.0, 6773.0], [16.0, 6935.0], [17.0, 6665.0], [18.0, 6691.0], [19.0, 10232.0], [20.0, 6583.0], [21.0, 6977.0], [23.0, 6727.0], [24.0, 7017.0], [25.0, 6780.0], [28.0, 6756.0], [31.0, 6918.8], [33.0, 6666.0], [35.0, 6589.0], [34.0, 6816.0], [37.0, 7042.0], [36.0, 6731.0], [39.0, 6561.0], [38.0, 6931.0], [41.0, 7156.0], [40.0, 6980.0], [43.0, 6982.0], [42.0, 7179.0], [45.0, 6697.0], [44.0, 7281.0], [47.0, 6612.0], [46.0, 6969.0], [48.0, 6861.0], [51.0, 6675.0], [50.0, 6652.5], [52.0, 7023.0], [55.0, 6863.0], [54.0, 6902.0], [57.0, 6773.0], [56.0, 6657.0], [59.0, 6757.0], [61.0, 6738.0], [60.0, 6701.0], [63.0, 6961.0], [62.0, 6659.0], [67.0, 6601.0], [66.0, 7047.0], [65.0, 7037.0], [64.0, 7165.0], [71.0, 2127.75], [70.0, 3603.0], [69.0, 2555.6666666666665], [68.0, 1433.1666666666667], [75.0, 770.5333333333333], [74.0, 684.3684210526317], [73.0, 753.0666666666666], [72.0, 1334.8333333333335], [78.0, 2420.6666666666665], [76.0, 1154.75], [77.0, 2249.25], [79.0, 6819.0], [82.0, 1296.7142857142858], [81.0, 1589.6], [83.0, 1667.6], [80.0, 6815.0], [84.0, 2398.3333333333335], [85.0, 1926.0], [87.0, 342.0], [86.0, 1972.75], [88.0, 4871.333333333333], [90.0, 3449.5], [91.0, 3495.5], [89.0, 7037.0], [92.0, 2389.0], [95.0, 6752.0], [94.0, 7142.5], [98.0, 348.5], [97.0, 3776.5], [99.0, 4765.666666666667], [96.0, 6956.0], [103.0, 6764.0], [102.0, 6819.0], [100.0, 7105.0], [106.0, 3526.0], [107.0, 1979.0], [105.0, 6569.0], [104.0, 7380.0], [109.0, 268.0], [111.0, 2582.3333333333335], [110.0, 4927.333333333333], [108.0, 6547.0], [115.0, 1968.5], [114.0, 3565.0], [113.0, 6488.0], [112.0, 7012.0], [118.0, 1896.5], [119.0, 2627.3333333333335], [117.0, 5286.333333333333], [121.0, 1764.0], [120.0, 2110.25], [123.0, 6911.0], [127.0, 6793.0], [125.0, 7151.0], [124.0, 6737.0], [128.0, 2530.6666666666665], [133.0, 393.0], [134.0, 5031.666666666667], [135.0, 3403.5], [132.0, 6649.5], [130.0, 6830.0], [129.0, 6788.0], [136.0, 3609.5], [139.0, 1543.5], [140.0, 3537.5], [138.0, 2653.3333333333335], [143.0, 3758.0], [142.0, 6797.0], [141.0, 7905.0], [137.0, 7147.0], [147.0, 4192.5], [151.0, 7939.0], [149.0, 6609.0], [148.0, 8282.0], [146.0, 10334.0], [145.0, 7002.0], [144.0, 7199.0], [152.0, 4565.5], [153.0, 3627.0], [156.0, 3610.0], [155.0, 3886.5], [159.0, 1741.6], [158.0, 3778.5], [157.0, 7112.0], [154.0, 6676.0], [160.0, 2007.0], [161.0, 2226.75], [162.0, 3400.0], [163.0, 3594.5], [167.0, 474.5], [166.0, 6764.0], [165.0, 6775.0], [164.0, 6536.0], [168.0, 3560.0], [169.0, 3500.5], [172.0, 4716.0], [175.0, 3551.0], [174.0, 7160.0], [173.0, 7028.0], [171.0, 7003.0], [170.0, 7108.0], [183.0, 3170.0], [182.0, 6870.0], [181.0, 6736.0], [179.0, 6848.0], [178.0, 6780.5], [176.0, 8723.0], [187.0, 2511.666666666667], [188.0, 3431.5], [190.0, 3423.5], [191.0, 8457.0], [189.0, 6955.0], [186.0, 6932.0], [185.0, 6559.0], [184.0, 7650.0], [195.0, 3855.5], [198.0, 3908.0], [199.0, 2838.3333333333335], [197.0, 9991.0], [196.0, 6556.0], [194.0, 6370.0], [193.0, 6678.0], [192.0, 6674.0], [201.0, 2649.3333333333335], [200.0, 3548.5], [204.0, 2215.75], [205.0, 645.75], [203.0, 4847.666666666667], [206.0, 3678.75], [207.0, 6516.0], [209.0, 3660.5], [215.0, 3531.3333333333335], [214.0, 4128.75], [212.0, 7141.0], [211.0, 6923.0], [210.0, 7074.0], [208.0, 6578.0], [216.0, 3541.0], [220.0, 3682.0], [219.0, 3793.3333333333335], [218.0, 3933.5], [223.0, 6928.0], [221.0, 6807.0], [217.0, 6805.0], [227.0, 1519.4], [226.0, 1877.8], [225.0, 2687.3333333333335], [228.0, 1893.2], [230.0, 3610.5], [229.0, 2764.0], [224.0, 6803.0], [232.0, 4667.666666666667], [233.0, 2704.6666666666665], [235.0, 3495.5], [239.0, 5283.0], [238.0, 2179.25], [237.0, 6337.0], [236.0, 6644.0], [234.0, 7000.0], [242.0, 882.3333333333334], [243.0, 4527.0], [245.0, 878.5], [246.0, 6867.0], [247.0, 9739.0], [244.0, 6536.0], [241.0, 7712.0], [240.0, 6486.0], [249.0, 3526.0], [248.0, 4465.5], [251.0, 3963.5], [255.0, 3769.0], [254.0, 3834.5], [253.0, 6413.0], [252.0, 9007.0], [250.0, 9888.0], [259.0, 793.0], [257.0, 3847.5], [258.0, 2514.333333333333], [260.0, 4602.75], [261.0, 8469.0], [262.0, 2953.0], [263.0, 1860.6666666666665], [256.0, 6738.0], [267.0, 3792.0], [271.0, 6371.0], [265.0, 6171.0], [264.0, 6447.0], [266.0, 6291.0], [268.0, 2707.333333333333], [269.0, 6845.0], [270.0, 2938.666666666667], [287.0, 6532.0], [272.0, 4073.5], [276.0, 3783.5], [277.0, 9953.0], [279.0, 6816.0], [278.0, 9684.0], [282.0, 3794.0], [284.0, 4644.5], [275.0, 6939.0], [274.0, 6304.0], [273.0, 6748.0], [286.0, 6389.0], [285.0, 6643.0], [283.0, 7246.0], [281.0, 6512.0], [280.0, 8140.0], [302.0, 6057.0], [293.0, 5199.5], [292.0, 3528.5], [291.0, 2675.75], [290.0, 6822.0], [289.0, 6580.0], [288.0, 6169.0], [295.0, 7377.0], [294.0, 6400.0], [303.0, 6453.0], [297.0, 7063.0], [296.0, 8718.0], [301.0, 6955.0], [300.0, 9543.0], [299.0, 7746.0], [298.0, 6800.0], [318.0, 6466.0], [308.0, 3698.0], [310.0, 6262.0], [309.0, 6646.0], [311.0, 3585.5], [312.0, 3868.0], [314.0, 5289.666666666667], [317.0, 4019.0], [319.0, 943.75], [316.0, 6057.0], [307.0, 8562.0], [306.0, 9603.0], [305.0, 6568.0], [304.0, 6908.0], [315.0, 7683.0], [335.0, 7803.0], [327.0, 4192.0], [325.0, 3816.0], [324.0, 6752.0], [328.0, 3719.5], [329.0, 9810.0], [326.0, 3865.0], [334.0, 7654.5], [332.0, 6671.0], [323.0, 8597.0], [322.0, 7106.0], [321.0, 8361.0], [320.0, 7190.0], [331.0, 7517.0], [330.0, 6461.0], [348.0, 3561.5], [337.0, 4705.5], [336.0, 9372.0], [338.0, 3797.0], [339.0, 3777.0], [343.0, 3261.0], [342.0, 6613.0], [341.0, 6788.0], [340.0, 6685.0], [347.0, 3827.6666666666665], [346.0, 3693.0], [345.0, 4003.0], [351.0, 3947.5], [344.0, 6773.0], [350.0, 3998.0], [349.0, 4935.5], [355.0, 4053.0], [352.0, 3679.0], [353.0, 2371.0], [354.0, 2333.4], [357.0, 3748.0], [356.0, 7008.0], [358.0, 6645.0], [359.0, 6030.0], [362.0, 3007.666666666667], [361.0, 6198.0], [360.0, 6899.0], [363.0, 7246.0], [367.0, 6408.0], [366.0, 8060.0], [365.0, 6346.5], [382.0, 6717.0], [370.0, 4050.0], [371.0, 3518.5], [372.0, 3776.0], [373.0, 3288.6666666666665], [374.0, 3703.0], [375.0, 7301.0], [369.0, 7477.0], [368.0, 6664.0], [383.0, 8253.0], [377.0, 6495.0], [376.0, 6241.0], [379.0, 6529.0], [378.0, 6423.0], [381.0, 9533.0], [380.0, 6858.0], [398.0, 2447.8], [385.0, 2552.6], [384.0, 6249.0], [391.0, 7249.0], [390.0, 6144.5], [388.0, 7009.0], [386.0, 2609.75], [387.0, 3205.333333333333], [393.0, 3053.666666666667], [394.0, 2543.5], [395.0, 7262.0], [399.0, 3213.6666666666665], [392.0, 7779.0], [397.0, 6220.0], [396.0, 7616.0], [414.0, 1959.833333333333], [404.0, 4507.0], [405.0, 7098.0], [406.0, 4283.0], [413.0, 2816.0], [415.0, 2890.0], [412.0, 6721.0], [407.0, 9124.0], [401.0, 9364.0], [400.0, 9270.0], [403.0, 6537.0], [402.0, 6479.0], [411.0, 6891.0], [410.0, 9291.0], [409.0, 8082.0], [408.0, 7682.0], [430.0, 4371.0], [420.0, 3994.5], [421.0, 6209.0], [422.0, 4344.5], [424.0, 3958.0], [426.0, 4623.0], [425.0, 4470.0], [429.0, 7730.0], [428.0, 7378.0], [423.0, 6822.0], [417.0, 9145.0], [416.0, 6086.0], [419.0, 9443.0], [418.0, 7544.0], [427.0, 7412.0], [446.0, 4815.5], [432.0, 4731.5], [433.0, 7530.0], [435.0, 6264.0], [434.0, 6422.0], [437.0, 3867.0], [436.0, 6421.0], [438.0, 8044.0], [439.0, 5283.5], [440.0, 4025.0], [442.0, 4343.0], [441.0, 6772.0], [443.0, 4776.5], [447.0, 3649.0], [445.0, 8208.0], [444.0, 7349.0], [460.0, 5298.5], [451.0, 2923.5], [450.0, 8196.0], [449.0, 5185.0], [455.0, 3621.5], [448.0, 9089.0], [454.0, 7064.0], [453.0, 6004.0], [452.0, 7503.0], [456.0, 4408.5], [457.0, 7559.0], [461.0, 5192.5], [463.0, 6394.0], [462.0, 8874.0], [459.0, 7195.0], [458.0, 6892.0], [478.0, 3511.6666666666665], [466.0, 4468.0], [465.0, 8231.0], [464.0, 6439.0], [471.0, 7916.0], [470.0, 7044.0], [469.0, 5513.0], [468.0, 9239.0], [467.0, 3725.5], [472.0, 3830.0], [475.0, 2175.4285714285716], [476.0, 2859.0], [474.0, 4048.5], [473.0, 7336.0], [479.0, 6141.0], [477.0, 8090.0], [494.0, 7834.0], [482.0, 2876.5], [484.0, 5155.0], [485.0, 6179.0], [483.0, 3409.666666666667], [481.0, 3752.0], [480.0, 7556.0], [487.0, 7332.5], [495.0, 4333.0], [489.0, 6092.0], [488.0, 6573.0], [493.0, 6151.0], [492.0, 7522.0], [491.0, 7231.0], [490.0, 7280.0], [510.0, 3817.0], [499.0, 4699.0], [496.0, 4263.0], [497.0, 7821.0], [504.0, 3127.666666666667], [503.0, 3376.666666666667], [505.0, 2587.4], [502.0, 4615.0], [500.0, 6730.0], [506.0, 2755.75], [507.0, 8679.0], [509.0, 5331.5], [508.0, 3156.333333333333], [515.0, 3740.666666666667], [516.0, 4344.0], [518.0, 6862.0], [517.0, 6624.0], [536.0, 6900.0], [519.0, 7479.0], [525.0, 2587.8], [524.0, 3680.6666666666665], [526.0, 3642.3333333333335], [527.0, 7292.0], [514.0, 8853.0], [513.0, 7391.0], [512.0, 7634.0], [523.0, 5208.5], [522.0, 8618.0], [521.0, 7304.0], [520.0, 6362.0], [533.0, 3536.0], [534.0, 4008.0], [535.0, 6304.0], [537.0, 1296.5], [540.0, 2863.75], [539.0, 8795.0], [538.0, 6749.5], [543.0, 7026.5], [529.0, 8613.0], [528.0, 8608.0], [532.0, 9002.0], [531.0, 6809.5], [541.0, 7115.0], [549.0, 2681.0], [556.0, 2987.333333333333], [544.0, 2700.6], [559.0, 6385.0], [545.0, 3336.333333333333], [547.0, 4650.0], [546.0, 8797.0], [548.0, 8650.0], [565.0, 3271.333333333333], [566.0, 2965.666666666667], [567.0, 6334.0], [564.0, 4556.0], [563.0, 7357.0], [562.0, 6090.0], [561.0, 6633.0], [560.0, 7483.0], [573.0, 4471.0], [572.0, 6511.0], [574.0, 6719.0], [575.0, 8420.0], [570.0, 4210.5], [569.0, 6699.0], [568.0, 7609.0], [551.0, 6952.0], [550.0, 5998.0], [571.0, 3583.5], [552.0, 3137.333333333333], [553.0, 3095.75], [555.0, 2942.0], [554.0, 6780.0], [557.0, 4121.0], [558.0, 3081.333333333333], [583.0, 7085.0], [591.0, 3056.5], [578.0, 3824.0], [577.0, 7191.0], [576.0, 7760.0], [580.0, 5812.0], [579.0, 7575.0], [582.0, 8564.0], [581.0, 6468.0], [586.0, 3026.25], [585.0, 2292.1428571428573], [584.0, 2467.8333333333335], [590.0, 4231.5], [589.0, 6263.0], [588.0, 6976.0], [587.0, 6389.0], [593.0, 3619.6], [595.0, 6658.0], [594.0, 6832.0], [597.0, 8434.0], [596.0, 5870.0], [599.0, 6886.0], [598.0, 6158.0], [607.0, 6197.0], [606.0, 6995.0], [605.0, 6747.5], [603.0, 3840.0], [602.0, 3325.5], [601.0, 2661.4], [600.0, 4456.0], [613.0, 3750.6666666666665], [611.0, 5014.666666666667], [610.0, 1891.0], [609.0, 6356.0], [608.0, 7161.0], [623.0, 6465.0], [622.0, 6696.0], [621.0, 7141.0], [620.0, 8276.0], [619.0, 6892.0], [612.0, 4577.5], [615.0, 1705.5], [614.0, 4331.5], [618.0, 4033.5], [617.0, 3887.5], [616.0, 7061.5], [628.0, 4068.5], [630.0, 3136.333333333333], [631.0, 3533.0], [629.0, 3720.0], [627.0, 2366.75], [626.0, 6066.0], [625.0, 6509.0], [624.0, 5565.0], [639.0, 3706.0], [638.0, 8239.0], [637.0, 5539.0], [636.0, 6025.0], [632.0, 2995.5], [634.0, 4084.0], [633.0, 6666.0], [635.0, 4040.0], [647.0, 4099.5], [653.0, 4088.5], [641.0, 3101.75], [640.0, 5069.0], [655.0, 4520.0], [654.0, 8000.0], [643.0, 4211.5], [642.0, 5792.0], [644.0, 8104.0], [646.0, 7082.0], [645.0, 6807.0], [651.0, 2713.2], [650.0, 3726.0], [649.0, 7060.0], [648.0, 7273.0], [652.0, 4189.0], [656.0, 4450.0], [658.0, 7947.0], [657.0, 8259.0], [671.0, 3526.333333333333], [670.0, 3234.75], [669.0, 2713.5], [668.0, 2927.4], [667.0, 4104.0], [664.0, 3878.5], [665.0, 7032.0], [666.0, 4208.5], [659.0, 3131.666666666667], [660.0, 4141.0], [661.0, 6940.0], [663.0, 2707.666666666667], [662.0, 5954.0], [676.0, 3403.2], [679.0, 3722.0], [696.0, 5706.0], [697.0, 4044.5], [698.0, 4028.5], [699.0, 5305.0], [701.0, 3839.5], [702.0, 3592.5], [703.0, 3521.6666666666665], [700.0, 3565.333333333333], [689.0, 3882.5], [690.0, 3899.5], [692.0, 3256.666666666667], [691.0, 5424.0], [694.0, 3088.6], [695.0, 3764.5], [693.0, 2688.8], [688.0, 2703.6], [678.0, 3955.666666666667], [677.0, 3830.5], [675.0, 1547.0], [674.0, 5340.0], [673.0, 2903.333333333333], [672.0, 4331.0], [685.0, 3315.0], [686.0, 3218.5], [687.0, 2331.777777777778], [683.0, 3644.0], [684.0, 2762.6], [682.0, 2712.0], [681.0, 3980.0], [680.0, 8174.0], [730.0, 3594.0], [707.0, 2546.3333333333335], [704.0, 4966.0], [706.0, 5506.0], [705.0, 5808.0], [708.0, 4150.0], [710.0, 2980.75], [711.0, 5218.0], [729.0, 6245.0], [728.0, 5895.0], [720.0, 3396.333333333333], [735.0, 3671.5], [734.0, 5858.0], [733.0, 5944.0], [732.0, 5247.0], [731.0, 5329.0], [722.0, 3943.333333333333], [723.0, 2942.333333333333], [725.0, 3249.0], [727.0, 6587.0], [726.0, 6973.0], [724.0, 3003.333333333333], [721.0, 3130.5], [709.0, 3263.6666666666665], [712.0, 2863.8], [713.0, 6838.0], [714.0, 4527.0], [715.0, 3547.0], [716.0, 6997.0], [718.0, 5640.0], [717.0, 5548.0], [719.0, 3507.666666666667], [762.0, 2699.4], [737.0, 4275.5], [736.0, 4223.0], [742.0, 3440.0], [741.0, 2583.0], [740.0, 6478.0], [739.0, 5737.0], [738.0, 5382.0], [745.0, 3919.0], [744.0, 5313.0], [747.0, 6189.0], [746.0, 5214.0], [748.0, 3064.857142857143], [749.0, 3446.0], [750.0, 7636.0], [751.0, 3055.25], [754.0, 3664.3333333333335], [755.0, 5462.0], [756.0, 3865.0], [758.0, 3506.666666666667], [757.0, 6940.0], [759.0, 5985.0], [753.0, 3403.6666666666665], [752.0, 2695.0], [767.0, 6673.0], [766.0, 6290.0], [765.0, 5016.0], [764.0, 5015.0], [763.0, 6153.0], [760.0, 3490.0], [743.0, 6863.0], [761.0, 3781.333333333333], [775.0, 2762.285714285714], [779.0, 4648.5], [771.0, 3503.666666666667], [774.0, 3779.666666666667], [773.0, 7642.0], [772.0, 7413.0], [776.0, 3224.75], [785.0, 3103.2], [786.0, 3850.5], [787.0, 7363.0], [789.0, 3970.5], [791.0, 3310.3333333333335], [790.0, 5163.0], [788.0, 3799.5], [784.0, 2819.8], [799.0, 6236.0], [798.0, 5117.0], [797.0, 5817.0], [795.0, 3255.3333333333335], [794.0, 5775.0], [796.0, 3774.5], [792.0, 2698.75], [793.0, 3885.0], [777.0, 3990.5], [778.0, 4711.5], [782.0, 2755.4], [781.0, 5502.0], [780.0, 4905.0], [783.0, 3213.0], [768.0, 5540.0], [770.0, 5000.0], [769.0, 6536.0], [828.0, 5734.0], [800.0, 3078.2], [801.0, 6455.0], [815.0, 6401.0], [814.0, 5606.0], [813.0, 4636.0], [812.0, 6280.0], [811.0, 6132.0], [810.0, 5643.0], [809.0, 5358.0], [808.0, 5101.0], [802.0, 3315.0], [803.0, 3742.6666666666665], [805.0, 4876.0], [804.0, 5166.0], [807.0, 5988.0], [806.0, 5712.0], [825.0, 5980.0], [824.0, 5788.0], [831.0, 5413.0], [817.0, 6373.5], [819.0, 7520.0], [818.0, 5951.0], [821.0, 5531.0], [820.0, 4713.0], [823.0, 4624.0], [822.0, 6337.0], [830.0, 5073.0], [829.0, 5018.0], [827.0, 5167.0], [826.0, 4825.0], [860.0, 7017.0], [863.0, 5062.0], [849.0, 4975.0], [848.0, 7236.0], [851.0, 4549.0], [850.0, 4596.0], [853.0, 4636.0], [852.0, 6186.0], [862.0, 5391.0], [861.0, 5572.0], [859.0, 5528.0], [858.0, 4827.0], [857.0, 4738.0], [856.0, 5936.0], [847.0, 4650.0], [833.0, 7173.0], [832.0, 5534.0], [835.0, 5217.0], [834.0, 5820.0], [837.0, 6069.0], [836.0, 6033.0], [839.0, 4655.0], [838.0, 5393.0], [846.0, 5943.0], [845.0, 6174.0], [844.0, 5910.0], [843.0, 5936.0], [842.0, 5413.5], [840.0, 5114.0], [855.0, 7018.0], [854.0, 4593.0], [892.0, 4271.0], [895.0, 6032.0], [881.0, 4953.0], [880.0, 4633.0], [883.0, 5115.0], [882.0, 7079.0], [885.0, 4943.0], [884.0, 6992.0], [894.0, 4958.0], [893.0, 6889.0], [891.0, 5344.0], [890.0, 5523.0], [889.0, 4516.0], [888.0, 5063.0], [879.0, 7234.0], [864.0, 6202.0], [867.0, 5609.5], [865.0, 7025.0], [869.0, 5434.0], [868.0, 5656.0], [871.0, 5615.0], [870.0, 7275.0], [878.0, 6873.0], [877.0, 5182.0], [876.0, 4733.0], [875.0, 7163.0], [874.0, 5389.0], [873.0, 4839.0], [872.0, 4416.0], [887.0, 4575.0], [886.0, 5730.0], [921.0, 4056.0], [926.0, 4998.0], [927.0, 4401.0], [912.0, 4340.0], [914.0, 7045.0], [913.0, 5091.0], [916.0, 4583.0], [915.0, 4282.0], [925.0, 4861.0], [924.0, 5503.0], [923.0, 5502.0], [920.0, 4853.0], [903.0, 4785.0], [902.0, 4414.0], [901.0, 5853.0], [900.0, 5512.0], [899.0, 4840.0], [898.0, 6653.0], [897.0, 4508.0], [896.0, 5962.0], [911.0, 5297.0], [910.0, 4965.0], [909.0, 5121.0], [908.0, 4349.0], [907.0, 5679.0], [906.0, 5849.0], [905.0, 5232.0], [904.0, 4444.0], [918.0, 5641.0], [917.0, 6757.0], [956.0, 6568.0], [959.0, 5840.0], [945.0, 4118.0], [944.0, 6469.0], [947.0, 4276.0], [946.0, 5239.0], [949.0, 4313.0], [948.0, 4785.0], [958.0, 6757.0], [957.0, 4931.0], [955.0, 6333.0], [954.0, 4944.0], [953.0, 4839.0], [952.0, 5728.0], [943.0, 7381.0], [928.0, 5314.0], [930.0, 4821.0], [929.0, 6892.0], [933.0, 4395.0], [931.0, 5787.0], [935.0, 5285.0], [934.0, 7574.0], [942.0, 3978.0], [941.0, 5510.0], [940.0, 5642.0], [939.0, 6118.0], [938.0, 5936.0], [937.0, 6902.0], [936.0, 5901.0], [951.0, 5406.0], [950.0, 5152.0], [988.0, 4334.0], [991.0, 4898.666666666667], [976.0, 5146.0], [979.0, 5607.5], [977.0, 4524.0], [981.0, 4399.0], [980.0, 5546.0], [990.0, 2425.0], [989.0, 3176.6666666666665], [987.0, 3217.5], [986.0, 4425.333333333333], [985.0, 3940.5], [984.0, 4159.0], [975.0, 4321.0], [961.0, 6113.0], [960.0, 4035.0], [963.0, 5777.0], [962.0, 4422.0], [965.0, 6509.0], [964.0, 5797.0], [967.0, 4570.0], [966.0, 3826.0], [974.0, 4388.0], [973.0, 4078.0], [972.0, 6710.0], [971.0, 5091.0], [970.0, 5600.0], [969.0, 6358.0], [968.0, 5015.0], [983.0, 4539.0], [982.0, 4524.0], [1020.0, 2795.6666666666665], [1010.0, 4259.333333333333], [1014.0, 3251.1428571428573], [1015.0, 3668.25], [1012.0, 3191.8571428571427], [1011.0, 3363.5714285714284], [1009.0, 4556.5], [1023.0, 3734.3333333333335], [1008.0, 3002.0], [1013.0, 2976.6249999999995], [1019.0, 3572.0], [1018.0, 3870.666666666667], [1017.0, 3684.0], [1016.0, 4247.5], [1006.0, 3825.6666666666665], [992.0, 3542.25], [1007.0, 7212.0], [994.0, 3347.75], [993.0, 3519.0], [996.0, 3353.777777777778], [997.0, 3489.25], [995.0, 3540.5], [999.0, 3709.8], [998.0, 3361.1250000000005], [1005.0, 3828.0], [1004.0, 3902.25], [1003.0, 3312.1], [1002.0, 4342.333333333333], [1001.0, 3995.5], [1000.0, 3719.75], [1022.0, 2974.8333333333335], [1021.0, 3400.8181818181815], [1032.0, 3635.6666666666665], [1024.0, 3606.3333333333335], [1028.0, 3477.0], [1030.0, 6313.0], [1026.0, 4010.6666666666665], [1042.0, 3332.5], [1040.0, 4740.0], [1044.0, 4655.0], [1046.0, 4762.5], [1048.0, 4092.5], [1050.0, 3717.0], [1052.0, 4079.75], [1054.0, 4403.0], [1036.0, 4130.666666666667], [1034.0, 4073.0], [1038.0, 2894.0], [1056.0, 3893.0], [1060.0, 6286.0], [1058.0, 6585.0], [1086.0, 5604.0], [1082.0, 4441.0], [1084.0, 3477.0], [1080.0, 4720.0], [1076.0, 4223.5], [1078.0, 3278.0], [1074.0, 3324.75], [1072.0, 3501.5], [1062.0, 3513.5], [1064.0, 3816.4], [1066.0, 3635.25], [1070.0, 5055.0], [1068.0, 7207.0], [1098.0, 4075.6666666666665], [1102.0, 4201.75], [1090.0, 4675.5], [1114.0, 3667.6666666666665], [1116.0, 5643.0], [1088.0, 5455.0], [1092.0, 3450.0], [1096.0, 3897.0], [1094.0, 4548.0], [1100.0, 3430.222222222222], [1120.0, 3959.0], [1150.0, 3845.0], [1144.0, 3689.6666666666665], [1146.0, 5289.0], [1148.0, 3801.6666666666665], [1136.0, 3946.0], [1140.0, 5231.0], [1138.0, 4639.0], [1142.0, 2821.0], [1122.0, 3920.6666666666665], [1124.0, 4702.0], [1128.0, 4219.0], [1126.0, 4847.0], [1130.0, 3245.5], [1134.0, 4346.0], [1132.0, 5959.0], [1112.0, 4235.0], [1110.0, 4621.5], [1106.0, 4614.0], [1104.0, 3433.0], [1208.0, 5473.0], [1158.0, 3394.0], [1156.0, 3656.0], [1154.0, 4543.0], [1152.0, 5280.0], [1182.0, 4223.75], [1180.0, 4150.0], [1164.0, 3865.5], [1200.0, 4178.0], [1166.0, 4239.0], [1204.0, 3806.0], [1206.0, 4179.0], [1210.0, 3275.0], [1212.0, 3903.0], [1184.0, 5258.0], [1214.0, 4437.0], [1202.0, 4175.0], [1188.0, 5251.0], [1186.0, 3866.0], [1190.0, 3929.3333333333335], [1192.0, 4430.0], [1194.0, 3335.6666666666665], [1196.0, 3964.5], [1198.0, 3543.2], [1162.0, 3482.3333333333335], [1160.0, 5642.0], [1170.0, 3894.5], [1168.0, 5307.0], [1172.0, 4420.0], [1174.0, 3889.5], [1176.0, 5400.0], [1178.0, 4309.0], [1218.0, 3721.0], [1216.0, 4050.571428571429], [1246.0, 3721.3333333333335], [1242.0, 2723.0], [1244.0, 3876.5], [1240.0, 3473.6666666666665], [1236.0, 4276.0], [1238.0, 4599.0], [1232.0, 3652.75], [1234.0, 3696.5], [1220.0, 4009.5], [1222.0, 3924.0], [1224.0, 4292.5], [1226.0, 3299.285714285714], [1228.0, 3818.2], [1230.0, 3448.5], [1250.0, 4452.0], [1248.0, 3365.0], [1276.0, 5246.0], [1274.0, 4013.0], [1278.0, 3714.0], [1272.0, 3819.8333333333335], [1268.0, 5503.0], [1270.0, 3738.5], [1264.0, 5517.0], [1266.0, 5253.0], [1252.0, 4853.0], [1254.0, 4064.3333333333335], [1256.0, 4740.666666666667], [1258.0, 3285.0], [1260.0, 4850.0], [1262.0, 3837.0], [1284.0, 4166.0], [1280.0, 3880.2], [1310.0, 4447.0], [1306.0, 2965.0], [1308.0, 3421.5], [1302.0, 3357.0], [1304.0, 3750.0], [1300.0, 4098.88888888889], [1296.0, 5149.0], [1298.0, 4015.0], [1282.0, 3731.0], [1286.0, 3902.6666666666665], [1288.0, 4002.5], [1290.0, 3971.3333333333335], [1292.0, 4389.5], [1294.0, 4558.0], [1328.0, 4196.0], [1332.0, 4315.166666666667], [1330.0, 5227.0], [1334.0, 3831.1111111111113], [1336.0, 3873.0], [1338.0, 5028.0], [1340.0, 3834.0], [1342.0, 3110.25], [1312.0, 4938.0], [1318.0, 4094.3333333333335], [1320.0, 3484.6], [1324.0, 3438.0], [1326.0, 4839.0], [1322.0, 3703.0], [1316.0, 4062.5], [1314.0, 4057.0], [1350.0, 3935.3333333333335], [1346.0, 3854.0], [1344.0, 4837.0], [1374.0, 4981.0], [1366.0, 3962.0], [1364.0, 4841.0], [1368.0, 4417.0], [1370.0, 3641.0], [1372.0, 4034.25], [1362.0, 3722.25], [1360.0, 4504.0], [1348.0, 4108.0], [1352.0, 3901.8], [1354.0, 3955.0], [1356.0, 4331.666666666667], [1358.0, 3711.5], [1392.0, 3753.6666666666665], [1394.0, 4081.5], [1398.0, 3368.0], [1396.0, 4482.0], [1400.0, 4569.5], [1402.0, 3790.6666666666665], [1406.0, 3581.6], [1404.0, 4967.0], [1376.0, 3934.3333333333335], [1378.0, 3304.1666666666665], [1380.0, 3966.4], [1382.0, 3946.5], [1388.0, 3396.0], [1386.0, 3643.0], [1384.0, 3634.0], [1390.0, 4662.0], [1412.0, 3778.3333333333335], [1410.0, 4143.0], [1426.0, 4046.833333333333], [1430.0, 4364.333333333333], [1432.0, 4417.0], [1436.0, 4105.5], [1438.0, 3777.875], [1408.0, 4318.0], [1434.0, 4102.0], [1428.0, 3713.5], [1424.0, 4561.333333333333], [1414.0, 4063.0], [1418.0, 4440.0], [1420.0, 3740.0], [1416.0, 4390.75], [1442.0, 4401.666666666667], [1440.0, 3468.0], [1466.0, 3142.0], [1460.0, 5121.0], [1462.0, 4325.0], [1464.0, 3114.5], [1456.0, 3935.0], [1458.0, 3524.0], [1446.0, 3798.9], [1448.0, 4180.75], [1450.0, 4574.0], [1452.0, 3773.2], [1454.0, 3497.0], [1444.0, 3731.0], [1422.0, 3830.333333333333], [1039.0, 4069.25], [1027.0, 3003.5], [1025.0, 3324.3333333333335], [1045.0, 3429.0], [1041.0, 4091.0], [1051.0, 4068.0], [1053.0, 4235.5], [1055.0, 3820.0], [1049.0, 4338.0], [1047.0, 4838.0], [1029.0, 3958.333333333333], [1031.0, 4123.5], [1033.0, 5603.0], [1079.0, 4135.333333333333], [1083.0, 4856.0], [1081.0, 5823.0], [1087.0, 5801.0], [1085.0, 6176.0], [1077.0, 3311.0], [1075.0, 3532.6666666666665], [1073.0, 3239.714285714286], [1057.0, 4067.0], [1059.0, 3639.0], [1061.0, 6259.0], [1063.0, 4297.333333333333], [1067.0, 3160.6], [1069.0, 3847.5], [1071.0, 4607.0], [1065.0, 3422.714285714286], [1037.0, 3569.25], [1035.0, 4337.333333333333], [1095.0, 3798.0], [1115.0, 3448.6], [1113.0, 3311.0], [1093.0, 3782.5], [1091.0, 4413.0], [1089.0, 3565.0], [1119.0, 5030.0], [1117.0, 4525.0], [1101.0, 3282.0], [1099.0, 5230.0], [1097.0, 4258.0], [1137.0, 5302.0], [1103.0, 3304.0], [1141.0, 4056.0], [1139.0, 6202.0], [1145.0, 3439.0], [1143.0, 4023.5], [1149.0, 3328.6666666666665], [1151.0, 4713.0], [1147.0, 4544.0], [1121.0, 4511.5], [1127.0, 3819.5], [1125.0, 4080.0], [1123.0, 5572.0], [1135.0, 3397.6666666666665], [1133.0, 3002.0], [1131.0, 4488.0], [1129.0, 4265.0], [1109.0, 4019.5], [1107.0, 5832.0], [1105.0, 4210.0], [1111.0, 5832.0], [1209.0, 3192.0], [1185.0, 4697.0], [1157.0, 4546.0], [1181.0, 3932.0], [1183.0, 3942.0], [1155.0, 4021.0], [1153.0, 4947.0], [1161.0, 4518.0], [1159.0, 5810.0], [1163.0, 3521.6], [1201.0, 5500.0], [1167.0, 6117.0], [1165.0, 4747.0], [1203.0, 3358.0], [1207.0, 3682.0], [1211.0, 4070.75], [1213.0, 3772.0], [1215.0, 3476.5], [1205.0, 4094.0], [1189.0, 3874.3333333333335], [1187.0, 3003.0], [1191.0, 4155.0], [1193.0, 3501.75], [1195.0, 3719.0], [1199.0, 3346.4], [1197.0, 4671.0], [1173.0, 4174.666666666667], [1171.0, 4114.0], [1169.0, 4724.0], [1175.0, 5932.0], [1177.0, 5997.0], [1179.0, 4246.0], [1219.0, 3621.2], [1245.0, 4367.0], [1247.0, 5622.0], [1243.0, 3531.0], [1241.0, 3466.0], [1239.0, 3715.833333333333], [1235.0, 4165.0], [1237.0, 3753.0], [1233.0, 3582.4285714285716], [1217.0, 4135.333333333333], [1221.0, 5686.0], [1223.0, 3544.0], [1225.0, 4106.333333333333], [1227.0, 3624.5999999999995], [1229.0, 5306.0], [1231.0, 3960.6666666666665], [1279.0, 3832.5], [1249.0, 5414.0], [1277.0, 4042.0], [1275.0, 4953.0], [1271.0, 4728.0], [1273.0, 3827.0], [1269.0, 4294.0], [1265.0, 4518.5], [1267.0, 4191.5], [1251.0, 3954.0], [1253.0, 3688.75], [1255.0, 4069.0], [1259.0, 3882.0], [1261.0, 4011.0], [1263.0, 5590.0], [1257.0, 3743.0], [1283.0, 4338.0], [1311.0, 3774.0], [1305.0, 5033.0], [1307.0, 5242.0], [1309.0, 3703.75], [1303.0, 4432.5], [1301.0, 4111.333333333333], [1297.0, 4592.5], [1299.0, 2083.0], [1281.0, 4355.0], [1285.0, 3785.0], [1291.0, 3972.6666666666665], [1295.0, 3829.0], [1329.0, 3798.3333333333335], [1333.0, 3925.6363636363635], [1331.0, 3747.75], [1335.0, 4154.5], [1337.0, 4084.0], [1339.0, 4376.0], [1341.0, 4249.0], [1343.0, 3738.0], [1313.0, 3887.5], [1317.0, 4161.0], [1319.0, 3638.8], [1321.0, 4305.666666666667], [1323.0, 3938.0], [1325.0, 4709.0], [1327.0, 4748.0], [1315.0, 3603.0], [1349.0, 3788.0], [1355.0, 3739.3333333333335], [1345.0, 3768.0], [1375.0, 4366.0], [1373.0, 3727.0], [1365.0, 4929.0], [1367.0, 3715.0], [1369.0, 4624.0], [1371.0, 5004.0], [1363.0, 2599.25], [1361.0, 4787.0], [1347.0, 4189.0], [1351.0, 4244.6], [1353.0, 4176.4], [1357.0, 4560.0], [1359.0, 4563.0], [1397.0, 5099.0], [1395.0, 3526.0], [1399.0, 4419.0], [1403.0, 3738.6666666666665], [1407.0, 3824.3333333333335], [1405.0, 4030.5], [1401.0, 3681.6666666666665], [1393.0, 4293.5], [1379.0, 4369.0], [1383.0, 4481.0], [1389.0, 3793.5], [1387.0, 3745.0], [1385.0, 3830.0], [1391.0, 3998.5], [1381.0, 3956.75], [1377.0, 3549.0], [1413.0, 4083.0], [1417.0, 3911.75], [1425.0, 4222.666666666667], [1427.0, 4303.0], [1429.0, 4449.4], [1431.0, 5216.0], [1433.0, 4307.0], [1437.0, 3887.2], [1439.0, 3974.5], [1409.0, 4568.0], [1435.0, 3290.5], [1411.0, 4775.0], [1419.0, 4814.0], [1415.0, 4449.0], [1423.0, 4451.142857142858], [1441.0, 3411.0], [1467.0, 4042.5], [1465.0, 2892.0], [1461.0, 3699.0], [1463.0, 4396.0], [1457.0, 4363.0], [1459.0, 3171.0], [1443.0, 4286.5], [1445.0, 3905.5], [1447.0, 3872.2], [1449.0, 4329.0], [1451.0, 3765.6], [1453.0, 4496.333333333333], [1455.0, 4073.4], [1421.0, 4348.5], [1.0, 6731.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[782.1020000000018, 4145.393333333337]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1467.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12600.0, "minX": 1.54960824E12, "maxY": 21046.733333333334, "series": [{"data": [[1.54960824E12, 21046.733333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960824E12, 12600.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 4145.393333333337, "minX": 1.54960824E12, "maxY": 4145.393333333337, "series": [{"data": [[1.54960824E12, 4145.393333333337]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960824E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 4145.385999999991, "minX": 1.54960824E12, "maxY": 4145.385999999991, "series": [{"data": [[1.54960824E12, 4145.385999999991]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960824E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 58.218999999999845, "minX": 1.54960824E12, "maxY": 58.218999999999845, "series": [{"data": [[1.54960824E12, 58.218999999999845]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960824E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 167.0, "minX": 1.54960824E12, "maxY": 10334.0, "series": [{"data": [[1.54960824E12, 10334.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960824E12, 167.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960824E12, 7003.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960824E12, 9064.669999999993]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960824E12, 7521.9]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3988.0, "minX": 50.0, "maxY": 3988.0, "series": [{"data": [[50.0, 3988.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3988.0, "minX": 50.0, "maxY": 3988.0, "series": [{"data": [[50.0, 3988.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960824E12, "maxY": 50.0, "series": [{"data": [[1.54960824E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960824E12, "maxY": 50.0, "series": [{"data": [[1.54960824E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960824E12, "maxY": 50.0, "series": [{"data": [[1.54960824E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960824E12, "title": "Transactions Per Second"}},
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
