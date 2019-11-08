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
        data: {"result": {"minY": 227.0, "minX": 0.0, "maxY": 7410.0, "series": [{"data": [[0.0, 227.0], [0.1, 242.0], [0.2, 244.0], [0.3, 244.0], [0.4, 263.0], [0.5, 271.0], [0.6, 275.0], [0.7, 285.0], [0.8, 291.0], [0.9, 293.0], [1.0, 294.0], [1.1, 294.0], [1.2, 298.0], [1.3, 304.0], [1.4, 304.0], [1.5, 308.0], [1.6, 311.0], [1.7, 313.0], [1.8, 314.0], [1.9, 315.0], [2.0, 316.0], [2.1, 318.0], [2.2, 318.0], [2.3, 321.0], [2.4, 321.0], [2.5, 323.0], [2.6, 323.0], [2.7, 325.0], [2.8, 327.0], [2.9, 328.0], [3.0, 329.0], [3.1, 331.0], [3.2, 334.0], [3.3, 339.0], [3.4, 340.0], [3.5, 345.0], [3.6, 349.0], [3.7, 352.0], [3.8, 358.0], [3.9, 359.0], [4.0, 374.0], [4.1, 375.0], [4.2, 375.0], [4.3, 383.0], [4.4, 384.0], [4.5, 386.0], [4.6, 395.0], [4.7, 406.0], [4.8, 406.0], [4.9, 415.0], [5.0, 425.0], [5.1, 426.0], [5.2, 428.0], [5.3, 433.0], [5.4, 448.0], [5.5, 448.0], [5.6, 452.0], [5.7, 455.0], [5.8, 456.0], [5.9, 464.0], [6.0, 470.0], [6.1, 471.0], [6.2, 483.0], [6.3, 487.0], [6.4, 496.0], [6.5, 502.0], [6.6, 505.0], [6.7, 510.0], [6.8, 521.0], [6.9, 529.0], [7.0, 529.0], [7.1, 531.0], [7.2, 538.0], [7.3, 546.0], [7.4, 562.0], [7.5, 581.0], [7.6, 586.0], [7.7, 587.0], [7.8, 595.0], [7.9, 602.0], [8.0, 608.0], [8.1, 609.0], [8.2, 616.0], [8.3, 618.0], [8.4, 620.0], [8.5, 626.0], [8.6, 635.0], [8.7, 646.0], [8.8, 648.0], [8.9, 661.0], [9.0, 662.0], [9.1, 662.0], [9.2, 666.0], [9.3, 677.0], [9.4, 678.0], [9.5, 679.0], [9.6, 692.0], [9.7, 705.0], [9.8, 705.0], [9.9, 720.0], [10.0, 726.0], [10.1, 728.0], [10.2, 737.0], [10.3, 755.0], [10.4, 755.0], [10.5, 755.0], [10.6, 773.0], [10.7, 775.0], [10.8, 779.0], [10.9, 779.0], [11.0, 781.0], [11.1, 804.0], [11.2, 816.0], [11.3, 834.0], [11.4, 841.0], [11.5, 856.0], [11.6, 858.0], [11.7, 865.0], [11.8, 866.0], [11.9, 876.0], [12.0, 885.0], [12.1, 899.0], [12.2, 908.0], [12.3, 910.0], [12.4, 913.0], [12.5, 917.0], [12.6, 923.0], [12.7, 945.0], [12.8, 949.0], [12.9, 949.0], [13.0, 969.0], [13.1, 975.0], [13.2, 978.0], [13.3, 992.0], [13.4, 992.0], [13.5, 997.0], [13.6, 1001.0], [13.7, 1002.0], [13.8, 1016.0], [13.9, 1018.0], [14.0, 1024.0], [14.1, 1024.0], [14.2, 1032.0], [14.3, 1047.0], [14.4, 1054.0], [14.5, 1061.0], [14.6, 1069.0], [14.7, 1076.0], [14.8, 1076.0], [14.9, 1085.0], [15.0, 1085.0], [15.1, 1086.0], [15.2, 1087.0], [15.3, 1088.0], [15.4, 1090.0], [15.5, 1094.0], [15.6, 1105.0], [15.7, 1108.0], [15.8, 1128.0], [15.9, 1132.0], [16.0, 1145.0], [16.1, 1151.0], [16.2, 1156.0], [16.3, 1158.0], [16.4, 1173.0], [16.5, 1189.0], [16.6, 1191.0], [16.7, 1215.0], [16.8, 1221.0], [16.9, 1232.0], [17.0, 1234.0], [17.1, 1241.0], [17.2, 1246.0], [17.3, 1246.0], [17.4, 1265.0], [17.5, 1266.0], [17.6, 1267.0], [17.7, 1267.0], [17.8, 1271.0], [17.9, 1273.0], [18.0, 1301.0], [18.1, 1309.0], [18.2, 1311.0], [18.3, 1316.0], [18.4, 1322.0], [18.5, 1325.0], [18.6, 1326.0], [18.7, 1353.0], [18.8, 1362.0], [18.9, 1379.0], [19.0, 1396.0], [19.1, 1412.0], [19.2, 1412.0], [19.3, 1425.0], [19.4, 1471.0], [19.5, 1474.0], [19.6, 1485.0], [19.7, 1489.0], [19.8, 1493.0], [19.9, 1518.0], [20.0, 1519.0], [20.1, 1527.0], [20.2, 1541.0], [20.3, 1550.0], [20.4, 1551.0], [20.5, 1552.0], [20.6, 1556.0], [20.7, 1562.0], [20.8, 1563.0], [20.9, 1592.0], [21.0, 1594.0], [21.1, 1615.0], [21.2, 1618.0], [21.3, 1641.0], [21.4, 1666.0], [21.5, 1667.0], [21.6, 1695.0], [21.7, 1700.0], [21.8, 1724.0], [21.9, 1732.0], [22.0, 1742.0], [22.1, 1766.0], [22.2, 1766.0], [22.3, 1828.0], [22.4, 1831.0], [22.5, 1844.0], [22.6, 1845.0], [22.7, 1875.0], [22.8, 1927.0], [22.9, 1957.0], [23.0, 2030.0], [23.1, 2083.0], [23.2, 2134.0], [23.3, 2186.0], [23.4, 2196.0], [23.5, 2197.0], [23.6, 2203.0], [23.7, 2245.0], [23.8, 2247.0], [23.9, 2273.0], [24.0, 2287.0], [24.1, 2288.0], [24.2, 2290.0], [24.3, 2298.0], [24.4, 2313.0], [24.5, 2316.0], [24.6, 2344.0], [24.7, 2345.0], [24.8, 2352.0], [24.9, 2358.0], [25.0, 2361.0], [25.1, 2376.0], [25.2, 2399.0], [25.3, 2404.0], [25.4, 2404.0], [25.5, 2407.0], [25.6, 2408.0], [25.7, 2421.0], [25.8, 2431.0], [25.9, 2432.0], [26.0, 2443.0], [26.1, 2447.0], [26.2, 2460.0], [26.3, 2462.0], [26.4, 2478.0], [26.5, 2482.0], [26.6, 2497.0], [26.7, 2501.0], [26.8, 2530.0], [26.9, 2533.0], [27.0, 2541.0], [27.1, 2546.0], [27.2, 2547.0], [27.3, 2548.0], [27.4, 2548.0], [27.5, 2548.0], [27.6, 2561.0], [27.7, 2568.0], [27.8, 2577.0], [27.9, 2595.0], [28.0, 2600.0], [28.1, 2613.0], [28.2, 2615.0], [28.3, 2618.0], [28.4, 2628.0], [28.5, 2631.0], [28.6, 2667.0], [28.7, 2680.0], [28.8, 2686.0], [28.9, 2696.0], [29.0, 2757.0], [29.1, 2757.0], [29.2, 2767.0], [29.3, 2770.0], [29.4, 2779.0], [29.5, 2786.0], [29.6, 2794.0], [29.7, 2820.0], [29.8, 2824.0], [29.9, 2835.0], [30.0, 2836.0], [30.1, 2842.0], [30.2, 2847.0], [30.3, 2854.0], [30.4, 2861.0], [30.5, 2866.0], [30.6, 2868.0], [30.7, 2870.0], [30.8, 2871.0], [30.9, 2887.0], [31.0, 2898.0], [31.1, 2899.0], [31.2, 2905.0], [31.3, 2913.0], [31.4, 2915.0], [31.5, 2943.0], [31.6, 2943.0], [31.7, 2945.0], [31.8, 2951.0], [31.9, 2955.0], [32.0, 2970.0], [32.1, 2983.0], [32.2, 2994.0], [32.3, 3006.0], [32.4, 3016.0], [32.5, 3035.0], [32.6, 3038.0], [32.7, 3057.0], [32.8, 3061.0], [32.9, 3062.0], [33.0, 3064.0], [33.1, 3085.0], [33.2, 3087.0], [33.3, 3090.0], [33.4, 3103.0], [33.5, 3105.0], [33.6, 3133.0], [33.7, 3141.0], [33.8, 3158.0], [33.9, 3169.0], [34.0, 3170.0], [34.1, 3172.0], [34.2, 3185.0], [34.3, 3187.0], [34.4, 3188.0], [34.5, 3189.0], [34.6, 3191.0], [34.7, 3193.0], [34.8, 3194.0], [34.9, 3201.0], [35.0, 3201.0], [35.1, 3203.0], [35.2, 3203.0], [35.3, 3211.0], [35.4, 3233.0], [35.5, 3238.0], [35.6, 3254.0], [35.7, 3257.0], [35.8, 3265.0], [35.9, 3267.0], [36.0, 3274.0], [36.1, 3276.0], [36.2, 3284.0], [36.3, 3288.0], [36.4, 3290.0], [36.5, 3294.0], [36.6, 3303.0], [36.7, 3304.0], [36.8, 3328.0], [36.9, 3356.0], [37.0, 3357.0], [37.1, 3359.0], [37.2, 3379.0], [37.3, 3390.0], [37.4, 3402.0], [37.5, 3414.0], [37.6, 3422.0], [37.7, 3423.0], [37.8, 3437.0], [37.9, 3440.0], [38.0, 3444.0], [38.1, 3456.0], [38.2, 3468.0], [38.3, 3471.0], [38.4, 3476.0], [38.5, 3480.0], [38.6, 3481.0], [38.7, 3485.0], [38.8, 3486.0], [38.9, 3494.0], [39.0, 3494.0], [39.1, 3499.0], [39.2, 3507.0], [39.3, 3519.0], [39.4, 3536.0], [39.5, 3537.0], [39.6, 3538.0], [39.7, 3551.0], [39.8, 3552.0], [39.9, 3566.0], [40.0, 3570.0], [40.1, 3573.0], [40.2, 3582.0], [40.3, 3587.0], [40.4, 3598.0], [40.5, 3604.0], [40.6, 3605.0], [40.7, 3609.0], [40.8, 3612.0], [40.9, 3619.0], [41.0, 3625.0], [41.1, 3628.0], [41.2, 3630.0], [41.3, 3633.0], [41.4, 3638.0], [41.5, 3639.0], [41.6, 3641.0], [41.7, 3641.0], [41.8, 3642.0], [41.9, 3647.0], [42.0, 3647.0], [42.1, 3649.0], [42.2, 3655.0], [42.3, 3670.0], [42.4, 3683.0], [42.5, 3687.0], [42.6, 3690.0], [42.7, 3694.0], [42.8, 3710.0], [42.9, 3712.0], [43.0, 3714.0], [43.1, 3721.0], [43.2, 3735.0], [43.3, 3735.0], [43.4, 3737.0], [43.5, 3740.0], [43.6, 3741.0], [43.7, 3742.0], [43.8, 3747.0], [43.9, 3755.0], [44.0, 3765.0], [44.1, 3770.0], [44.2, 3771.0], [44.3, 3772.0], [44.4, 3772.0], [44.5, 3777.0], [44.6, 3777.0], [44.7, 3783.0], [44.8, 3785.0], [44.9, 3785.0], [45.0, 3788.0], [45.1, 3790.0], [45.2, 3790.0], [45.3, 3800.0], [45.4, 3801.0], [45.5, 3805.0], [45.6, 3812.0], [45.7, 3814.0], [45.8, 3815.0], [45.9, 3824.0], [46.0, 3829.0], [46.1, 3842.0], [46.2, 3850.0], [46.3, 3852.0], [46.4, 3854.0], [46.5, 3854.0], [46.6, 3861.0], [46.7, 3873.0], [46.8, 3885.0], [46.9, 3893.0], [47.0, 3899.0], [47.1, 3900.0], [47.2, 3903.0], [47.3, 3905.0], [47.4, 3911.0], [47.5, 3913.0], [47.6, 3919.0], [47.7, 3923.0], [47.8, 3924.0], [47.9, 3930.0], [48.0, 3939.0], [48.1, 3948.0], [48.2, 3950.0], [48.3, 3956.0], [48.4, 3966.0], [48.5, 3972.0], [48.6, 3976.0], [48.7, 3981.0], [48.8, 3983.0], [48.9, 3983.0], [49.0, 3986.0], [49.1, 3989.0], [49.2, 3993.0], [49.3, 4007.0], [49.4, 4008.0], [49.5, 4008.0], [49.6, 4009.0], [49.7, 4014.0], [49.8, 4017.0], [49.9, 4018.0], [50.0, 4020.0], [50.1, 4025.0], [50.2, 4027.0], [50.3, 4028.0], [50.4, 4033.0], [50.5, 4034.0], [50.6, 4036.0], [50.7, 4037.0], [50.8, 4039.0], [50.9, 4042.0], [51.0, 4046.0], [51.1, 4046.0], [51.2, 4054.0], [51.3, 4056.0], [51.4, 4057.0], [51.5, 4057.0], [51.6, 4062.0], [51.7, 4068.0], [51.8, 4068.0], [51.9, 4072.0], [52.0, 4072.0], [52.1, 4073.0], [52.2, 4089.0], [52.3, 4096.0], [52.4, 4097.0], [52.5, 4098.0], [52.6, 4103.0], [52.7, 4104.0], [52.8, 4105.0], [52.9, 4108.0], [53.0, 4115.0], [53.1, 4117.0], [53.2, 4118.0], [53.3, 4119.0], [53.4, 4120.0], [53.5, 4122.0], [53.6, 4126.0], [53.7, 4126.0], [53.8, 4139.0], [53.9, 4140.0], [54.0, 4147.0], [54.1, 4149.0], [54.2, 4152.0], [54.3, 4158.0], [54.4, 4170.0], [54.5, 4170.0], [54.6, 4180.0], [54.7, 4182.0], [54.8, 4182.0], [54.9, 4184.0], [55.0, 4186.0], [55.1, 4188.0], [55.2, 4191.0], [55.3, 4196.0], [55.4, 4200.0], [55.5, 4209.0], [55.6, 4211.0], [55.7, 4219.0], [55.8, 4223.0], [55.9, 4226.0], [56.0, 4232.0], [56.1, 4232.0], [56.2, 4237.0], [56.3, 4240.0], [56.4, 4241.0], [56.5, 4242.0], [56.6, 4244.0], [56.7, 4246.0], [56.8, 4257.0], [56.9, 4261.0], [57.0, 4262.0], [57.1, 4265.0], [57.2, 4266.0], [57.3, 4267.0], [57.4, 4268.0], [57.5, 4270.0], [57.6, 4271.0], [57.7, 4272.0], [57.8, 4274.0], [57.9, 4279.0], [58.0, 4280.0], [58.1, 4281.0], [58.2, 4285.0], [58.3, 4287.0], [58.4, 4288.0], [58.5, 4291.0], [58.6, 4292.0], [58.7, 4293.0], [58.8, 4295.0], [58.9, 4299.0], [59.0, 4301.0], [59.1, 4302.0], [59.2, 4303.0], [59.3, 4303.0], [59.4, 4304.0], [59.5, 4306.0], [59.6, 4307.0], [59.7, 4310.0], [59.8, 4311.0], [59.9, 4320.0], [60.0, 4321.0], [60.1, 4324.0], [60.2, 4325.0], [60.3, 4330.0], [60.4, 4332.0], [60.5, 4333.0], [60.6, 4333.0], [60.7, 4336.0], [60.8, 4338.0], [60.9, 4340.0], [61.0, 4343.0], [61.1, 4344.0], [61.2, 4345.0], [61.3, 4350.0], [61.4, 4355.0], [61.5, 4356.0], [61.6, 4361.0], [61.7, 4362.0], [61.8, 4365.0], [61.9, 4366.0], [62.0, 4366.0], [62.1, 4369.0], [62.2, 4372.0], [62.3, 4373.0], [62.4, 4376.0], [62.5, 4381.0], [62.6, 4383.0], [62.7, 4386.0], [62.8, 4389.0], [62.9, 4390.0], [63.0, 4390.0], [63.1, 4392.0], [63.2, 4396.0], [63.3, 4398.0], [63.4, 4399.0], [63.5, 4400.0], [63.6, 4400.0], [63.7, 4401.0], [63.8, 4402.0], [63.9, 4403.0], [64.0, 4406.0], [64.1, 4406.0], [64.2, 4407.0], [64.3, 4407.0], [64.4, 4408.0], [64.5, 4412.0], [64.6, 4413.0], [64.7, 4414.0], [64.8, 4417.0], [64.9, 4419.0], [65.0, 4420.0], [65.1, 4423.0], [65.2, 4433.0], [65.3, 4435.0], [65.4, 4439.0], [65.5, 4443.0], [65.6, 4443.0], [65.7, 4446.0], [65.8, 4452.0], [65.9, 4458.0], [66.0, 4460.0], [66.1, 4464.0], [66.2, 4466.0], [66.3, 4467.0], [66.4, 4471.0], [66.5, 4472.0], [66.6, 4472.0], [66.7, 4475.0], [66.8, 4478.0], [66.9, 4481.0], [67.0, 4490.0], [67.1, 4496.0], [67.2, 4496.0], [67.3, 4498.0], [67.4, 4498.0], [67.5, 4498.0], [67.6, 4500.0], [67.7, 4501.0], [67.8, 4502.0], [67.9, 4504.0], [68.0, 4506.0], [68.1, 4512.0], [68.2, 4515.0], [68.3, 4517.0], [68.4, 4519.0], [68.5, 4522.0], [68.6, 4522.0], [68.7, 4525.0], [68.8, 4527.0], [68.9, 4531.0], [69.0, 4536.0], [69.1, 4538.0], [69.2, 4538.0], [69.3, 4541.0], [69.4, 4544.0], [69.5, 4544.0], [69.6, 4551.0], [69.7, 4554.0], [69.8, 4561.0], [69.9, 4563.0], [70.0, 4564.0], [70.1, 4566.0], [70.2, 4568.0], [70.3, 4573.0], [70.4, 4574.0], [70.5, 4574.0], [70.6, 4575.0], [70.7, 4575.0], [70.8, 4580.0], [70.9, 4591.0], [71.0, 4597.0], [71.1, 4599.0], [71.2, 4604.0], [71.3, 4607.0], [71.4, 4609.0], [71.5, 4610.0], [71.6, 4611.0], [71.7, 4612.0], [71.8, 4616.0], [71.9, 4618.0], [72.0, 4621.0], [72.1, 4621.0], [72.2, 4623.0], [72.3, 4624.0], [72.4, 4627.0], [72.5, 4627.0], [72.6, 4629.0], [72.7, 4634.0], [72.8, 4634.0], [72.9, 4636.0], [73.0, 4639.0], [73.1, 4641.0], [73.2, 4650.0], [73.3, 4655.0], [73.4, 4659.0], [73.5, 4660.0], [73.6, 4668.0], [73.7, 4674.0], [73.8, 4674.0], [73.9, 4677.0], [74.0, 4681.0], [74.1, 4682.0], [74.2, 4682.0], [74.3, 4683.0], [74.4, 4688.0], [74.5, 4696.0], [74.6, 4697.0], [74.7, 4705.0], [74.8, 4705.0], [74.9, 4705.0], [75.0, 4706.0], [75.1, 4710.0], [75.2, 4719.0], [75.3, 4726.0], [75.4, 4728.0], [75.5, 4729.0], [75.6, 4732.0], [75.7, 4734.0], [75.8, 4735.0], [75.9, 4741.0], [76.0, 4754.0], [76.1, 4754.0], [76.2, 4756.0], [76.3, 4762.0], [76.4, 4766.0], [76.5, 4768.0], [76.6, 4770.0], [76.7, 4770.0], [76.8, 4776.0], [76.9, 4778.0], [77.0, 4782.0], [77.1, 4783.0], [77.2, 4789.0], [77.3, 4789.0], [77.4, 4793.0], [77.5, 4793.0], [77.6, 4794.0], [77.7, 4796.0], [77.8, 4803.0], [77.9, 4804.0], [78.0, 4806.0], [78.1, 4809.0], [78.2, 4810.0], [78.3, 4812.0], [78.4, 4814.0], [78.5, 4819.0], [78.6, 4829.0], [78.7, 4830.0], [78.8, 4833.0], [78.9, 4839.0], [79.0, 4839.0], [79.1, 4842.0], [79.2, 4848.0], [79.3, 4861.0], [79.4, 4867.0], [79.5, 4870.0], [79.6, 4873.0], [79.7, 4873.0], [79.8, 4873.0], [79.9, 4875.0], [80.0, 4877.0], [80.1, 4882.0], [80.2, 4882.0], [80.3, 4883.0], [80.4, 4894.0], [80.5, 4900.0], [80.6, 4902.0], [80.7, 4908.0], [80.8, 4911.0], [80.9, 4912.0], [81.0, 4913.0], [81.1, 4917.0], [81.2, 4917.0], [81.3, 4922.0], [81.4, 4922.0], [81.5, 4923.0], [81.6, 4926.0], [81.7, 4929.0], [81.8, 4929.0], [81.9, 4930.0], [82.0, 4932.0], [82.1, 4942.0], [82.2, 4945.0], [82.3, 4946.0], [82.4, 4948.0], [82.5, 4949.0], [82.6, 4952.0], [82.7, 4952.0], [82.8, 4953.0], [82.9, 4953.0], [83.0, 4958.0], [83.1, 4961.0], [83.2, 4962.0], [83.3, 4968.0], [83.4, 4970.0], [83.5, 4971.0], [83.6, 4972.0], [83.7, 4973.0], [83.8, 4980.0], [83.9, 4981.0], [84.0, 4981.0], [84.1, 4984.0], [84.2, 4990.0], [84.3, 4992.0], [84.4, 4992.0], [84.5, 4994.0], [84.6, 4994.0], [84.7, 5001.0], [84.8, 5005.0], [84.9, 5013.0], [85.0, 5018.0], [85.1, 5022.0], [85.2, 5023.0], [85.3, 5028.0], [85.4, 5028.0], [85.5, 5032.0], [85.6, 5033.0], [85.7, 5037.0], [85.8, 5042.0], [85.9, 5042.0], [86.0, 5052.0], [86.1, 5053.0], [86.2, 5053.0], [86.3, 5055.0], [86.4, 5059.0], [86.5, 5062.0], [86.6, 5064.0], [86.7, 5068.0], [86.8, 5069.0], [86.9, 5072.0], [87.0, 5083.0], [87.1, 5088.0], [87.2, 5098.0], [87.3, 5102.0], [87.4, 5103.0], [87.5, 5104.0], [87.6, 5110.0], [87.7, 5110.0], [87.8, 5115.0], [87.9, 5116.0], [88.0, 5124.0], [88.1, 5127.0], [88.2, 5133.0], [88.3, 5135.0], [88.4, 5136.0], [88.5, 5139.0], [88.6, 5139.0], [88.7, 5140.0], [88.8, 5148.0], [88.9, 5156.0], [89.0, 5168.0], [89.1, 5170.0], [89.2, 5171.0], [89.3, 5176.0], [89.4, 5180.0], [89.5, 5181.0], [89.6, 5208.0], [89.7, 5209.0], [89.8, 5211.0], [89.9, 5215.0], [90.0, 5220.0], [90.1, 5233.0], [90.2, 5245.0], [90.3, 5249.0], [90.4, 5252.0], [90.5, 5258.0], [90.6, 5265.0], [90.7, 5277.0], [90.8, 5282.0], [90.9, 5286.0], [91.0, 5289.0], [91.1, 5304.0], [91.2, 5304.0], [91.3, 5312.0], [91.4, 5315.0], [91.5, 5315.0], [91.6, 5323.0], [91.7, 5328.0], [91.8, 5329.0], [91.9, 5335.0], [92.0, 5336.0], [92.1, 5336.0], [92.2, 5338.0], [92.3, 5343.0], [92.4, 5347.0], [92.5, 5359.0], [92.6, 5371.0], [92.7, 5379.0], [92.8, 5400.0], [92.9, 5411.0], [93.0, 5423.0], [93.1, 5440.0], [93.2, 5463.0], [93.3, 5466.0], [93.4, 5467.0], [93.5, 5475.0], [93.6, 5475.0], [93.7, 5479.0], [93.8, 5525.0], [93.9, 5526.0], [94.0, 5550.0], [94.1, 5580.0], [94.2, 5593.0], [94.3, 5595.0], [94.4, 5596.0], [94.5, 5597.0], [94.6, 5609.0], [94.7, 5626.0], [94.8, 5631.0], [94.9, 5638.0], [95.0, 5656.0], [95.1, 5675.0], [95.2, 5685.0], [95.3, 5697.0], [95.4, 5706.0], [95.5, 5716.0], [95.6, 5720.0], [95.7, 5723.0], [95.8, 5732.0], [95.9, 5735.0], [96.0, 5749.0], [96.1, 5750.0], [96.2, 5756.0], [96.3, 5768.0], [96.4, 5786.0], [96.5, 5793.0], [96.6, 5797.0], [96.7, 5831.0], [96.8, 5832.0], [96.9, 5888.0], [97.0, 5899.0], [97.1, 5900.0], [97.2, 5905.0], [97.3, 5941.0], [97.4, 6028.0], [97.5, 6081.0], [97.6, 6165.0], [97.7, 6202.0], [97.8, 6224.0], [97.9, 6242.0], [98.0, 6268.0], [98.1, 6317.0], [98.2, 6318.0], [98.3, 6341.0], [98.4, 6347.0], [98.5, 6361.0], [98.6, 6402.0], [98.7, 6430.0], [98.8, 6457.0], [98.9, 6458.0], [99.0, 6485.0], [99.1, 6539.0], [99.2, 6564.0], [99.3, 6586.0], [99.4, 6622.0], [99.5, 6644.0], [99.6, 6662.0], [99.7, 6870.0], [99.8, 7078.0], [99.9, 7410.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 45.0, "series": [{"data": [[600.0, 18.0], [700.0, 14.0], [800.0, 11.0], [900.0, 14.0], [1000.0, 20.0], [1100.0, 11.0], [1200.0, 13.0], [1300.0, 11.0], [1400.0, 7.0], [1500.0, 12.0], [1600.0, 6.0], [1700.0, 6.0], [1800.0, 5.0], [1900.0, 2.0], [2000.0, 2.0], [2100.0, 4.0], [2200.0, 8.0], [2300.0, 9.0], [2400.0, 14.0], [2500.0, 13.0], [2600.0, 10.0], [2700.0, 7.0], [2800.0, 15.0], [2900.0, 11.0], [3000.0, 11.0], [3100.0, 15.0], [3200.0, 17.0], [3300.0, 8.0], [3400.0, 18.0], [3500.0, 13.0], [3600.0, 23.0], [3700.0, 25.0], [3800.0, 18.0], [3900.0, 22.0], [4000.0, 33.0], [4100.0, 28.0], [4300.0, 45.0], [4200.0, 36.0], [4600.0, 35.0], [4500.0, 36.0], [4400.0, 41.0], [4700.0, 31.0], [4800.0, 27.0], [5000.0, 26.0], [5100.0, 23.0], [4900.0, 43.0], [5300.0, 17.0], [5200.0, 15.0], [5500.0, 8.0], [5400.0, 10.0], [5600.0, 8.0], [5700.0, 13.0], [5800.0, 4.0], [6000.0, 2.0], [6100.0, 1.0], [5900.0, 3.0], [6300.0, 5.0], [6200.0, 4.0], [6600.0, 3.0], [6500.0, 3.0], [6400.0, 5.0], [6800.0, 1.0], [7000.0, 1.0], [7400.0, 1.0], [200.0, 13.0], [300.0, 33.0], [400.0, 19.0], [500.0, 14.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 65.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 802.0, "series": [{"data": [[1.0, 133.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 65.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 802.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 296.34400000000016, "minX": 1.54958334E12, "maxY": 296.34400000000016, "series": [{"data": [[1.54958334E12, 296.34400000000016]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 316.0, "minX": 1.0, "maxY": 7078.0, "series": [{"data": [[2.0, 4274.0], [3.0, 4728.0], [4.0, 4344.0], [5.0, 4990.0], [6.0, 4420.0], [7.0, 4272.0], [8.0, 5103.0], [9.0, 4683.0], [10.0, 4361.0], [12.0, 4421.0], [13.0, 4386.0], [14.0, 4655.0], [15.0, 5124.0], [16.0, 4981.0], [17.0, 4402.0], [18.0, 4267.0], [20.0, 5054.0], [21.0, 4356.0], [22.0, 4674.0], [23.0, 4522.0], [24.0, 4624.0], [25.0, 5053.0], [26.0, 5069.0], [27.0, 4472.0], [28.0, 4609.0], [30.0, 4960.0], [31.0, 1455.5], [33.0, 1261.8], [32.0, 916.875], [35.0, 1533.7142857142858], [34.0, 316.0], [37.0, 2511.5], [36.0, 4383.0], [38.0, 1080.1666666666667], [39.0, 1646.0], [40.0, 321.0], [41.0, 4432.5], [43.0, 1603.0], [42.0, 1720.6666666666667], [45.0, 4735.0], [44.0, 4719.0], [47.0, 2334.0], [46.0, 4288.0], [48.0, 2456.5], [49.0, 2348.5], [51.0, 2463.0], [50.0, 2641.5], [53.0, 357.0], [52.0, 1267.2], [54.0, 2627.5], [55.0, 2704.0], [57.0, 4544.0], [56.0, 4710.0], [58.0, 1706.3333333333333], [59.0, 2637.5], [60.0, 2424.0], [61.0, 2369.0], [62.0, 2594.5], [63.0, 375.0], [64.0, 3222.6666666666665], [66.0, 2728.0], [67.0, 4279.0], [65.0, 4902.0], [71.0, 5068.0], [70.0, 4464.0], [69.0, 4240.0], [68.0, 4623.0], [72.0, 2419.0], [73.0, 2438.5], [75.0, 2682.5], [74.0, 4285.0], [76.0, 1229.6666666666665], [79.0, 5098.0], [78.0, 4292.0], [77.0, 4481.0], [80.0, 2742.0], [83.0, 2151.0], [82.0, 4809.0], [81.0, 4591.0], [84.0, 1983.6666666666667], [86.0, 1234.5], [87.0, 4458.0], [85.0, 4926.0], [91.0, 2852.0], [90.0, 5312.0], [89.0, 4381.0], [88.0, 4498.0], [92.0, 1745.8333333333333], [93.0, 1798.5], [94.0, 1883.3333333333333], [95.0, 2452.5], [96.0, 2522.5], [98.0, 2106.0], [99.0, 4500.0], [97.0, 4682.0], [103.0, 2113.333333333333], [102.0, 4783.0], [101.0, 4471.0], [100.0, 4306.0], [104.0, 1960.6666666666667], [107.0, 4268.0], [106.0, 4105.0], [105.0, 4705.0], [111.0, 2606.6], [110.0, 5062.0], [108.0, 4310.0], [112.0, 2508.5], [114.0, 2806.5], [115.0, 4096.0], [113.0, 4883.0], [119.0, 2604.0], [118.0, 4833.0], [117.0, 4122.0], [116.0, 4573.0], [120.0, 2681.0], [123.0, 2006.6666666666667], [122.0, 4574.0], [121.0, 4705.0], [124.0, 2132.0], [127.0, 856.0], [126.0, 4237.0], [125.0, 4980.0], [128.0, 2402.2], [135.0, 5379.0], [134.0, 4320.0], [133.0, 5181.0], [132.0, 5072.0], [131.0, 4958.0], [130.0, 4627.0], [129.0, 5888.0], [136.0, 2656.0], [138.0, 2851.5], [139.0, 3114.0], [143.0, 3046.5], [142.0, 2860.5], [141.0, 5479.0], [140.0, 5033.0], [137.0, 4182.0], [146.0, 2223.333333333333], [147.0, 2990.5], [145.0, 2680.5], [151.0, 2045.5], [150.0, 1718.2], [149.0, 2748.0], [148.0, 4873.0], [144.0, 5059.0], [152.0, 1388.625], [153.0, 2293.0], [155.0, 2882.0], [154.0, 2595.333333333333], [159.0, 5597.0], [158.0, 6564.0], [157.0, 4566.0], [156.0, 5005.0], [162.0, 2340.666666666667], [163.0, 2200.25], [165.0, 2462.666666666667], [166.0, 4446.0], [164.0, 4564.0], [161.0, 5245.0], [160.0, 7078.0], [171.0, 1189.0], [172.0, 2334.6], [173.0, 2160.0], [174.0, 2619.0], [175.0, 4152.0], [170.0, 5064.0], [169.0, 5347.0], [168.0, 5483.0], [180.0, 2811.0], [179.0, 2996.0], [181.0, 2209.333333333333], [183.0, 5685.0], [182.0, 4466.0], [178.0, 6870.0], [177.0, 5336.0], [176.0, 4401.0], [184.0, 2322.75], [190.0, 1957.0], [189.0, 3238.5], [191.0, 6341.0], [188.0, 6485.0], [187.0, 6586.0], [186.0, 4057.0], [185.0, 4407.0], [194.0, 3430.5], [193.0, 4662.333333333333], [195.0, 2263.333333333333], [197.0, 2434.0], [199.0, 3054.0], [198.0, 5750.0], [196.0, 5550.0], [201.0, 3030.0], [207.0, 2581.333333333333], [206.0, 2936.0], [205.0, 5304.0], [204.0, 4674.0], [203.0, 4952.0], [202.0, 4607.0], [200.0, 5088.0], [208.0, 2193.5], [209.0, 2400.25], [210.0, 2763.333333333333], [211.0, 3559.5], [215.0, 5609.0], [214.0, 4794.0], [213.0, 6318.0], [212.0, 5139.0], [220.0, 3241.5], [221.0, 1498.5], [223.0, 3722.0], [222.0, 4529.5], [219.0, 4891.5], [217.0, 5832.0], [216.0, 5171.0], [224.0, 2538.333333333333], [225.0, 2947.5], [227.0, 3062.0], [230.0, 2866.333333333333], [231.0, 2991.5], [229.0, 5768.0], [228.0, 6644.0], [226.0, 5022.0], [233.0, 2795.5], [239.0, 2791.0], [238.0, 5042.0], [237.0, 4302.0], [236.0, 4677.0], [235.0, 4561.0], [234.0, 6224.0], [232.0, 5023.0], [243.0, 1353.0], [242.0, 3388.5], [244.0, 3964.666666666667], [246.0, 2860.0], [247.0, 3038.0], [245.0, 4241.0], [241.0, 4191.0], [240.0, 4962.0], [250.0, 3708.0], [254.0, 2721.5], [255.0, 4299.0], [253.0, 4115.0], [252.0, 3211.0], [251.0, 5052.0], [249.0, 5211.0], [248.0, 4369.0], [270.0, 2293.0], [258.0, 2748.0], [256.0, 2126.0], [257.0, 4271.0], [263.0, 4408.0], [262.0, 4973.0], [259.0, 3791.5], [269.0, 4867.0], [268.0, 3742.0], [260.0, 3195.666666666667], [261.0, 3872.0], [265.0, 4065.5], [266.0, 2212.4], [267.0, 4776.0], [271.0, 1875.0], [264.0, 4149.0], [286.0, 4796.5], [287.0, 4303.0], [284.0, 4413.0], [275.0, 4616.0], [274.0, 3913.0], [273.0, 4301.0], [272.0, 4832.0], [283.0, 6242.0], [282.0, 4400.0], [281.0, 4948.0], [280.0, 4158.0], [279.0, 5400.0], [278.0, 4037.0], [277.0, 5638.0], [276.0, 5596.0], [301.0, 5136.0], [302.0, 4768.0], [300.0, 6317.0], [291.0, 5304.0], [290.0, 4057.0], [289.0, 4419.0], [288.0, 3790.0], [299.0, 5941.0], [298.0, 3815.0], [297.0, 5032.0], [296.0, 4506.0], [295.0, 5905.0], [294.0, 4098.0], [293.0, 5315.0], [292.0, 3721.0], [318.0, 4028.0], [319.0, 4522.0], [317.0, 4054.0], [316.0, 5258.0], [315.0, 5335.0], [314.0, 4611.0], [313.0, 3735.0], [312.0, 3587.0], [311.0, 3625.0], [304.0, 5042.5], [306.0, 4333.0], [305.0, 4873.0], [310.0, 4018.0], [309.0, 4423.0], [308.0, 3912.5], [334.0, 5380.5], [335.0, 4147.0], [332.0, 4668.0], [322.0, 4340.0], [321.0, 4848.0], [320.0, 4262.0], [331.0, 3788.0], [330.0, 6028.0], [329.0, 4350.0], [328.0, 4333.0], [327.0, 5631.0], [326.0, 3755.0], [325.0, 3573.0], [324.0, 4106.5], [350.0, 4502.0], [351.0, 5580.0], [349.0, 5053.0], [348.0, 3638.0], [347.0, 4829.0], [346.0, 3141.0], [345.0, 4842.0], [344.0, 6662.0], [343.0, 3647.0], [337.0, 4766.0], [336.0, 4261.0], [339.0, 4515.0], [338.0, 4407.0], [342.0, 4046.0], [341.0, 5440.0], [340.0, 3900.0], [366.0, 2761.0], [367.0, 2839.0], [365.0, 3771.5], [364.0, 2977.6666666666665], [363.0, 3759.5], [362.0, 3334.0], [361.0, 5343.0], [360.0, 5900.0], [359.0, 5209.0], [352.0, 5786.0], [355.0, 4637.5], [353.0, 3924.0], [358.0, 3639.0], [357.0, 4392.0], [356.0, 4120.0], [380.0, 2988.3333333333335], [368.0, 2784.3333333333335], [369.0, 3474.5], [371.0, 4634.0], [370.0, 4929.0], [372.0, 3409.0], [373.0, 5133.0], [374.0, 3845.0], [375.0, 4036.0], [383.0, 4196.0], [377.0, 4706.0], [376.0, 4923.0], [382.0, 4376.0], [381.0, 4008.0], [379.0, 3911.0], [378.0, 3519.0], [387.0, 3191.0], [384.0, 2660.666666666667], [391.0, 4930.0], [390.0, 4452.0], [389.0, 3812.0], [388.0, 4894.0], [386.0, 2838.0], [385.0, 2971.0000000000005], [396.0, 3097.5], [398.0, 3197.6666666666665], [399.0, 2985.3333333333335], [393.0, 5749.0], [392.0, 5793.0], [397.0, 6165.0], [395.0, 5735.0], [394.0, 4020.0], [403.0, 4059.5], [405.0, 3418.0], [404.0, 3543.5], [406.0, 3291.0], [407.0, 3989.0], [402.0, 3983.0], [401.0, 3905.0], [400.0, 3771.0], [415.0, 3683.0], [409.0, 4390.0], [408.0, 4789.0], [414.0, 4046.0], [413.0, 4882.0], [412.0, 4770.0], [411.0, 5055.0], [410.0, 5028.0], [430.0, 5593.0], [421.0, 3277.0], [420.0, 6081.0], [422.0, 2898.3333333333335], [424.0, 3051.0], [425.0, 3122.3333333333335], [426.0, 3570.3333333333335], [429.0, 5697.0], [428.0, 3536.0], [423.0, 4336.0], [417.0, 5289.0], [416.0, 4219.0], [419.0, 4265.0], [418.0, 4211.0], [427.0, 5282.0], [446.0, 3317.3333333333335], [433.0, 3443.0], [432.0, 4432.666666666667], [435.0, 3595.0], [434.0, 4875.0], [439.0, 2810.0], [438.0, 4517.0], [437.0, 4830.0], [436.0, 4778.0], [447.0, 4180.0], [441.0, 3537.0], [440.0, 3440.0], [445.0, 5525.0], [444.0, 4126.0], [443.0, 4443.0], [442.0, 4551.0], [462.0, 4741.0], [448.0, 3706.0], [454.0, 3824.5], [453.0, 4870.0], [452.0, 4108.0], [455.0, 3986.0], [456.0, 2840.6666666666665], [459.0, 3723.0], [463.0, 4119.0], [461.0, 4563.0], [460.0, 4810.0], [451.0, 5215.0], [450.0, 3194.0], [449.0, 4604.0], [458.0, 4068.0], [457.0, 4295.0], [477.0, 3827.0], [465.0, 3293.0], [464.0, 3198.0], [466.0, 3961.5], [476.0, 2757.0], [467.0, 4170.0], [471.0, 3264.3333333333335], [470.0, 3012.0], [469.0, 5176.0], [468.0, 5732.0], [475.0, 3058.6666666666665], [474.0, 3361.3333333333335], [478.0, 4007.0], [479.0, 4443.0], [473.0, 4681.0], [472.0, 4417.0], [493.0, 3990.5], [481.0, 4073.0], [480.0, 3303.25], [487.0, 3288.0], [482.0, 3466.75], [492.0, 3893.0], [483.0, 4754.0], [486.0, 3479.0], [485.0, 3332.0], [484.0, 4324.0], [489.0, 3552.6666666666665], [491.0, 4201.0], [490.0, 4406.0], [494.0, 3956.5], [495.0, 4439.0], [488.0, 4906.0], [509.0, 3513.3333333333335], [498.0, 4016.0], [500.0, 3851.0], [499.0, 2811.5], [508.0, 3328.0], [502.0, 4331.0], [503.0, 4496.0], [497.0, 4501.0], [496.0, 5148.0], [501.0, 3256.5], [507.0, 3253.5], [506.0, 3538.0], [505.0, 3852.0], [504.0, 4073.0], [511.0, 4912.0], [510.0, 3605.0], [541.0, 2905.0], [515.0, 3088.0], [527.0, 3412.75], [512.0, 4812.0], [514.0, 4188.0], [513.0, 5018.0], [526.0, 2970.0], [525.0, 4280.0], [524.0, 4498.0], [523.0, 4525.0], [522.0, 3619.0], [521.0, 4345.0], [520.0, 4922.0], [530.0, 3787.0], [529.0, 5328.0], [528.0, 3356.0], [531.0, 4014.0], [533.0, 3824.0], [532.0, 3103.0], [535.0, 3265.0], [534.0, 3783.0], [543.0, 4355.5], [542.0, 4639.0], [540.0, 3357.0], [539.0, 3687.0], [538.0, 4209.0], [537.0, 3655.0], [536.0, 3765.0], [519.0, 3276.0], [518.0, 5110.0], [517.0, 5338.0], [516.0, 5139.0], [571.0, 3939.0], [556.0, 3281.0], [553.0, 3351.0], [552.0, 4182.0], [554.0, 3951.6666666666665], [557.0, 3556.0], [559.0, 4953.0], [545.0, 3191.0], [544.0, 4575.0], [547.0, 3035.0], [546.0, 4056.0], [549.0, 3885.0], [548.0, 3981.0], [551.0, 2955.0], [550.0, 4610.0], [558.0, 3061.0], [568.0, 3836.0], [569.0, 3666.5], [570.0, 3785.0], [573.0, 4112.5], [575.0, 3772.0], [574.0, 3854.0], [572.0, 3444.0], [555.0, 3935.5], [561.0, 4044.5], [562.0, 3582.0], [560.0, 3180.5], [563.0, 4308.333333333333], [565.0, 3690.0], [564.0, 3476.0], [566.0, 3850.0], [567.0, 4266.0], [605.0, 4068.0], [577.0, 3373.5], [576.0, 4398.0], [578.0, 3471.0], [580.0, 2945.0], [579.0, 4554.0], [582.0, 2871.0], [581.0, 4839.0], [600.0, 4839.0], [583.0, 4618.0], [602.0, 3612.0], [601.0, 3641.0], [585.0, 3398.0], [584.0, 4729.0], [586.0, 3948.0], [588.0, 2854.0], [587.0, 3772.0], [590.0, 2548.0], [589.0, 3854.0], [591.0, 3905.5], [594.0, 4057.5], [593.0, 2824.0], [592.0, 3551.0], [595.0, 3740.0], [597.0, 4512.0], [596.0, 3785.0], [599.0, 3714.0], [598.0, 4538.0], [607.0, 3456.0], [606.0, 4430.5], [604.0, 3930.0], [603.0, 3494.0], [623.0, 3238.0], [624.0, 3635.3333333333335], [608.0, 3987.3333333333335], [609.0, 3873.0], [611.0, 4025.0], [610.0, 4232.0], [613.0, 3437.0], [612.0, 3481.0], [615.0, 4140.0], [614.0, 4072.0], [625.0, 3593.6], [627.0, 3965.5], [626.0, 3966.0], [622.0, 3486.0], [621.0, 3694.0], [620.0, 3444.0], [619.0, 4770.0], [618.0, 4544.0], [617.0, 3972.0], [616.0, 4126.0], [1.0, 4696.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[296.34400000000016, 3493.49]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 627.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6283.333333333333, "minX": 1.54958334E12, "maxY": 6999.05, "series": [{"data": [[1.54958334E12, 6999.05]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958334E12, 6283.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3493.49, "minX": 1.54958334E12, "maxY": 3493.49, "series": [{"data": [[1.54958334E12, 3493.49]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3493.485, "minX": 1.54958334E12, "maxY": 3493.485, "series": [{"data": [[1.54958334E12, 3493.485]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 44.40300000000001, "minX": 1.54958334E12, "maxY": 44.40300000000001, "series": [{"data": [[1.54958334E12, 44.40300000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 227.0, "minX": 1.54958334E12, "maxY": 7410.0, "series": [{"data": [[1.54958334E12, 7410.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958334E12, 227.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958334E12, 5219.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958334E12, 6484.7300000000005]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958334E12, 5655.0999999999985]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4022.5, "minX": 16.0, "maxY": 4022.5, "series": [{"data": [[16.0, 4022.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4022.5, "minX": 16.0, "maxY": 4022.5, "series": [{"data": [[16.0, 4022.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958334E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958334E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958334E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958334E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958334E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958334E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Transactions Per Second"}},
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
