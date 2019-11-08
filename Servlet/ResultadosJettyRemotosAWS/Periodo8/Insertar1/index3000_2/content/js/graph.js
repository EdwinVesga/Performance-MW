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
        data: {"result": {"minY": 208.0, "minX": 0.0, "maxY": 9475.0, "series": [{"data": [[0.0, 208.0], [0.1, 214.0], [0.2, 237.0], [0.3, 257.0], [0.4, 266.0], [0.5, 279.0], [0.6, 292.0], [0.7, 313.0], [0.8, 314.0], [0.9, 316.0], [1.0, 318.0], [1.1, 321.0], [1.2, 332.0], [1.3, 335.0], [1.4, 337.0], [1.5, 347.0], [1.6, 348.0], [1.7, 354.0], [1.8, 356.0], [1.9, 363.0], [2.0, 368.0], [2.1, 370.0], [2.2, 372.0], [2.3, 378.0], [2.4, 384.0], [2.5, 396.0], [2.6, 398.0], [2.7, 404.0], [2.8, 407.0], [2.9, 408.0], [3.0, 413.0], [3.1, 417.0], [3.2, 418.0], [3.3, 419.0], [3.4, 431.0], [3.5, 434.0], [3.6, 444.0], [3.7, 446.0], [3.8, 451.0], [3.9, 460.0], [4.0, 464.0], [4.1, 465.0], [4.2, 469.0], [4.3, 472.0], [4.4, 474.0], [4.5, 479.0], [4.6, 488.0], [4.7, 493.0], [4.8, 494.0], [4.9, 501.0], [5.0, 510.0], [5.1, 515.0], [5.2, 527.0], [5.3, 539.0], [5.4, 558.0], [5.5, 560.0], [5.6, 573.0], [5.7, 578.0], [5.8, 589.0], [5.9, 601.0], [6.0, 607.0], [6.1, 620.0], [6.2, 629.0], [6.3, 634.0], [6.4, 657.0], [6.5, 661.0], [6.6, 686.0], [6.7, 696.0], [6.8, 699.0], [6.9, 707.0], [7.0, 721.0], [7.1, 728.0], [7.2, 750.0], [7.3, 766.0], [7.4, 776.0], [7.5, 784.0], [7.6, 790.0], [7.7, 796.0], [7.8, 822.0], [7.9, 837.0], [8.0, 845.0], [8.1, 865.0], [8.2, 879.0], [8.3, 880.0], [8.4, 886.0], [8.5, 910.0], [8.6, 925.0], [8.7, 928.0], [8.8, 942.0], [8.9, 960.0], [9.0, 967.0], [9.1, 971.0], [9.2, 985.0], [9.3, 1005.0], [9.4, 1031.0], [9.5, 1040.0], [9.6, 1056.0], [9.7, 1075.0], [9.8, 1098.0], [9.9, 1113.0], [10.0, 1118.0], [10.1, 1136.0], [10.2, 1162.0], [10.3, 1186.0], [10.4, 1206.0], [10.5, 1213.0], [10.6, 1226.0], [10.7, 1227.0], [10.8, 1242.0], [10.9, 1253.0], [11.0, 1262.0], [11.1, 1279.0], [11.2, 1296.0], [11.3, 1309.0], [11.4, 1314.0], [11.5, 1332.0], [11.6, 1340.0], [11.7, 1353.0], [11.8, 1363.0], [11.9, 1385.0], [12.0, 1409.0], [12.1, 1422.0], [12.2, 1427.0], [12.3, 1440.0], [12.4, 1451.0], [12.5, 1466.0], [12.6, 1470.0], [12.7, 1477.0], [12.8, 1487.0], [12.9, 1495.0], [13.0, 1510.0], [13.1, 1529.0], [13.2, 1552.0], [13.3, 1588.0], [13.4, 1606.0], [13.5, 1625.0], [13.6, 1640.0], [13.7, 1654.0], [13.8, 1667.0], [13.9, 1706.0], [14.0, 1721.0], [14.1, 1771.0], [14.2, 1801.0], [14.3, 1810.0], [14.4, 1819.0], [14.5, 1858.0], [14.6, 1870.0], [14.7, 1883.0], [14.8, 1890.0], [14.9, 1920.0], [15.0, 1940.0], [15.1, 1952.0], [15.2, 1967.0], [15.3, 1978.0], [15.4, 1982.0], [15.5, 1993.0], [15.6, 2003.0], [15.7, 2011.0], [15.8, 2027.0], [15.9, 2039.0], [16.0, 2051.0], [16.1, 2059.0], [16.2, 2063.0], [16.3, 2066.0], [16.4, 2077.0], [16.5, 2081.0], [16.6, 2091.0], [16.7, 2102.0], [16.8, 2113.0], [16.9, 2115.0], [17.0, 2120.0], [17.1, 2133.0], [17.2, 2135.0], [17.3, 2145.0], [17.4, 2150.0], [17.5, 2162.0], [17.6, 2166.0], [17.7, 2178.0], [17.8, 2183.0], [17.9, 2191.0], [18.0, 2200.0], [18.1, 2211.0], [18.2, 2219.0], [18.3, 2236.0], [18.4, 2240.0], [18.5, 2253.0], [18.6, 2266.0], [18.7, 2272.0], [18.8, 2286.0], [18.9, 2291.0], [19.0, 2298.0], [19.1, 2300.0], [19.2, 2303.0], [19.3, 2304.0], [19.4, 2306.0], [19.5, 2309.0], [19.6, 2311.0], [19.7, 2329.0], [19.8, 2345.0], [19.9, 2355.0], [20.0, 2355.0], [20.1, 2361.0], [20.2, 2366.0], [20.3, 2375.0], [20.4, 2377.0], [20.5, 2380.0], [20.6, 2385.0], [20.7, 2389.0], [20.8, 2395.0], [20.9, 2404.0], [21.0, 2404.0], [21.1, 2407.0], [21.2, 2416.0], [21.3, 2428.0], [21.4, 2429.0], [21.5, 2433.0], [21.6, 2440.0], [21.7, 2446.0], [21.8, 2448.0], [21.9, 2457.0], [22.0, 2466.0], [22.1, 2472.0], [22.2, 2475.0], [22.3, 2484.0], [22.4, 2487.0], [22.5, 2494.0], [22.6, 2498.0], [22.7, 2509.0], [22.8, 2517.0], [22.9, 2520.0], [23.0, 2523.0], [23.1, 2531.0], [23.2, 2539.0], [23.3, 2545.0], [23.4, 2556.0], [23.5, 2562.0], [23.6, 2571.0], [23.7, 2578.0], [23.8, 2580.0], [23.9, 2589.0], [24.0, 2592.0], [24.1, 2598.0], [24.2, 2602.0], [24.3, 2612.0], [24.4, 2617.0], [24.5, 2620.0], [24.6, 2624.0], [24.7, 2630.0], [24.8, 2633.0], [24.9, 2634.0], [25.0, 2637.0], [25.1, 2649.0], [25.2, 2656.0], [25.3, 2660.0], [25.4, 2662.0], [25.5, 2667.0], [25.6, 2668.0], [25.7, 2676.0], [25.8, 2679.0], [25.9, 2683.0], [26.0, 2690.0], [26.1, 2693.0], [26.2, 2699.0], [26.3, 2702.0], [26.4, 2707.0], [26.5, 2716.0], [26.6, 2720.0], [26.7, 2724.0], [26.8, 2732.0], [26.9, 2740.0], [27.0, 2744.0], [27.1, 2749.0], [27.2, 2751.0], [27.3, 2752.0], [27.4, 2760.0], [27.5, 2765.0], [27.6, 2772.0], [27.7, 2776.0], [27.8, 2782.0], [27.9, 2786.0], [28.0, 2793.0], [28.1, 2799.0], [28.2, 2806.0], [28.3, 2808.0], [28.4, 2817.0], [28.5, 2821.0], [28.6, 2825.0], [28.7, 2830.0], [28.8, 2835.0], [28.9, 2836.0], [29.0, 2841.0], [29.1, 2846.0], [29.2, 2856.0], [29.3, 2863.0], [29.4, 2866.0], [29.5, 2870.0], [29.6, 2879.0], [29.7, 2887.0], [29.8, 2894.0], [29.9, 2896.0], [30.0, 2901.0], [30.1, 2904.0], [30.2, 2914.0], [30.3, 2919.0], [30.4, 2932.0], [30.5, 2942.0], [30.6, 2946.0], [30.7, 2952.0], [30.8, 2956.0], [30.9, 2962.0], [31.0, 2965.0], [31.1, 2971.0], [31.2, 2975.0], [31.3, 2976.0], [31.4, 2982.0], [31.5, 2984.0], [31.6, 2988.0], [31.7, 2994.0], [31.8, 3000.0], [31.9, 3009.0], [32.0, 3024.0], [32.1, 3029.0], [32.2, 3036.0], [32.3, 3039.0], [32.4, 3046.0], [32.5, 3050.0], [32.6, 3063.0], [32.7, 3068.0], [32.8, 3076.0], [32.9, 3081.0], [33.0, 3089.0], [33.1, 3095.0], [33.2, 3096.0], [33.3, 3104.0], [33.4, 3110.0], [33.5, 3121.0], [33.6, 3129.0], [33.7, 3142.0], [33.8, 3156.0], [33.9, 3163.0], [34.0, 3167.0], [34.1, 3176.0], [34.2, 3190.0], [34.3, 3192.0], [34.4, 3198.0], [34.5, 3199.0], [34.6, 3206.0], [34.7, 3211.0], [34.8, 3216.0], [34.9, 3226.0], [35.0, 3230.0], [35.1, 3234.0], [35.2, 3244.0], [35.3, 3252.0], [35.4, 3253.0], [35.5, 3260.0], [35.6, 3262.0], [35.7, 3268.0], [35.8, 3275.0], [35.9, 3281.0], [36.0, 3290.0], [36.1, 3292.0], [36.2, 3303.0], [36.3, 3311.0], [36.4, 3324.0], [36.5, 3332.0], [36.6, 3334.0], [36.7, 3340.0], [36.8, 3348.0], [36.9, 3355.0], [37.0, 3364.0], [37.1, 3372.0], [37.2, 3375.0], [37.3, 3381.0], [37.4, 3385.0], [37.5, 3397.0], [37.6, 3406.0], [37.7, 3412.0], [37.8, 3417.0], [37.9, 3419.0], [38.0, 3427.0], [38.1, 3431.0], [38.2, 3437.0], [38.3, 3445.0], [38.4, 3449.0], [38.5, 3456.0], [38.6, 3461.0], [38.7, 3475.0], [38.8, 3481.0], [38.9, 3487.0], [39.0, 3497.0], [39.1, 3500.0], [39.2, 3509.0], [39.3, 3515.0], [39.4, 3532.0], [39.5, 3541.0], [39.6, 3546.0], [39.7, 3556.0], [39.8, 3557.0], [39.9, 3562.0], [40.0, 3572.0], [40.1, 3580.0], [40.2, 3585.0], [40.3, 3592.0], [40.4, 3600.0], [40.5, 3615.0], [40.6, 3618.0], [40.7, 3624.0], [40.8, 3628.0], [40.9, 3637.0], [41.0, 3647.0], [41.1, 3655.0], [41.2, 3659.0], [41.3, 3674.0], [41.4, 3682.0], [41.5, 3691.0], [41.6, 3701.0], [41.7, 3712.0], [41.8, 3713.0], [41.9, 3723.0], [42.0, 3728.0], [42.1, 3738.0], [42.2, 3744.0], [42.3, 3754.0], [42.4, 3760.0], [42.5, 3764.0], [42.6, 3766.0], [42.7, 3769.0], [42.8, 3770.0], [42.9, 3775.0], [43.0, 3784.0], [43.1, 3794.0], [43.2, 3801.0], [43.3, 3806.0], [43.4, 3810.0], [43.5, 3820.0], [43.6, 3822.0], [43.7, 3825.0], [43.8, 3834.0], [43.9, 3844.0], [44.0, 3852.0], [44.1, 3857.0], [44.2, 3865.0], [44.3, 3872.0], [44.4, 3883.0], [44.5, 3893.0], [44.6, 3898.0], [44.7, 3910.0], [44.8, 3924.0], [44.9, 3930.0], [45.0, 3936.0], [45.1, 3944.0], [45.2, 3952.0], [45.3, 3956.0], [45.4, 3968.0], [45.5, 3979.0], [45.6, 3986.0], [45.7, 3991.0], [45.8, 3995.0], [45.9, 4004.0], [46.0, 4009.0], [46.1, 4020.0], [46.2, 4023.0], [46.3, 4028.0], [46.4, 4037.0], [46.5, 4044.0], [46.6, 4049.0], [46.7, 4059.0], [46.8, 4066.0], [46.9, 4077.0], [47.0, 4081.0], [47.1, 4085.0], [47.2, 4093.0], [47.3, 4102.0], [47.4, 4110.0], [47.5, 4117.0], [47.6, 4129.0], [47.7, 4131.0], [47.8, 4140.0], [47.9, 4152.0], [48.0, 4158.0], [48.1, 4165.0], [48.2, 4174.0], [48.3, 4176.0], [48.4, 4191.0], [48.5, 4194.0], [48.6, 4199.0], [48.7, 4201.0], [48.8, 4209.0], [48.9, 4223.0], [49.0, 4237.0], [49.1, 4256.0], [49.2, 4263.0], [49.3, 4267.0], [49.4, 4276.0], [49.5, 4282.0], [49.6, 4295.0], [49.7, 4311.0], [49.8, 4315.0], [49.9, 4320.0], [50.0, 4329.0], [50.1, 4338.0], [50.2, 4343.0], [50.3, 4350.0], [50.4, 4355.0], [50.5, 4362.0], [50.6, 4370.0], [50.7, 4374.0], [50.8, 4378.0], [50.9, 4388.0], [51.0, 4392.0], [51.1, 4399.0], [51.2, 4420.0], [51.3, 4423.0], [51.4, 4430.0], [51.5, 4435.0], [51.6, 4437.0], [51.7, 4449.0], [51.8, 4458.0], [51.9, 4465.0], [52.0, 4473.0], [52.1, 4489.0], [52.2, 4491.0], [52.3, 4495.0], [52.4, 4504.0], [52.5, 4509.0], [52.6, 4518.0], [52.7, 4522.0], [52.8, 4532.0], [52.9, 4538.0], [53.0, 4542.0], [53.1, 4545.0], [53.2, 4558.0], [53.3, 4559.0], [53.4, 4567.0], [53.5, 4573.0], [53.6, 4584.0], [53.7, 4591.0], [53.8, 4593.0], [53.9, 4604.0], [54.0, 4613.0], [54.1, 4627.0], [54.2, 4629.0], [54.3, 4634.0], [54.4, 4638.0], [54.5, 4653.0], [54.6, 4664.0], [54.7, 4667.0], [54.8, 4671.0], [54.9, 4681.0], [55.0, 4687.0], [55.1, 4688.0], [55.2, 4701.0], [55.3, 4705.0], [55.4, 4718.0], [55.5, 4722.0], [55.6, 4731.0], [55.7, 4738.0], [55.8, 4743.0], [55.9, 4759.0], [56.0, 4763.0], [56.1, 4776.0], [56.2, 4785.0], [56.3, 4796.0], [56.4, 4810.0], [56.5, 4815.0], [56.6, 4824.0], [56.7, 4835.0], [56.8, 4839.0], [56.9, 4845.0], [57.0, 4855.0], [57.1, 4858.0], [57.2, 4861.0], [57.3, 4866.0], [57.4, 4875.0], [57.5, 4887.0], [57.6, 4893.0], [57.7, 4910.0], [57.8, 4915.0], [57.9, 4920.0], [58.0, 4926.0], [58.1, 4933.0], [58.2, 4945.0], [58.3, 4949.0], [58.4, 4952.0], [58.5, 4956.0], [58.6, 4965.0], [58.7, 4980.0], [58.8, 4987.0], [58.9, 4991.0], [59.0, 4993.0], [59.1, 4995.0], [59.2, 5003.0], [59.3, 5006.0], [59.4, 5008.0], [59.5, 5013.0], [59.6, 5020.0], [59.7, 5023.0], [59.8, 5028.0], [59.9, 5031.0], [60.0, 5045.0], [60.1, 5054.0], [60.2, 5061.0], [60.3, 5068.0], [60.4, 5084.0], [60.5, 5089.0], [60.6, 5094.0], [60.7, 5110.0], [60.8, 5120.0], [60.9, 5125.0], [61.0, 5129.0], [61.1, 5136.0], [61.2, 5139.0], [61.3, 5147.0], [61.4, 5153.0], [61.5, 5157.0], [61.6, 5160.0], [61.7, 5167.0], [61.8, 5169.0], [61.9, 5173.0], [62.0, 5185.0], [62.1, 5192.0], [62.2, 5195.0], [62.3, 5208.0], [62.4, 5211.0], [62.5, 5214.0], [62.6, 5224.0], [62.7, 5227.0], [62.8, 5236.0], [62.9, 5242.0], [63.0, 5250.0], [63.1, 5255.0], [63.2, 5260.0], [63.3, 5270.0], [63.4, 5276.0], [63.5, 5288.0], [63.6, 5290.0], [63.7, 5296.0], [63.8, 5302.0], [63.9, 5305.0], [64.0, 5315.0], [64.1, 5317.0], [64.2, 5325.0], [64.3, 5330.0], [64.4, 5342.0], [64.5, 5363.0], [64.6, 5369.0], [64.7, 5372.0], [64.8, 5373.0], [64.9, 5381.0], [65.0, 5391.0], [65.1, 5395.0], [65.2, 5401.0], [65.3, 5404.0], [65.4, 5411.0], [65.5, 5416.0], [65.6, 5425.0], [65.7, 5433.0], [65.8, 5436.0], [65.9, 5452.0], [66.0, 5458.0], [66.1, 5472.0], [66.2, 5481.0], [66.3, 5493.0], [66.4, 5496.0], [66.5, 5504.0], [66.6, 5511.0], [66.7, 5513.0], [66.8, 5525.0], [66.9, 5538.0], [67.0, 5545.0], [67.1, 5556.0], [67.2, 5571.0], [67.3, 5574.0], [67.4, 5585.0], [67.5, 5589.0], [67.6, 5592.0], [67.7, 5599.0], [67.8, 5605.0], [67.9, 5614.0], [68.0, 5621.0], [68.1, 5628.0], [68.2, 5641.0], [68.3, 5655.0], [68.4, 5662.0], [68.5, 5664.0], [68.6, 5674.0], [68.7, 5684.0], [68.8, 5693.0], [68.9, 5702.0], [69.0, 5709.0], [69.1, 5716.0], [69.2, 5721.0], [69.3, 5733.0], [69.4, 5738.0], [69.5, 5741.0], [69.6, 5750.0], [69.7, 5754.0], [69.8, 5761.0], [69.9, 5777.0], [70.0, 5784.0], [70.1, 5787.0], [70.2, 5790.0], [70.3, 5793.0], [70.4, 5798.0], [70.5, 5804.0], [70.6, 5816.0], [70.7, 5820.0], [70.8, 5825.0], [70.9, 5828.0], [71.0, 5834.0], [71.1, 5841.0], [71.2, 5848.0], [71.3, 5849.0], [71.4, 5852.0], [71.5, 5854.0], [71.6, 5866.0], [71.7, 5870.0], [71.8, 5874.0], [71.9, 5880.0], [72.0, 5901.0], [72.1, 5904.0], [72.2, 5918.0], [72.3, 5934.0], [72.4, 5945.0], [72.5, 5952.0], [72.6, 5957.0], [72.7, 5977.0], [72.8, 5981.0], [72.9, 5988.0], [73.0, 5996.0], [73.1, 6001.0], [73.2, 6011.0], [73.3, 6016.0], [73.4, 6022.0], [73.5, 6024.0], [73.6, 6033.0], [73.7, 6047.0], [73.8, 6050.0], [73.9, 6056.0], [74.0, 6063.0], [74.1, 6074.0], [74.2, 6080.0], [74.3, 6090.0], [74.4, 6094.0], [74.5, 6098.0], [74.6, 6103.0], [74.7, 6112.0], [74.8, 6124.0], [74.9, 6135.0], [75.0, 6143.0], [75.1, 6154.0], [75.2, 6167.0], [75.3, 6172.0], [75.4, 6182.0], [75.5, 6190.0], [75.6, 6199.0], [75.7, 6201.0], [75.8, 6204.0], [75.9, 6216.0], [76.0, 6229.0], [76.1, 6236.0], [76.2, 6251.0], [76.3, 6256.0], [76.4, 6265.0], [76.5, 6272.0], [76.6, 6277.0], [76.7, 6282.0], [76.8, 6287.0], [76.9, 6291.0], [77.0, 6295.0], [77.1, 6306.0], [77.2, 6316.0], [77.3, 6332.0], [77.4, 6342.0], [77.5, 6345.0], [77.6, 6347.0], [77.7, 6354.0], [77.8, 6374.0], [77.9, 6382.0], [78.0, 6405.0], [78.1, 6422.0], [78.2, 6429.0], [78.3, 6434.0], [78.4, 6444.0], [78.5, 6454.0], [78.6, 6459.0], [78.7, 6467.0], [78.8, 6477.0], [78.9, 6485.0], [79.0, 6490.0], [79.1, 6497.0], [79.2, 6504.0], [79.3, 6506.0], [79.4, 6510.0], [79.5, 6519.0], [79.6, 6525.0], [79.7, 6535.0], [79.8, 6549.0], [79.9, 6554.0], [80.0, 6564.0], [80.1, 6566.0], [80.2, 6582.0], [80.3, 6597.0], [80.4, 6606.0], [80.5, 6616.0], [80.6, 6620.0], [80.7, 6624.0], [80.8, 6634.0], [80.9, 6642.0], [81.0, 6647.0], [81.1, 6667.0], [81.2, 6677.0], [81.3, 6687.0], [81.4, 6695.0], [81.5, 6702.0], [81.6, 6707.0], [81.7, 6712.0], [81.8, 6718.0], [81.9, 6731.0], [82.0, 6734.0], [82.1, 6744.0], [82.2, 6756.0], [82.3, 6767.0], [82.4, 6769.0], [82.5, 6779.0], [82.6, 6794.0], [82.7, 6803.0], [82.8, 6812.0], [82.9, 6816.0], [83.0, 6828.0], [83.1, 6840.0], [83.2, 6847.0], [83.3, 6855.0], [83.4, 6864.0], [83.5, 6865.0], [83.6, 6870.0], [83.7, 6895.0], [83.8, 6904.0], [83.9, 6911.0], [84.0, 6925.0], [84.1, 6926.0], [84.2, 6931.0], [84.3, 6940.0], [84.4, 6946.0], [84.5, 6953.0], [84.6, 6965.0], [84.7, 6967.0], [84.8, 6976.0], [84.9, 6981.0], [85.0, 6991.0], [85.1, 7009.0], [85.2, 7016.0], [85.3, 7028.0], [85.4, 7031.0], [85.5, 7038.0], [85.6, 7046.0], [85.7, 7064.0], [85.8, 7081.0], [85.9, 7091.0], [86.0, 7098.0], [86.1, 7109.0], [86.2, 7128.0], [86.3, 7135.0], [86.4, 7147.0], [86.5, 7147.0], [86.6, 7150.0], [86.7, 7159.0], [86.8, 7172.0], [86.9, 7177.0], [87.0, 7202.0], [87.1, 7207.0], [87.2, 7214.0], [87.3, 7222.0], [87.4, 7224.0], [87.5, 7237.0], [87.6, 7248.0], [87.7, 7255.0], [87.8, 7273.0], [87.9, 7289.0], [88.0, 7300.0], [88.1, 7314.0], [88.2, 7322.0], [88.3, 7325.0], [88.4, 7334.0], [88.5, 7340.0], [88.6, 7351.0], [88.7, 7354.0], [88.8, 7365.0], [88.9, 7369.0], [89.0, 7393.0], [89.1, 7399.0], [89.2, 7406.0], [89.3, 7416.0], [89.4, 7419.0], [89.5, 7422.0], [89.6, 7434.0], [89.7, 7445.0], [89.8, 7447.0], [89.9, 7451.0], [90.0, 7476.0], [90.1, 7494.0], [90.2, 7499.0], [90.3, 7514.0], [90.4, 7525.0], [90.5, 7541.0], [90.6, 7554.0], [90.7, 7568.0], [90.8, 7581.0], [90.9, 7589.0], [91.0, 7607.0], [91.1, 7614.0], [91.2, 7629.0], [91.3, 7642.0], [91.4, 7662.0], [91.5, 7673.0], [91.6, 7678.0], [91.7, 7690.0], [91.8, 7697.0], [91.9, 7712.0], [92.0, 7722.0], [92.1, 7747.0], [92.2, 7752.0], [92.3, 7759.0], [92.4, 7776.0], [92.5, 7778.0], [92.6, 7792.0], [92.7, 7813.0], [92.8, 7835.0], [92.9, 7858.0], [93.0, 7880.0], [93.1, 7903.0], [93.2, 7914.0], [93.3, 7930.0], [93.4, 7946.0], [93.5, 7955.0], [93.6, 7972.0], [93.7, 7993.0], [93.8, 8000.0], [93.9, 8004.0], [94.0, 8008.0], [94.1, 8023.0], [94.2, 8034.0], [94.3, 8047.0], [94.4, 8058.0], [94.5, 8099.0], [94.6, 8108.0], [94.7, 8111.0], [94.8, 8117.0], [94.9, 8135.0], [95.0, 8167.0], [95.1, 8189.0], [95.2, 8201.0], [95.3, 8219.0], [95.4, 8248.0], [95.5, 8263.0], [95.6, 8279.0], [95.7, 8293.0], [95.8, 8308.0], [95.9, 8314.0], [96.0, 8337.0], [96.1, 8351.0], [96.2, 8384.0], [96.3, 8391.0], [96.4, 8411.0], [96.5, 8447.0], [96.6, 8466.0], [96.7, 8473.0], [96.8, 8483.0], [96.9, 8488.0], [97.0, 8489.0], [97.1, 8497.0], [97.2, 8504.0], [97.3, 8530.0], [97.4, 8541.0], [97.5, 8548.0], [97.6, 8560.0], [97.7, 8564.0], [97.8, 8583.0], [97.9, 8610.0], [98.0, 8632.0], [98.1, 8646.0], [98.2, 8649.0], [98.3, 8668.0], [98.4, 8679.0], [98.5, 8745.0], [98.6, 8756.0], [98.7, 8779.0], [98.8, 8805.0], [98.9, 8831.0], [99.0, 8864.0], [99.1, 8908.0], [99.2, 8947.0], [99.3, 8995.0], [99.4, 9026.0], [99.5, 9138.0], [99.6, 9174.0], [99.7, 9235.0], [99.8, 9370.0], [99.9, 9439.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 2.0, "minX": 200.0, "maxY": 69.0, "series": [{"data": [[600.0, 29.0], [700.0, 27.0], [800.0, 22.0], [900.0, 25.0], [1000.0, 16.0], [1100.0, 17.0], [1200.0, 25.0], [1300.0, 23.0], [1400.0, 28.0], [1500.0, 13.0], [1600.0, 16.0], [1700.0, 9.0], [1800.0, 20.0], [1900.0, 21.0], [2000.0, 34.0], [2100.0, 37.0], [2300.0, 54.0], [2200.0, 33.0], [2400.0, 54.0], [2500.0, 45.0], [2600.0, 62.0], [2700.0, 57.0], [2800.0, 55.0], [2900.0, 55.0], [3000.0, 45.0], [3100.0, 37.0], [3300.0, 42.0], [3200.0, 49.0], [3400.0, 46.0], [3500.0, 39.0], [3700.0, 47.0], [3600.0, 36.0], [3800.0, 46.0], [3900.0, 36.0], [4000.0, 42.0], [4200.0, 32.0], [4100.0, 40.0], [4300.0, 44.0], [4600.0, 40.0], [4400.0, 38.0], [4500.0, 44.0], [4800.0, 40.0], [4700.0, 35.0], [5100.0, 49.0], [5000.0, 44.0], [4900.0, 44.0], [5200.0, 46.0], [5300.0, 41.0], [5500.0, 38.0], [5400.0, 39.0], [5600.0, 34.0], [5700.0, 47.0], [5800.0, 47.0], [5900.0, 32.0], [6000.0, 44.0], [6100.0, 33.0], [6200.0, 44.0], [6300.0, 27.0], [6500.0, 36.0], [6400.0, 34.0], [6600.0, 35.0], [6800.0, 33.0], [6700.0, 35.0], [6900.0, 39.0], [7000.0, 29.0], [7100.0, 29.0], [7200.0, 30.0], [7400.0, 33.0], [7300.0, 35.0], [7600.0, 25.0], [7500.0, 22.0], [7700.0, 25.0], [7900.0, 21.0], [7800.0, 13.0], [8000.0, 22.0], [8100.0, 20.0], [8200.0, 17.0], [8600.0, 17.0], [8400.0, 24.0], [8500.0, 23.0], [8300.0, 17.0], [8700.0, 10.0], [8800.0, 8.0], [8900.0, 8.0], [9000.0, 5.0], [9100.0, 5.0], [9200.0, 2.0], [9400.0, 4.0], [9300.0, 4.0], [200.0, 20.0], [300.0, 58.0], [400.0, 69.0], [500.0, 29.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 9400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 147.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2611.0, "series": [{"data": [[1.0, 242.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 147.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2611.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 813.7406666666669, "minX": 1.54960776E12, "maxY": 813.7406666666669, "series": [{"data": [[1.54960776E12, 813.7406666666669]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 290.0, "minX": 1.0, "maxY": 9475.0, "series": [{"data": [[2.0, 9178.0], [4.0, 7507.0], [5.0, 8308.0], [6.0, 8384.0], [7.0, 8108.0], [9.0, 7778.0], [10.0, 7262.0], [12.0, 8295.0], [13.0, 8501.0], [14.0, 7862.0], [15.0, 9315.0], [16.0, 9370.0], [17.0, 9174.0], [18.0, 8796.0], [19.0, 8746.0], [20.0, 9393.0], [21.0, 8461.0], [22.0, 9369.0], [23.0, 8135.0], [24.0, 7449.0], [25.0, 7399.0], [26.0, 7399.0], [27.0, 8593.0], [28.0, 7642.0], [29.0, 8408.0], [30.0, 9001.0], [31.0, 8647.0], [33.0, 8834.0], [32.0, 8745.0], [35.0, 7219.0], [34.0, 8495.0], [37.0, 7327.0], [36.0, 7949.0], [39.0, 9231.0], [38.0, 9475.0], [41.0, 7560.0], [40.0, 9439.0], [43.0, 8299.0], [42.0, 7451.0], [45.0, 7750.0], [44.0, 9451.0], [47.0, 7986.0], [46.0, 9235.0], [49.0, 7334.0], [48.0, 8117.0], [50.0, 8266.0], [53.0, 8642.0], [52.0, 7459.5], [54.0, 7255.0], [57.0, 7348.0], [56.0, 8325.5], [59.0, 7447.0], [58.0, 7334.0], [60.0, 7906.0], [63.0, 7652.5], [62.0, 7322.0], [67.0, 7577.0], [66.0, 9057.0], [65.0, 8702.0], [64.0, 8031.0], [71.0, 5166.333333333333], [70.0, 465.0], [69.0, 8002.0], [68.0, 9018.0], [75.0, 1178.3333333333335], [74.0, 2233.222222222222], [73.0, 333.4], [72.0, 2179.75], [79.0, 1736.5], [78.0, 1364.6666666666665], [77.0, 998.5833333333335], [76.0, 1564.5714285714287], [83.0, 1887.2], [82.0, 1776.6], [81.0, 2981.3333333333335], [80.0, 1737.8333333333335], [87.0, 316.0], [85.0, 415.0], [84.0, 1736.1666666666665], [86.0, 4357.75], [89.0, 1576.0], [88.0, 2292.0], [90.0, 347.0], [91.0, 4133.25], [92.0, 290.0], [95.0, 8470.0], [94.0, 7839.0], [93.0, 7975.5], [96.0, 4344.5], [97.0, 3860.0], [99.0, 7673.0], [98.0, 8185.0], [101.0, 3601.5], [103.0, 3699.5], [102.0, 3781.0], [100.0, 7538.0], [105.0, 391.5], [106.0, 3351.8], [107.0, 7080.0], [104.0, 8489.0], [111.0, 3321.0], [110.0, 8219.0], [109.0, 8677.0], [108.0, 7250.0], [114.0, 4533.5], [113.0, 2160.0], [112.0, 1839.3333333333335], [115.0, 3217.3333333333335], [117.0, 3849.5], [119.0, 8218.0], [118.0, 7945.0], [116.0, 8242.0], [123.0, 8473.0], [122.0, 8117.0], [121.0, 7008.0], [120.0, 6823.0], [127.0, 7280.5], [125.0, 8281.0], [124.0, 7419.0], [128.0, 4596.0], [129.0, 3978.0], [135.0, 3692.5], [134.0, 7581.0], [133.0, 8843.0], [132.0, 8158.5], [130.0, 8023.0], [137.0, 4021.5], [141.0, 2771.3333333333335], [140.0, 2670.0], [139.0, 3819.5], [138.0, 3638.5], [142.0, 2688.0], [143.0, 7322.0], [136.0, 8189.0], [145.0, 3976.5], [148.0, 4732.333333333333], [147.0, 3941.5], [149.0, 3883.0], [150.0, 3835.5], [151.0, 8310.0], [144.0, 8404.0], [155.0, 3100.3333333333335], [158.0, 4302.5], [159.0, 6911.0], [157.0, 8774.0], [156.0, 7955.0], [154.0, 7131.0], [153.0, 8286.0], [152.0, 6945.0], [162.0, 634.0], [161.0, 2600.0], [163.0, 5456.0], [165.0, 3816.0], [167.0, 4558.0], [166.0, 8679.0], [164.0, 7147.0], [160.0, 7962.0], [168.0, 2127.75], [170.0, 3784.5], [169.0, 4719.5], [172.0, 657.0], [173.0, 5564.333333333333], [175.0, 8000.0], [174.0, 8779.0], [171.0, 7582.0], [180.0, 3109.0], [181.0, 2723.3333333333335], [182.0, 632.0], [183.0, 7951.0], [179.0, 7972.0], [178.0, 8466.0], [177.0, 8887.0], [176.0, 8483.0], [185.0, 2997.3333333333335], [186.0, 4091.0], [191.0, 2820.6666666666665], [190.0, 4591.5], [189.0, 8656.0], [188.0, 8947.0], [187.0, 6840.0], [184.0, 8485.0], [193.0, 1788.0], [192.0, 4413.5], [195.0, 3850.0], [199.0, 8972.0], [198.0, 7273.0], [197.0, 8414.0], [196.0, 8013.0], [194.0, 6779.0], [200.0, 3955.0], [204.0, 5902.0], [207.0, 7680.0], [206.0, 9026.0], [205.0, 8532.0], [202.0, 7801.0], [209.0, 4397.5], [211.0, 2632.0], [210.0, 4510.5], [213.0, 3355.0], [212.0, 2826.3333333333335], [215.0, 7593.0], [214.0, 7045.0], [208.0, 8003.0], [221.0, 4586.5], [220.0, 3946.0], [223.0, 8624.0], [222.0, 8004.0], [219.0, 6965.0], [218.0, 7858.0], [217.0, 8251.0], [216.0, 7020.0], [226.0, 3123.3333333333335], [229.0, 4226.5], [231.0, 2647.666666666667], [230.0, 2460.0], [228.0, 6647.0], [227.0, 8167.0], [225.0, 8413.0], [224.0, 8981.0], [233.0, 2705.75], [232.0, 3339.0], [239.0, 8831.0], [238.0, 8908.0], [237.0, 7568.0], [236.0, 6626.0], [235.0, 6894.0], [234.0, 6833.0], [242.0, 2270.2], [243.0, 2556.75], [241.0, 4498.0], [240.0, 4620.0], [247.0, 8864.0], [246.0, 8006.0], [245.0, 7176.0], [244.0, 8489.0], [252.0, 2651.5], [251.0, 2415.75], [250.0, 4210.0], [253.0, 3703.0], [255.0, 7778.0], [254.0, 8341.0], [249.0, 7621.0], [248.0, 6906.0], [269.0, 1904.6], [259.0, 4189.0], [258.0, 7927.0], [257.0, 8649.0], [256.0, 7652.0], [262.0, 2880.0], [261.0, 8318.0], [260.0, 8560.0], [263.0, 3921.5], [264.0, 4153.0], [265.0, 7133.0], [270.0, 4713.0], [271.0, 7349.0], [268.0, 6930.0], [267.0, 8196.0], [266.0, 8469.0], [285.0, 2159.0], [275.0, 2568.25], [276.0, 3555.3333333333335], [277.0, 8632.0], [279.0, 7110.0], [272.0, 8488.0], [274.0, 7175.0], [273.0, 7353.0], [278.0, 7792.0], [284.0, 4067.0], [286.0, 4616.0], [287.0, 8593.0], [283.0, 8786.0], [282.0, 6646.0], [281.0, 6667.0], [280.0, 7232.0], [300.0, 4570.5], [289.0, 3932.5], [291.0, 4633.0], [290.0, 7756.0], [293.0, 4295.0], [292.0, 7637.0], [295.0, 7903.0], [288.0, 6755.0], [294.0, 7811.0], [297.0, 4930.0], [299.0, 3985.0], [298.0, 4082.5], [301.0, 4396.0], [302.0, 3642.0], [303.0, 7955.0], [296.0, 7406.0], [319.0, 8045.0], [306.0, 3768.5], [305.0, 3863.5], [304.0, 6712.0], [311.0, 7203.0], [310.0, 8670.0], [309.0, 7416.0], [308.0, 6811.0], [312.0, 955.0], [313.0, 8393.5], [318.0, 7419.0], [317.0, 7558.0], [316.0, 7434.0], [307.0, 7038.0], [315.0, 8195.0], [314.0, 7933.0], [335.0, 4355.0], [323.0, 4539.0], [321.0, 4534.5], [320.0, 8385.0], [322.0, 7365.0], [327.0, 7677.0], [326.0, 6936.0], [325.0, 8103.0], [324.0, 7037.0], [329.0, 3768.5], [328.0, 7247.0], [334.0, 6767.0], [333.0, 8610.0], [332.0, 6864.0], [331.0, 6907.0], [330.0, 7494.0], [348.0, 2929.0], [338.0, 4365.0], [339.0, 4564.5], [342.0, 4237.0], [343.0, 7399.0], [337.0, 7367.0], [336.0, 6824.0], [341.0, 4120.0], [340.0, 7991.0], [347.0, 2246.666666666667], [346.0, 7215.0], [345.0, 7196.0], [344.0, 8538.0], [349.0, 3460.3333333333335], [351.0, 4740.5], [350.0, 7704.0], [355.0, 4581.5], [356.0, 4256.5], [357.0, 2913.666666666667], [360.0, 4782.0], [361.0, 7747.0], [359.0, 3935.5], [353.0, 8500.0], [352.0, 7717.0], [358.0, 8068.0], [362.0, 3594.0], [363.0, 4087.0], [367.0, 4618.0], [366.0, 6429.0], [365.0, 7041.0], [364.0, 6389.0], [383.0, 2251.8], [369.0, 3824.0], [374.0, 6276.0], [368.0, 6272.0], [373.0, 8583.0], [372.0, 7549.0], [381.0, 3989.5], [382.0, 3600.3333333333335], [380.0, 7351.0], [371.0, 8058.0], [370.0, 6746.0], [379.0, 7607.0], [378.0, 8215.0], [377.0, 6727.0], [376.0, 6906.0], [386.0, 2342.0], [384.0, 2418.0], [385.0, 7574.0], [387.0, 3168.0], [397.0, 7697.0], [396.0, 6131.0], [399.0, 7229.0], [398.0, 6324.0], [388.0, 3410.3333333333335], [391.0, 3945.5], [390.0, 3131.0], [389.0, 4738.0], [392.0, 4441.5], [394.0, 3458.6666666666665], [395.0, 4275.0], [393.0, 2724.75], [413.0, 6866.0], [402.0, 3239.666666666667], [401.0, 4255.0], [406.0, 4357.5], [400.0, 6605.0], [405.0, 6170.0], [404.0, 6731.0], [409.0, 3734.5], [408.0, 6725.5], [415.0, 3623.0], [414.0, 3485.3333333333335], [412.0, 6135.0], [403.0, 8039.0], [411.0, 6926.0], [410.0, 6447.0], [430.0, 7431.0], [418.0, 1031.0], [423.0, 3791.5], [417.0, 7693.0], [416.0, 6835.0], [421.0, 7006.5], [425.0, 4786.0], [424.0, 3922.5], [429.0, 3709.0], [431.0, 7206.0], [428.0, 7011.0], [419.0, 6702.0], [427.0, 7513.0], [426.0, 7298.0], [433.0, 3841.0], [434.0, 3637.0], [444.0, 7712.0], [435.0, 6990.0], [436.0, 4274.5], [438.0, 2733.0], [437.0, 4075.5], [439.0, 4533.0], [432.0, 6789.0], [442.0, 3109.666666666667], [441.0, 6485.0], [440.0, 6561.0], [443.0, 7760.0], [445.0, 3984.5], [447.0, 6094.0], [446.0, 6634.0], [463.0, 2755.666666666667], [451.0, 4086.0], [460.0, 5511.0], [450.0, 3534.5], [449.0, 3373.666666666667], [448.0, 5538.0], [455.0, 5637.0], [454.0, 6024.0], [453.0, 6254.0], [452.0, 6967.0], [457.0, 3552.5], [458.0, 2912.666666666667], [459.0, 6566.0], [456.0, 3469.666666666667], [462.0, 2922.0], [461.0, 6476.0], [477.0, 4404.0], [464.0, 1206.0], [465.0, 6671.5], [466.0, 4100.5], [472.0, 2931.0], [471.0, 4308.0], [470.0, 5290.0], [469.0, 6508.0], [468.0, 7029.0], [473.0, 3664.0], [475.0, 2063.8], [474.0, 5586.0], [476.0, 3169.0], [467.0, 6953.0], [479.0, 5929.0], [478.0, 6103.0], [492.0, 3473.5], [481.0, 4084.0], [482.0, 3693.0], [483.0, 6343.0], [486.0, 4141.0], [485.0, 6655.0], [484.0, 6328.0], [487.0, 6616.0], [480.0, 5465.0], [490.0, 4096.0], [489.0, 6170.0], [488.0, 6704.0], [495.0, 4023.0], [494.0, 3617.666666666667], [493.0, 3712.0], [491.0, 5662.0], [509.0, 3971.0], [498.0, 1409.0], [503.0, 6812.0], [497.0, 5504.5], [501.0, 3791.0], [500.0, 5796.0], [502.0, 3419.5], [504.0, 1659.0], [505.0, 4185.0], [507.0, 5839.0], [506.0, 7224.0], [511.0, 5716.0], [510.0, 6586.0], [508.0, 5693.0], [499.0, 5585.0], [518.0, 3264.0], [520.0, 3893.0], [522.0, 6370.0], [521.0, 6846.0], [523.0, 3921.5], [526.0, 3969.3333333333335], [524.0, 6204.0], [527.0, 6996.0], [513.0, 5121.0], [512.0, 5907.0], [515.0, 6106.0], [514.0, 6426.0], [517.0, 6681.0], [516.0, 6375.0], [528.0, 3886.0], [535.0, 3106.5], [534.0, 5581.0], [533.0, 6056.0], [532.0, 6467.0], [531.0, 6183.0], [530.0, 6063.0], [529.0, 6405.0], [539.0, 3598.5], [538.0, 3011.333333333333], [537.0, 6707.0], [536.0, 5316.0], [519.0, 5548.0], [540.0, 3548.0], [541.0, 5831.0], [543.0, 5625.0], [542.0, 5061.0], [570.0, 2422.75], [548.0, 3657.5], [547.0, 8263.0], [546.0, 5160.0], [545.0, 6088.0], [544.0, 5147.0], [550.0, 5790.0], [549.0, 6140.0], [559.0, 5848.0], [558.0, 6011.0], [557.0, 5733.0], [556.0, 7053.0], [555.0, 6374.0], [554.0, 5418.0], [553.0, 5134.0], [552.0, 6791.5], [565.0, 3521.0], [566.0, 4227.5], [567.0, 6560.0], [569.0, 4437.0], [568.0, 3330.5], [574.0, 3477.5], [575.0, 3189.666666666667], [560.0, 6222.0], [562.0, 5295.0], [561.0, 6507.0], [564.0, 7148.0], [563.0, 5641.0], [573.0, 5013.0], [572.0, 5664.0], [571.0, 5410.0], [602.0, 6279.0], [579.0, 3574.5], [576.0, 3727.0], [578.0, 6490.0], [577.0, 6316.0], [591.0, 4746.0], [583.0, 3764.0], [582.0, 4925.0], [581.0, 5299.0], [580.0, 5416.0], [601.0, 7463.0], [600.0, 7993.0], [603.0, 6670.0], [605.0, 8568.0], [604.0, 6861.0], [607.0, 5968.0], [606.0, 5433.0], [585.0, 1466.5], [584.0, 2656.333333333333], [587.0, 3413.333333333333], [586.0, 6416.5], [589.0, 5939.0], [588.0, 7352.0], [590.0, 3889.5], [592.0, 2538.75], [593.0, 1609.0], [595.0, 6342.0], [594.0, 5508.5], [596.0, 3082.666666666667], [598.0, 2552.0], [597.0, 6342.0], [599.0, 6256.0], [633.0, 5496.0], [638.0, 5599.0], [639.0, 5828.0], [625.0, 5880.0], [624.0, 5511.0], [627.0, 8493.0], [626.0, 6902.0], [629.0, 6094.0], [628.0, 5786.0], [637.0, 4915.0], [636.0, 5754.0], [634.0, 4976.0], [632.0, 6645.0], [615.0, 6122.0], [614.0, 5024.0], [613.0, 5630.0], [612.0, 4975.0], [611.0, 6713.0], [610.0, 5369.0], [609.0, 6575.0], [608.0, 5853.0], [623.0, 6079.0], [622.0, 6210.5], [620.0, 5818.0], [619.0, 5538.0], [618.0, 7498.0], [617.0, 4743.0], [616.0, 6048.0], [631.0, 6815.0], [630.0, 5701.0], [655.0, 6794.0], [658.0, 4465.0], [657.0, 4525.0], [656.0, 5168.0], [647.0, 4509.0], [646.0, 5298.0], [645.0, 5496.0], [644.0, 5437.0], [642.0, 8111.0], [641.0, 4666.0], [640.0, 5023.0], [654.0, 5173.0], [653.0, 4682.0], [652.0, 4638.0], [651.0, 5739.0], [650.0, 5571.0], [649.0, 4794.0], [648.0, 6482.0], [701.0, 5993.0], [703.0, 5774.0], [699.0, 5647.5], [698.0, 6239.5], [696.0, 6297.5], [694.0, 5829.791666666667], [678.0, 4688.0], [676.0, 6624.0], [695.0, 6117.222222222223], [732.0, 4735.0], [735.0, 4683.0], [720.0, 6192.0], [723.0, 5849.0], [722.0, 5194.0], [725.0, 6606.0], [724.0, 6177.0], [734.0, 6239.0], [733.0, 6971.0], [731.0, 4980.0], [730.0, 5952.0], [729.0, 5103.0], [728.0, 4321.0], [719.0, 5272.0], [707.0, 5443.0], [705.0, 4950.0], [709.0, 6409.0], [708.0, 6201.0], [711.0, 5399.0], [710.0, 6845.0], [718.0, 5028.0], [717.0, 4947.0], [716.0, 4801.5], [714.0, 5175.5], [713.0, 4458.0], [727.0, 4540.0], [726.0, 5517.5], [760.0, 6454.0], [764.0, 4276.0], [767.0, 6582.0], [753.0, 7629.0], [752.0, 6306.0], [756.0, 4885.5], [754.0, 5790.0], [766.0, 7840.0], [765.0, 5717.0], [763.0, 4779.0], [762.0, 7752.0], [761.0, 6857.0], [751.0, 7687.0], [737.0, 5988.0], [736.0, 5953.0], [739.0, 7887.0], [738.0, 6865.0], [741.0, 7159.0], [740.0, 4270.0], [743.0, 4317.0], [742.0, 4587.0], [750.0, 6347.0], [749.0, 7118.5], [747.0, 6206.0], [746.0, 6895.0], [745.0, 5029.0], [744.0, 4584.0], [759.0, 5797.0], [757.0, 7135.0], [792.0, 2730.5714285714284], [796.0, 2903.1428571428573], [784.0, 4277.5], [785.0, 3984.0], [787.0, 4241.2], [788.0, 3234.0], [791.0, 2719.5], [790.0, 4553.5], [789.0, 3451.666666666667], [797.0, 2949.8], [795.0, 2747.8999999999996], [794.0, 2603.3999999999996], [793.0, 2897.857142857143], [783.0, 6477.0], [769.0, 4175.0], [768.0, 7778.0], [771.0, 7493.0], [770.0, 5951.0], [773.0, 5816.0], [772.0, 5949.0], [775.0, 6188.0], [774.0, 4298.0], [782.0, 5626.0], [781.0, 5543.0], [780.0, 5521.0], [779.0, 5487.0], [778.0, 7084.0], [777.0, 7777.0], [776.0, 6551.0], [799.0, 2875.5], [798.0, 3849.333333333333], [803.0, 3087.666666666667], [802.0, 2816.0], [801.0, 2716.4], [800.0, 2750.6250000000005], [811.0, 3332.333333333333], [812.0, 4012.666666666667], [814.0, 3350.6666666666665], [813.0, 3615.0], [815.0, 3099.6666666666665], [804.0, 3058.6666666666665], [807.0, 2549.8333333333335], [824.0, 3792.5], [825.0, 4011.5], [827.0, 4836.0], [826.0, 5505.0], [828.0, 3718.0], [829.0, 4563.5], [831.0, 3447.5], [830.0, 3217.0], [817.0, 2904.4], [818.0, 3671.25], [819.0, 3976.666666666667], [821.0, 5411.0], [820.0, 5360.0], [823.0, 7393.0], [822.0, 6204.0], [816.0, 3610.25], [809.0, 2962.0], [808.0, 3088.0], [810.0, 2757.75], [806.0, 3126.8], [805.0, 3541.666666666667], [839.0, 2892.3333333333335], [833.0, 2771.0], [832.0, 3232.25], [847.0, 5751.0], [844.0, 3461.666666666667], [845.0, 7523.0], [846.0, 3316.0], [835.0, 4404.6], [836.0, 2885.25], [848.0, 4553.0], [863.0, 3307.666666666667], [862.0, 5604.0], [861.0, 5412.0], [860.0, 5931.0], [857.0, 4203.0], [856.0, 6769.0], [858.0, 6549.0], [859.0, 3015.5], [850.0, 4711.5], [852.0, 6095.0], [851.0, 8656.0], [855.0, 6513.0], [854.0, 6667.5], [849.0, 3299.3333333333335], [838.0, 3930.0], [837.0, 6794.0], [840.0, 4000.333333333333], [841.0, 2973.0], [842.0, 4444.5], [843.0, 4940.5], [891.0, 5105.0], [877.0, 3943.0], [864.0, 4802.0], [865.0, 4366.333333333333], [868.0, 4448.0], [867.0, 5754.0], [866.0, 5720.0], [869.0, 5127.0], [871.0, 5751.0], [870.0, 5513.0], [889.0, 6517.0], [888.0, 5256.0], [892.0, 7386.0], [894.0, 4618.5], [895.0, 2880.75], [893.0, 4181.0], [872.0, 3143.0], [874.0, 5874.0], [873.0, 6067.0], [875.0, 3756.0], [876.0, 4831.0], [879.0, 3675.25], [878.0, 4004.666666666667], [880.0, 3208.75], [881.0, 3431.333333333333], [882.0, 4948.5], [883.0, 3888.666666666667], [884.0, 4694.0], [886.0, 3665.0], [885.0, 5287.0], [887.0, 5429.0], [903.0, 4158.333333333333], [898.0, 3106.6], [896.0, 3583.25], [897.0, 5425.0], [911.0, 4107.0], [901.0, 3223.0], [900.0, 4064.5], [899.0, 5319.0], [913.0, 3265.6666666666665], [914.0, 4888.0], [916.0, 4167.5], [917.0, 6661.0], [919.0, 4628.0], [918.0, 5401.0], [915.0, 3880.0], [912.0, 3638.5], [927.0, 6172.0], [925.0, 5197.666666666667], [926.0, 4591.5], [922.0, 3355.25], [923.0, 4398.5], [921.0, 4026.333333333333], [920.0, 4894.5], [902.0, 3355.75], [907.0, 3242.5], [906.0, 7112.0], [904.0, 5251.0], [910.0, 3503.2], [909.0, 4843.333333333333], [929.0, 3474.0], [940.0, 2970.6666666666665], [928.0, 3749.75], [943.0, 4490.5], [931.0, 3812.5], [930.0, 3649.6666666666665], [934.0, 4622.5], [933.0, 4994.0], [932.0, 5054.0], [952.0, 3905.75], [935.0, 5934.0], [954.0, 3609.25], [955.0, 4383.5], [957.0, 3605.0], [956.0, 5978.0], [958.0, 4188.0], [959.0, 3952.0], [944.0, 7300.0], [953.0, 3515.428571428571], [945.0, 4265.5], [946.0, 3501.6666666666665], [947.0, 4995.5], [950.0, 5087.0], [949.0, 7163.0], [948.0, 6738.0], [951.0, 3639.6666666666665], [938.0, 3302.0], [937.0, 3091.142857142857], [936.0, 3766.0], [939.0, 3090.0], [941.0, 3682.5], [942.0, 4606.0], [985.0, 4123.5], [965.0, 3101.2499999999995], [960.0, 4001.333333333333], [966.0, 3190.222222222222], [964.0, 3263.0], [967.0, 3052.9166666666665], [968.0, 3265.3], [971.0, 5996.0], [970.0, 7284.0], [973.0, 6802.0], [972.0, 6702.0], [975.0, 5482.0], [974.0, 5676.0], [963.0, 4141.5], [962.0, 4995.0], [961.0, 6167.0], [979.0, 2661.5], [980.0, 5307.666666666667], [983.0, 5401.0], [982.0, 5789.0], [981.0, 6714.0], [978.0, 4366.333333333333], [977.0, 3882.75], [976.0, 5984.0], [990.0, 4170.0], [991.0, 4321.5], [989.0, 3762.3333333333335], [988.0, 3563.2], [987.0, 3885.5], [986.0, 4184.0], [984.0, 4662.0], [998.0, 4013.0], [993.0, 4354.5], [992.0, 4355.333333333333], [1004.0, 4320.0], [1006.0, 5792.0], [1005.0, 6292.0], [1007.0, 4409.0], [1003.0, 4689.666666666667], [1002.0, 3480.6666666666665], [995.0, 3661.75], [994.0, 6200.0], [996.0, 3754.75], [999.0, 3954.666666666667], [1016.0, 3666.5], [1010.0, 4189.0], [1021.0, 4230.666666666667], [1019.0, 5565.0], [1018.0, 4917.0], [1022.0, 4161.0], [1023.0, 3806.8], [1009.0, 6444.0], [1008.0, 5211.0], [1015.0, 4463.5], [1014.0, 5125.0], [1013.0, 6157.0], [1012.0, 5250.0], [1011.0, 5873.0], [1017.0, 4103.5], [997.0, 3016.75], [1000.0, 3625.6666666666665], [1001.0, 3607.5], [1028.0, 4768.0], [1032.0, 3005.333333333333], [1024.0, 4277.0], [1054.0, 5341.0], [1052.0, 3277.0], [1044.0, 3948.0], [1048.0, 4411.5], [1050.0, 7748.0], [1042.0, 4413.5], [1040.0, 4987.0], [1026.0, 3507.8333333333335], [1030.0, 3883.0], [1038.0, 4567.666666666667], [1074.0, 5525.0], [1072.0, 4593.0], [1058.0, 4905.5], [1056.0, 6445.0], [1060.0, 5736.0], [1086.0, 3894.5], [1082.0, 5035.5], [1084.0, 4920.0], [1080.0, 3936.0], [1076.0, 4771.5], [1078.0, 4581.0], [1062.0, 4579.0], [1064.0, 4030.3333333333335], [1068.0, 3468.8], [1066.0, 5804.0], [1036.0, 3902.3333333333335], [1034.0, 5586.0], [1136.0, 3506.1428571428573], [1088.0, 4351.0], [1118.0, 3766.5], [1110.0, 4190.5], [1112.0, 3858.0], [1116.0, 5008.0], [1114.0, 4993.0], [1104.0, 4032.5], [1108.0, 5531.0], [1106.0, 6282.0], [1090.0, 3423.5], [1092.0, 3038.1428571428573], [1094.0, 3839.0], [1096.0, 3945.3333333333335], [1098.0, 5617.0], [1102.0, 7499.0], [1100.0, 5709.0], [1140.0, 4441.333333333333], [1138.0, 4701.0], [1144.0, 4764.0], [1146.0, 3683.6666666666665], [1148.0, 4243.0], [1150.0, 3623.0], [1142.0, 3565.6666666666665], [1120.0, 4359.75], [1126.0, 4505.5], [1128.0, 4552.2], [1134.0, 3977.6], [1132.0, 4544.0], [1130.0, 6058.0], [1124.0, 4567.5], [1122.0, 5104.0], [1156.0, 3422.166666666667], [1154.0, 4295.333333333333], [1182.0, 5436.0], [1152.0, 5597.0], [1170.0, 4431.5], [1168.0, 4421.0], [1174.0, 5698.0], [1172.0, 5314.0], [1178.0, 4449.0], [1176.0, 4591.0], [1180.0, 3730.0], [1160.0, 3678.8], [1158.0, 5825.0], [1162.0, 3677.75], [1166.0, 5010.5], [1200.0, 4496.0], [1192.0, 4188.666666666667], [1196.0, 3540.6666666666665], [1198.0, 3516.0], [1186.0, 2901.0], [1190.0, 4294.0], [1188.0, 4559.0], [1214.0, 4559.0], [1184.0, 4893.0], [1212.0, 4337.0], [1210.0, 4295.5], [1208.0, 3997.75], [1206.0, 4103.0], [1204.0, 6001.0], [1202.0, 4001.3333333333335], [1230.0, 3586.0], [1216.0, 5169.666666666667], [1246.0, 3842.0], [1244.0, 5670.0], [1242.0, 5139.0], [1240.0, 3955.3333333333335], [1238.0, 4638.0], [1234.0, 3895.0], [1232.0, 4173.0], [1236.0, 5067.0], [1222.0, 4089.0], [1220.0, 4359.0], [1218.0, 4634.0], [1224.0, 3705.3333333333335], [1228.0, 4076.6666666666665], [1226.0, 5296.0], [1264.0, 3987.6666666666665], [1266.0, 4028.0], [1268.0, 4359.0], [1278.0, 3661.5], [1276.0, 5216.0], [1274.0, 4004.0], [1272.0, 4722.0], [1270.0, 5004.0], [1248.0, 3419.6666666666665], [1250.0, 3568.4], [1254.0, 4628.0], [1252.0, 5493.0], [1256.0, 4104.666666666667], [1262.0, 4091.5], [1260.0, 4845.0], [1258.0, 4199.0], [1284.0, 4280.5], [1286.0, 3691.0], [1280.0, 4183.5], [1308.0, 3661.6666666666665], [1310.0, 4014.4], [1304.0, 4753.0], [1302.0, 6500.0], [1306.0, 3951.5], [1300.0, 4208.5], [1296.0, 4330.0], [1298.0, 3780.0], [1282.0, 3967.0], [1292.0, 4232.5], [1294.0, 4315.5], [1328.0, 4658.0], [1330.0, 3834.0], [1332.0, 4435.0], [1334.0, 4136.333333333333], [1340.0, 4192.0], [1342.0, 3350.0], [1338.0, 4550.666666666667], [1336.0, 3848.0], [1312.0, 3654.909090909091], [1314.0, 4505.333333333333], [1316.0, 4055.6666666666665], [1318.0, 3823.5], [1322.0, 3799.6666666666665], [1324.0, 3865.2], [1326.0, 3687.0], [1320.0, 4008.090909090909], [1290.0, 4905.666666666667], [1288.0, 3394.6666666666665], [1350.0, 4224.857142857143], [1354.0, 4529.5], [1344.0, 4303.0], [1346.0, 5184.0], [1374.0, 3749.0], [1372.0, 3979.0], [1366.0, 5140.0], [1362.0, 4159.0], [1360.0, 6564.0], [1368.0, 4325.0], [1370.0, 4290.0], [1348.0, 3971.0], [1352.0, 3973.0], [1356.0, 3954.0], [1358.0, 5027.0], [1392.0, 4543.0], [1396.0, 4710.0], [1394.0, 4858.0], [1398.0, 4927.5], [1404.0, 3648.5], [1402.0, 4634.0], [1400.0, 4504.0], [1406.0, 3913.6666666666665], [1378.0, 5114.0], [1380.0, 3944.0], [1382.0, 4209.333333333333], [1384.0, 4303.0], [1386.0, 4029.0], [1388.0, 3764.0], [1390.0, 3701.0], [1376.0, 3799.6666666666665], [1464.0, 3618.0], [1408.0, 4269.0], [1438.0, 4182.0], [1436.0, 6033.0], [1434.0, 3626.0], [1432.0, 4444.0], [1428.0, 3984.1666666666665], [1430.0, 4326.0], [1410.0, 4235.0], [1446.0, 5535.0], [1444.0, 3766.0], [1442.0, 3483.0], [1440.0, 6023.0], [1448.0, 4312.0], [1468.0, 3822.0], [1470.0, 5996.0], [1466.0, 4249.0], [1460.0, 5212.0], [1462.0, 4765.333333333333], [1456.0, 5151.0], [1422.0, 4926.0], [1420.0, 3805.0], [1418.0, 4175.0], [1458.0, 3863.0], [1450.0, 3857.5], [1452.0, 5102.0], [1454.0, 5513.5], [1416.0, 4147.0], [1414.0, 4066.0], [1412.0, 4149.0], [1424.0, 4298.5], [1426.0, 3098.0], [1478.0, 4863.8], [1512.0, 4277.0], [1472.0, 4179.0], [1474.0, 5477.0], [1502.0, 4661.0], [1500.0, 3233.0], [1498.0, 5730.0], [1496.0, 4174.0], [1494.0, 3819.0], [1492.0, 5511.0], [1490.0, 4196.0], [1488.0, 3806.0], [1476.0, 4054.0], [1518.0, 4991.0], [1516.0, 4701.0], [1514.0, 3509.0], [1510.0, 4912.5], [1508.0, 4993.0], [1506.0, 5738.0], [1504.0, 4920.5], [1486.0, 4030.5], [1484.0, 5342.0], [1482.0, 5016.0], [1480.0, 6040.0], [1077.0, 3387.3333333333335], [1031.0, 3773.3333333333335], [1041.0, 4022.0], [1045.0, 4636.0], [1043.0, 4522.0], [1049.0, 6796.0], [1047.0, 6329.5], [1053.0, 6060.5], [1025.0, 6497.0], [1051.0, 4952.0], [1027.0, 3460.0], [1029.0, 5137.0], [1033.0, 4146.2], [1035.0, 3561.5], [1037.0, 2993.0], [1039.0, 5772.0], [1087.0, 3735.75], [1081.0, 3892.5], [1083.0, 2881.6666666666665], [1085.0, 5394.0], [1079.0, 4649.0], [1073.0, 4403.0], [1075.0, 4441.0], [1061.0, 3569.3333333333335], [1059.0, 6642.0], [1057.0, 5202.0], [1063.0, 4334.333333333333], [1065.0, 5496.0], [1067.0, 4032.0], [1071.0, 4964.0], [1069.0, 6124.0], [1091.0, 4216.0], [1095.0, 4298.0], [1115.0, 3862.5], [1113.0, 4855.0], [1117.0, 5276.0], [1107.0, 4268.0], [1109.0, 6382.0], [1111.0, 4074.5], [1105.0, 2935.75], [1089.0, 4302.0], [1119.0, 5589.0], [1093.0, 3204.8749999999995], [1141.0, 3485.25], [1137.0, 4814.0], [1103.0, 6459.0], [1101.0, 6112.0], [1099.0, 5369.0], [1097.0, 5674.0], [1143.0, 3931.0], [1123.0, 3978.5], [1121.0, 5825.0], [1151.0, 5645.0], [1149.0, 5833.0], [1147.0, 4731.0], [1145.0, 4949.0], [1125.0, 3558.0], [1127.0, 4169.5], [1129.0, 4890.5], [1131.0, 3518.5], [1133.0, 4063.0], [1135.0, 3043.6666666666665], [1165.0, 4528.333333333333], [1157.0, 4209.333333333333], [1181.0, 3931.0], [1179.0, 4999.0], [1177.0, 4664.0], [1175.0, 5493.0], [1173.0, 6847.0], [1171.0, 4437.0], [1169.0, 5126.0], [1155.0, 3567.6666666666665], [1153.0, 4567.0], [1183.0, 4650.0], [1163.0, 3163.3333333333335], [1167.0, 3905.0], [1201.0, 6727.0], [1187.0, 4736.666666666667], [1197.0, 4510.0], [1199.0, 4129.2], [1195.0, 4792.333333333333], [1191.0, 3847.0], [1189.0, 4350.0], [1193.0, 4440.0], [1209.0, 3457.5], [1211.0, 6190.0], [1215.0, 4862.0], [1185.0, 5005.0], [1213.0, 7091.0], [1207.0, 3600.75], [1205.0, 3867.0], [1203.0, 4030.6666666666665], [1161.0, 3086.1111111111113], [1159.0, 4616.0], [1223.0, 4004.3333333333335], [1247.0, 3580.8], [1241.0, 4436.25], [1245.0, 6828.0], [1243.0, 4404.0], [1239.0, 4057.6], [1235.0, 4492.5], [1233.0, 5760.0], [1237.0, 5270.0], [1219.0, 3419.5], [1217.0, 7237.0], [1221.0, 5373.0], [1229.0, 3419.0], [1227.0, 5457.0], [1225.0, 4338.0], [1231.0, 3552.0], [1271.0, 4691.333333333333], [1269.0, 7031.0], [1267.0, 5031.0], [1265.0, 5690.0], [1279.0, 3972.5], [1277.0, 3412.0], [1275.0, 5708.0], [1273.0, 4263.0], [1249.0, 3299.6], [1251.0, 4130.0], [1253.0, 5655.0], [1255.0, 3640.6666666666665], [1263.0, 5803.0], [1261.0, 4256.0], [1259.0, 5621.0], [1257.0, 4310.0], [1281.0, 4483.0], [1307.0, 5380.0], [1309.0, 4465.0], [1311.0, 3899.928571428571], [1305.0, 4241.0], [1303.0, 4315.0], [1301.0, 3707.5], [1299.0, 5093.0], [1297.0, 4175.333333333333], [1287.0, 3873.0], [1285.0, 3962.0], [1283.0, 4824.0], [1291.0, 3648.6666666666665], [1295.0, 5238.0], [1329.0, 5660.0], [1331.0, 5404.0], [1333.0, 4608.857142857143], [1335.0, 3846.3333333333335], [1339.0, 3667.5], [1343.0, 5051.0], [1341.0, 3749.0], [1337.0, 3932.0], [1317.0, 4704.0], [1321.0, 3707.25], [1325.0, 4519.0], [1327.0, 4950.0], [1323.0, 3690.5], [1319.0, 3799.625], [1313.0, 3668.769230769231], [1293.0, 3900.2], [1289.0, 3736.0], [1351.0, 3930.75], [1349.0, 4086.1], [1345.0, 4020.0], [1375.0, 6271.0], [1373.0, 4597.5], [1371.0, 4095.6666666666665], [1367.0, 3892.0], [1365.0, 4209.0], [1363.0, 4953.0], [1361.0, 4159.0], [1369.0, 4583.333333333333], [1353.0, 3760.0], [1347.0, 4174.5], [1355.0, 4584.0], [1357.0, 4152.0], [1359.0, 5876.0], [1393.0, 3806.0], [1397.0, 4239.0], [1399.0, 4125.5], [1403.0, 3792.0], [1401.0, 3925.0], [1405.0, 4310.0], [1407.0, 4495.0], [1377.0, 4662.5], [1379.0, 6236.0], [1381.0, 5068.0], [1383.0, 3792.8], [1387.0, 3929.25], [1385.0, 6519.0], [1389.0, 4046.0], [1391.0, 4609.0], [1417.0, 4383.5], [1433.0, 4934.333333333333], [1409.0, 4266.4], [1439.0, 4243.5], [1437.0, 4860.0], [1435.0, 4306.5], [1431.0, 4688.0], [1429.0, 3939.5], [1411.0, 4249.666666666667], [1445.0, 3625.0], [1443.0, 6232.0], [1441.0, 5290.0], [1447.0, 3578.0], [1469.0, 4789.5], [1471.0, 4739.0], [1467.0, 3970.0], [1465.0, 4660.5], [1463.0, 5901.0], [1461.0, 5171.5], [1457.0, 4316.5], [1423.0, 6098.0], [1421.0, 4858.0], [1419.0, 4866.0], [1459.0, 4253.75], [1449.0, 4729.666666666667], [1451.0, 3697.5], [1453.0, 4449.0], [1455.0, 4428.333333333333], [1415.0, 6267.0], [1413.0, 4988.0], [1425.0, 4249.0], [1427.0, 4116.285714285714], [1477.0, 4451.6], [1473.0, 5060.0], [1501.0, 4835.0], [1499.0, 5904.0], [1497.0, 4129.0], [1495.0, 5302.0], [1493.0, 5208.0], [1491.0, 5372.0], [1489.0, 4507.0], [1475.0, 4573.333333333333], [1479.0, 4180.0], [1519.0, 4855.0], [1517.0, 5793.0], [1515.0, 4545.0], [1513.0, 5754.0], [1511.0, 4266.0], [1507.0, 4688.0], [1505.0, 3702.0], [1487.0, 5003.0], [1483.0, 4593.0], [1481.0, 3761.0], [1.0, 9433.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[813.7406666666669, 4368.036666666667]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1519.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12600.0, "minX": 1.54960776E12, "maxY": 21047.9, "series": [{"data": [[1.54960776E12, 21047.9]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960776E12, 12600.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 4368.036666666667, "minX": 1.54960776E12, "maxY": 4368.036666666667, "series": [{"data": [[1.54960776E12, 4368.036666666667]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960776E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 4368.029333333344, "minX": 1.54960776E12, "maxY": 4368.029333333344, "series": [{"data": [[1.54960776E12, 4368.029333333344]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960776E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 48.10800000000002, "minX": 1.54960776E12, "maxY": 48.10800000000002, "series": [{"data": [[1.54960776E12, 48.10800000000002]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960776E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 208.0, "minX": 1.54960776E12, "maxY": 9475.0, "series": [{"data": [[1.54960776E12, 9475.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960776E12, 208.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960776E12, 7474.700000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960776E12, 8863.789999999995]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960776E12, 8166.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4327.0, "minX": 50.0, "maxY": 4327.0, "series": [{"data": [[50.0, 4327.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4327.0, "minX": 50.0, "maxY": 4327.0, "series": [{"data": [[50.0, 4327.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960776E12, "maxY": 50.0, "series": [{"data": [[1.54960776E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960776E12, "maxY": 50.0, "series": [{"data": [[1.54960776E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960776E12, "maxY": 50.0, "series": [{"data": [[1.54960776E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960776E12, "title": "Transactions Per Second"}},
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
