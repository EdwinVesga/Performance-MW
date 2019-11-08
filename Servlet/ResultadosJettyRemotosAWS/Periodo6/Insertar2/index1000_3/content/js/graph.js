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
        data: {"result": {"minY": 220.0, "minX": 0.0, "maxY": 7250.0, "series": [{"data": [[0.0, 220.0], [0.1, 279.0], [0.2, 292.0], [0.3, 292.0], [0.4, 307.0], [0.5, 309.0], [0.6, 318.0], [0.7, 320.0], [0.8, 325.0], [0.9, 328.0], [1.0, 329.0], [1.1, 334.0], [1.2, 338.0], [1.3, 344.0], [1.4, 344.0], [1.5, 348.0], [1.6, 351.0], [1.7, 353.0], [1.8, 356.0], [1.9, 361.0], [2.0, 366.0], [2.1, 367.0], [2.2, 373.0], [2.3, 375.0], [2.4, 376.0], [2.5, 382.0], [2.6, 383.0], [2.7, 384.0], [2.8, 387.0], [2.9, 392.0], [3.0, 395.0], [3.1, 398.0], [3.2, 399.0], [3.3, 403.0], [3.4, 406.0], [3.5, 408.0], [3.6, 409.0], [3.7, 410.0], [3.8, 410.0], [3.9, 413.0], [4.0, 416.0], [4.1, 421.0], [4.2, 421.0], [4.3, 423.0], [4.4, 425.0], [4.5, 432.0], [4.6, 433.0], [4.7, 433.0], [4.8, 434.0], [4.9, 434.0], [5.0, 438.0], [5.1, 446.0], [5.2, 455.0], [5.3, 456.0], [5.4, 458.0], [5.5, 467.0], [5.6, 473.0], [5.7, 477.0], [5.8, 485.0], [5.9, 487.0], [6.0, 487.0], [6.1, 500.0], [6.2, 503.0], [6.3, 513.0], [6.4, 516.0], [6.5, 530.0], [6.6, 544.0], [6.7, 546.0], [6.8, 554.0], [6.9, 563.0], [7.0, 566.0], [7.1, 569.0], [7.2, 573.0], [7.3, 575.0], [7.4, 578.0], [7.5, 584.0], [7.6, 586.0], [7.7, 586.0], [7.8, 599.0], [7.9, 603.0], [8.0, 604.0], [8.1, 618.0], [8.2, 622.0], [8.3, 640.0], [8.4, 651.0], [8.5, 658.0], [8.6, 673.0], [8.7, 675.0], [8.8, 681.0], [8.9, 682.0], [9.0, 683.0], [9.1, 688.0], [9.2, 688.0], [9.3, 692.0], [9.4, 696.0], [9.5, 698.0], [9.6, 725.0], [9.7, 726.0], [9.8, 729.0], [9.9, 753.0], [10.0, 753.0], [10.1, 767.0], [10.2, 780.0], [10.3, 788.0], [10.4, 797.0], [10.5, 797.0], [10.6, 798.0], [10.7, 817.0], [10.8, 817.0], [10.9, 821.0], [11.0, 829.0], [11.1, 837.0], [11.2, 851.0], [11.3, 853.0], [11.4, 854.0], [11.5, 858.0], [11.6, 861.0], [11.7, 862.0], [11.8, 886.0], [11.9, 893.0], [12.0, 898.0], [12.1, 908.0], [12.2, 912.0], [12.3, 914.0], [12.4, 914.0], [12.5, 925.0], [12.6, 928.0], [12.7, 940.0], [12.8, 944.0], [12.9, 962.0], [13.0, 971.0], [13.1, 972.0], [13.2, 972.0], [13.3, 979.0], [13.4, 981.0], [13.5, 1001.0], [13.6, 1002.0], [13.7, 1022.0], [13.8, 1029.0], [13.9, 1044.0], [14.0, 1049.0], [14.1, 1066.0], [14.2, 1093.0], [14.3, 1099.0], [14.4, 1099.0], [14.5, 1113.0], [14.6, 1121.0], [14.7, 1145.0], [14.8, 1154.0], [14.9, 1162.0], [15.0, 1193.0], [15.1, 1204.0], [15.2, 1230.0], [15.3, 1235.0], [15.4, 1238.0], [15.5, 1251.0], [15.6, 1251.0], [15.7, 1255.0], [15.8, 1256.0], [15.9, 1257.0], [16.0, 1257.0], [16.1, 1259.0], [16.2, 1274.0], [16.3, 1280.0], [16.4, 1295.0], [16.5, 1299.0], [16.6, 1307.0], [16.7, 1313.0], [16.8, 1348.0], [16.9, 1386.0], [17.0, 1400.0], [17.1, 1600.0], [17.2, 1661.0], [17.3, 1683.0], [17.4, 1690.0], [17.5, 1704.0], [17.6, 1714.0], [17.7, 1714.0], [17.8, 1721.0], [17.9, 1822.0], [18.0, 1837.0], [18.1, 1837.0], [18.2, 1869.0], [18.3, 1869.0], [18.4, 1876.0], [18.5, 1892.0], [18.6, 1912.0], [18.7, 1925.0], [18.8, 1926.0], [18.9, 1927.0], [19.0, 1941.0], [19.1, 1948.0], [19.2, 1950.0], [19.3, 1951.0], [19.4, 1951.0], [19.5, 1953.0], [19.6, 1968.0], [19.7, 1968.0], [19.8, 1969.0], [19.9, 1979.0], [20.0, 1990.0], [20.1, 1999.0], [20.2, 2029.0], [20.3, 2052.0], [20.4, 2056.0], [20.5, 2060.0], [20.6, 2061.0], [20.7, 2073.0], [20.8, 2084.0], [20.9, 2098.0], [21.0, 2106.0], [21.1, 2123.0], [21.2, 2135.0], [21.3, 2143.0], [21.4, 2146.0], [21.5, 2164.0], [21.6, 2174.0], [21.7, 2197.0], [21.8, 2207.0], [21.9, 2223.0], [22.0, 2224.0], [22.1, 2234.0], [22.2, 2249.0], [22.3, 2253.0], [22.4, 2255.0], [22.5, 2258.0], [22.6, 2284.0], [22.7, 2313.0], [22.8, 2321.0], [22.9, 2326.0], [23.0, 2337.0], [23.1, 2338.0], [23.2, 2345.0], [23.3, 2381.0], [23.4, 2388.0], [23.5, 2413.0], [23.6, 2415.0], [23.7, 2422.0], [23.8, 2427.0], [23.9, 2442.0], [24.0, 2451.0], [24.1, 2468.0], [24.2, 2478.0], [24.3, 2524.0], [24.4, 2556.0], [24.5, 2559.0], [24.6, 2569.0], [24.7, 2569.0], [24.8, 2575.0], [24.9, 2579.0], [25.0, 2580.0], [25.1, 2587.0], [25.2, 2609.0], [25.3, 2620.0], [25.4, 2631.0], [25.5, 2635.0], [25.6, 2674.0], [25.7, 2682.0], [25.8, 2684.0], [25.9, 2695.0], [26.0, 2697.0], [26.1, 2703.0], [26.2, 2714.0], [26.3, 2724.0], [26.4, 2745.0], [26.5, 2750.0], [26.6, 2753.0], [26.7, 2767.0], [26.8, 2777.0], [26.9, 2801.0], [27.0, 2820.0], [27.1, 2831.0], [27.2, 2835.0], [27.3, 2849.0], [27.4, 2861.0], [27.5, 2880.0], [27.6, 2881.0], [27.7, 2886.0], [27.8, 2894.0], [27.9, 2895.0], [28.0, 2898.0], [28.1, 2914.0], [28.2, 2929.0], [28.3, 2934.0], [28.4, 2937.0], [28.5, 2942.0], [28.6, 2957.0], [28.7, 2968.0], [28.8, 2985.0], [28.9, 3008.0], [29.0, 3013.0], [29.1, 3017.0], [29.2, 3037.0], [29.3, 3056.0], [29.4, 3077.0], [29.5, 3085.0], [29.6, 3089.0], [29.7, 3094.0], [29.8, 3100.0], [29.9, 3103.0], [30.0, 3105.0], [30.1, 3129.0], [30.2, 3138.0], [30.3, 3151.0], [30.4, 3152.0], [30.5, 3158.0], [30.6, 3159.0], [30.7, 3163.0], [30.8, 3168.0], [30.9, 3172.0], [31.0, 3176.0], [31.1, 3178.0], [31.2, 3185.0], [31.3, 3188.0], [31.4, 3216.0], [31.5, 3219.0], [31.6, 3224.0], [31.7, 3234.0], [31.8, 3243.0], [31.9, 3254.0], [32.0, 3287.0], [32.1, 3288.0], [32.2, 3291.0], [32.3, 3294.0], [32.4, 3305.0], [32.5, 3320.0], [32.6, 3330.0], [32.7, 3332.0], [32.8, 3335.0], [32.9, 3343.0], [33.0, 3345.0], [33.1, 3356.0], [33.2, 3357.0], [33.3, 3368.0], [33.4, 3372.0], [33.5, 3384.0], [33.6, 3390.0], [33.7, 3401.0], [33.8, 3401.0], [33.9, 3405.0], [34.0, 3411.0], [34.1, 3412.0], [34.2, 3417.0], [34.3, 3422.0], [34.4, 3431.0], [34.5, 3432.0], [34.6, 3448.0], [34.7, 3449.0], [34.8, 3453.0], [34.9, 3454.0], [35.0, 3456.0], [35.1, 3460.0], [35.2, 3467.0], [35.3, 3481.0], [35.4, 3494.0], [35.5, 3497.0], [35.6, 3507.0], [35.7, 3508.0], [35.8, 3511.0], [35.9, 3515.0], [36.0, 3518.0], [36.1, 3526.0], [36.2, 3565.0], [36.3, 3569.0], [36.4, 3582.0], [36.5, 3587.0], [36.6, 3587.0], [36.7, 3592.0], [36.8, 3597.0], [36.9, 3598.0], [37.0, 3600.0], [37.1, 3601.0], [37.2, 3604.0], [37.3, 3610.0], [37.4, 3612.0], [37.5, 3614.0], [37.6, 3614.0], [37.7, 3622.0], [37.8, 3626.0], [37.9, 3627.0], [38.0, 3633.0], [38.1, 3633.0], [38.2, 3640.0], [38.3, 3645.0], [38.4, 3645.0], [38.5, 3652.0], [38.6, 3660.0], [38.7, 3661.0], [38.8, 3665.0], [38.9, 3665.0], [39.0, 3678.0], [39.1, 3682.0], [39.2, 3686.0], [39.3, 3686.0], [39.4, 3687.0], [39.5, 3692.0], [39.6, 3694.0], [39.7, 3698.0], [39.8, 3719.0], [39.9, 3723.0], [40.0, 3726.0], [40.1, 3729.0], [40.2, 3734.0], [40.3, 3736.0], [40.4, 3737.0], [40.5, 3746.0], [40.6, 3749.0], [40.7, 3753.0], [40.8, 3772.0], [40.9, 3781.0], [41.0, 3784.0], [41.1, 3789.0], [41.2, 3798.0], [41.3, 3819.0], [41.4, 3821.0], [41.5, 3824.0], [41.6, 3825.0], [41.7, 3825.0], [41.8, 3834.0], [41.9, 3842.0], [42.0, 3847.0], [42.1, 3848.0], [42.2, 3856.0], [42.3, 3856.0], [42.4, 3868.0], [42.5, 3872.0], [42.6, 3876.0], [42.7, 3885.0], [42.8, 3893.0], [42.9, 3899.0], [43.0, 3900.0], [43.1, 3903.0], [43.2, 3907.0], [43.3, 3922.0], [43.4, 3929.0], [43.5, 3932.0], [43.6, 3936.0], [43.7, 3937.0], [43.8, 3942.0], [43.9, 3947.0], [44.0, 3959.0], [44.1, 3959.0], [44.2, 3969.0], [44.3, 3986.0], [44.4, 3990.0], [44.5, 3998.0], [44.6, 4000.0], [44.7, 4008.0], [44.8, 4012.0], [44.9, 4014.0], [45.0, 4020.0], [45.1, 4028.0], [45.2, 4031.0], [45.3, 4033.0], [45.4, 4040.0], [45.5, 4041.0], [45.6, 4043.0], [45.7, 4044.0], [45.8, 4049.0], [45.9, 4050.0], [46.0, 4051.0], [46.1, 4052.0], [46.2, 4059.0], [46.3, 4075.0], [46.4, 4077.0], [46.5, 4078.0], [46.6, 4083.0], [46.7, 4085.0], [46.8, 4090.0], [46.9, 4094.0], [47.0, 4097.0], [47.1, 4099.0], [47.2, 4103.0], [47.3, 4104.0], [47.4, 4104.0], [47.5, 4107.0], [47.6, 4110.0], [47.7, 4118.0], [47.8, 4119.0], [47.9, 4119.0], [48.0, 4121.0], [48.1, 4145.0], [48.2, 4147.0], [48.3, 4148.0], [48.4, 4153.0], [48.5, 4156.0], [48.6, 4158.0], [48.7, 4160.0], [48.8, 4169.0], [48.9, 4169.0], [49.0, 4174.0], [49.1, 4176.0], [49.2, 4181.0], [49.3, 4182.0], [49.4, 4182.0], [49.5, 4186.0], [49.6, 4188.0], [49.7, 4189.0], [49.8, 4190.0], [49.9, 4192.0], [50.0, 4197.0], [50.1, 4207.0], [50.2, 4212.0], [50.3, 4212.0], [50.4, 4214.0], [50.5, 4215.0], [50.6, 4216.0], [50.7, 4217.0], [50.8, 4222.0], [50.9, 4224.0], [51.0, 4227.0], [51.1, 4229.0], [51.2, 4229.0], [51.3, 4233.0], [51.4, 4238.0], [51.5, 4240.0], [51.6, 4244.0], [51.7, 4252.0], [51.8, 4252.0], [51.9, 4260.0], [52.0, 4263.0], [52.1, 4271.0], [52.2, 4272.0], [52.3, 4273.0], [52.4, 4275.0], [52.5, 4275.0], [52.6, 4276.0], [52.7, 4281.0], [52.8, 4281.0], [52.9, 4283.0], [53.0, 4283.0], [53.1, 4288.0], [53.2, 4289.0], [53.3, 4292.0], [53.4, 4292.0], [53.5, 4294.0], [53.6, 4297.0], [53.7, 4306.0], [53.8, 4308.0], [53.9, 4309.0], [54.0, 4310.0], [54.1, 4310.0], [54.2, 4312.0], [54.3, 4314.0], [54.4, 4324.0], [54.5, 4324.0], [54.6, 4324.0], [54.7, 4325.0], [54.8, 4328.0], [54.9, 4334.0], [55.0, 4335.0], [55.1, 4336.0], [55.2, 4337.0], [55.3, 4347.0], [55.4, 4348.0], [55.5, 4352.0], [55.6, 4354.0], [55.7, 4357.0], [55.8, 4357.0], [55.9, 4357.0], [56.0, 4359.0], [56.1, 4360.0], [56.2, 4360.0], [56.3, 4369.0], [56.4, 4369.0], [56.5, 4371.0], [56.6, 4371.0], [56.7, 4378.0], [56.8, 4382.0], [56.9, 4384.0], [57.0, 4385.0], [57.1, 4386.0], [57.2, 4392.0], [57.3, 4395.0], [57.4, 4396.0], [57.5, 4398.0], [57.6, 4400.0], [57.7, 4402.0], [57.8, 4405.0], [57.9, 4407.0], [58.0, 4408.0], [58.1, 4412.0], [58.2, 4414.0], [58.3, 4417.0], [58.4, 4417.0], [58.5, 4418.0], [58.6, 4420.0], [58.7, 4427.0], [58.8, 4427.0], [58.9, 4427.0], [59.0, 4431.0], [59.1, 4440.0], [59.2, 4442.0], [59.3, 4442.0], [59.4, 4447.0], [59.5, 4449.0], [59.6, 4451.0], [59.7, 4451.0], [59.8, 4456.0], [59.9, 4456.0], [60.0, 4458.0], [60.1, 4458.0], [60.2, 4459.0], [60.3, 4461.0], [60.4, 4465.0], [60.5, 4466.0], [60.6, 4467.0], [60.7, 4468.0], [60.8, 4470.0], [60.9, 4470.0], [61.0, 4486.0], [61.1, 4487.0], [61.2, 4492.0], [61.3, 4492.0], [61.4, 4501.0], [61.5, 4505.0], [61.6, 4507.0], [61.7, 4508.0], [61.8, 4508.0], [61.9, 4517.0], [62.0, 4517.0], [62.1, 4519.0], [62.2, 4520.0], [62.3, 4521.0], [62.4, 4522.0], [62.5, 4525.0], [62.6, 4525.0], [62.7, 4525.0], [62.8, 4526.0], [62.9, 4527.0], [63.0, 4528.0], [63.1, 4532.0], [63.2, 4537.0], [63.3, 4537.0], [63.4, 4543.0], [63.5, 4544.0], [63.6, 4545.0], [63.7, 4548.0], [63.8, 4549.0], [63.9, 4557.0], [64.0, 4558.0], [64.1, 4563.0], [64.2, 4572.0], [64.3, 4573.0], [64.4, 4580.0], [64.5, 4580.0], [64.6, 4581.0], [64.7, 4582.0], [64.8, 4585.0], [64.9, 4587.0], [65.0, 4588.0], [65.1, 4592.0], [65.2, 4593.0], [65.3, 4596.0], [65.4, 4597.0], [65.5, 4597.0], [65.6, 4598.0], [65.7, 4600.0], [65.8, 4603.0], [65.9, 4605.0], [66.0, 4605.0], [66.1, 4606.0], [66.2, 4609.0], [66.3, 4609.0], [66.4, 4610.0], [66.5, 4610.0], [66.6, 4611.0], [66.7, 4613.0], [66.8, 4618.0], [66.9, 4619.0], [67.0, 4620.0], [67.1, 4622.0], [67.2, 4624.0], [67.3, 4626.0], [67.4, 4627.0], [67.5, 4627.0], [67.6, 4630.0], [67.7, 4632.0], [67.8, 4634.0], [67.9, 4634.0], [68.0, 4635.0], [68.1, 4639.0], [68.2, 4640.0], [68.3, 4640.0], [68.4, 4642.0], [68.5, 4642.0], [68.6, 4643.0], [68.7, 4645.0], [68.8, 4650.0], [68.9, 4659.0], [69.0, 4660.0], [69.1, 4661.0], [69.2, 4664.0], [69.3, 4664.0], [69.4, 4666.0], [69.5, 4668.0], [69.6, 4669.0], [69.7, 4670.0], [69.8, 4673.0], [69.9, 4673.0], [70.0, 4677.0], [70.1, 4681.0], [70.2, 4685.0], [70.3, 4688.0], [70.4, 4690.0], [70.5, 4690.0], [70.6, 4695.0], [70.7, 4703.0], [70.8, 4712.0], [70.9, 4713.0], [71.0, 4722.0], [71.1, 4723.0], [71.2, 4725.0], [71.3, 4726.0], [71.4, 4730.0], [71.5, 4741.0], [71.6, 4743.0], [71.7, 4748.0], [71.8, 4757.0], [71.9, 4758.0], [72.0, 4760.0], [72.1, 4760.0], [72.2, 4760.0], [72.3, 4761.0], [72.4, 4761.0], [72.5, 4762.0], [72.6, 4764.0], [72.7, 4765.0], [72.8, 4765.0], [72.9, 4769.0], [73.0, 4771.0], [73.1, 4772.0], [73.2, 4775.0], [73.3, 4775.0], [73.4, 4779.0], [73.5, 4781.0], [73.6, 4783.0], [73.7, 4783.0], [73.8, 4784.0], [73.9, 4784.0], [74.0, 4787.0], [74.1, 4789.0], [74.2, 4790.0], [74.3, 4796.0], [74.4, 4796.0], [74.5, 4797.0], [74.6, 4797.0], [74.7, 4813.0], [74.8, 4816.0], [74.9, 4816.0], [75.0, 4817.0], [75.1, 4817.0], [75.2, 4822.0], [75.3, 4822.0], [75.4, 4823.0], [75.5, 4824.0], [75.6, 4825.0], [75.7, 4826.0], [75.8, 4826.0], [75.9, 4834.0], [76.0, 4835.0], [76.1, 4835.0], [76.2, 4837.0], [76.3, 4840.0], [76.4, 4842.0], [76.5, 4842.0], [76.6, 4843.0], [76.7, 4848.0], [76.8, 4853.0], [76.9, 4855.0], [77.0, 4857.0], [77.1, 4859.0], [77.2, 4873.0], [77.3, 4875.0], [77.4, 4879.0], [77.5, 4880.0], [77.6, 4883.0], [77.7, 4883.0], [77.8, 4886.0], [77.9, 4889.0], [78.0, 4892.0], [78.1, 4894.0], [78.2, 4894.0], [78.3, 4897.0], [78.4, 4898.0], [78.5, 4899.0], [78.6, 4901.0], [78.7, 4902.0], [78.8, 4907.0], [78.9, 4910.0], [79.0, 4914.0], [79.1, 4918.0], [79.2, 4923.0], [79.3, 4924.0], [79.4, 4932.0], [79.5, 4935.0], [79.6, 4938.0], [79.7, 4941.0], [79.8, 4942.0], [79.9, 4944.0], [80.0, 4946.0], [80.1, 4950.0], [80.2, 4952.0], [80.3, 4953.0], [80.4, 4958.0], [80.5, 4959.0], [80.6, 4960.0], [80.7, 4962.0], [80.8, 4962.0], [80.9, 4963.0], [81.0, 4965.0], [81.1, 4969.0], [81.2, 4974.0], [81.3, 4974.0], [81.4, 4977.0], [81.5, 4994.0], [81.6, 4995.0], [81.7, 4998.0], [81.8, 5006.0], [81.9, 5006.0], [82.0, 5012.0], [82.1, 5018.0], [82.2, 5022.0], [82.3, 5023.0], [82.4, 5030.0], [82.5, 5030.0], [82.6, 5034.0], [82.7, 5040.0], [82.8, 5046.0], [82.9, 5053.0], [83.0, 5056.0], [83.1, 5057.0], [83.2, 5067.0], [83.3, 5068.0], [83.4, 5069.0], [83.5, 5073.0], [83.6, 5073.0], [83.7, 5076.0], [83.8, 5077.0], [83.9, 5083.0], [84.0, 5088.0], [84.1, 5094.0], [84.2, 5097.0], [84.3, 5098.0], [84.4, 5100.0], [84.5, 5113.0], [84.6, 5114.0], [84.7, 5115.0], [84.8, 5115.0], [84.9, 5118.0], [85.0, 5123.0], [85.1, 5124.0], [85.2, 5128.0], [85.3, 5134.0], [85.4, 5138.0], [85.5, 5138.0], [85.6, 5139.0], [85.7, 5147.0], [85.8, 5148.0], [85.9, 5155.0], [86.0, 5163.0], [86.1, 5165.0], [86.2, 5166.0], [86.3, 5168.0], [86.4, 5169.0], [86.5, 5171.0], [86.6, 5176.0], [86.7, 5181.0], [86.8, 5185.0], [86.9, 5190.0], [87.0, 5190.0], [87.1, 5191.0], [87.2, 5194.0], [87.3, 5195.0], [87.4, 5196.0], [87.5, 5196.0], [87.6, 5198.0], [87.7, 5200.0], [87.8, 5202.0], [87.9, 5204.0], [88.0, 5223.0], [88.1, 5228.0], [88.2, 5230.0], [88.3, 5231.0], [88.4, 5235.0], [88.5, 5241.0], [88.6, 5242.0], [88.7, 5247.0], [88.8, 5254.0], [88.9, 5270.0], [89.0, 5278.0], [89.1, 5282.0], [89.2, 5284.0], [89.3, 5287.0], [89.4, 5287.0], [89.5, 5289.0], [89.6, 5295.0], [89.7, 5295.0], [89.8, 5295.0], [89.9, 5295.0], [90.0, 5296.0], [90.1, 5296.0], [90.2, 5297.0], [90.3, 5301.0], [90.4, 5306.0], [90.5, 5314.0], [90.6, 5327.0], [90.7, 5330.0], [90.8, 5334.0], [90.9, 5335.0], [91.0, 5348.0], [91.1, 5353.0], [91.2, 5360.0], [91.3, 5367.0], [91.4, 5377.0], [91.5, 5391.0], [91.6, 5400.0], [91.7, 5401.0], [91.8, 5409.0], [91.9, 5420.0], [92.0, 5420.0], [92.1, 5434.0], [92.2, 5437.0], [92.3, 5447.0], [92.4, 5474.0], [92.5, 5493.0], [92.6, 5499.0], [92.7, 5504.0], [92.8, 5504.0], [92.9, 5511.0], [93.0, 5532.0], [93.1, 5532.0], [93.2, 5560.0], [93.3, 5568.0], [93.4, 5570.0], [93.5, 5578.0], [93.6, 5585.0], [93.7, 5586.0], [93.8, 5590.0], [93.9, 5612.0], [94.0, 5613.0], [94.1, 5616.0], [94.2, 5623.0], [94.3, 5625.0], [94.4, 5633.0], [94.5, 5644.0], [94.6, 5654.0], [94.7, 5680.0], [94.8, 5689.0], [94.9, 5695.0], [95.0, 5697.0], [95.1, 5697.0], [95.2, 5717.0], [95.3, 5722.0], [95.4, 5723.0], [95.5, 5728.0], [95.6, 5742.0], [95.7, 5748.0], [95.8, 5754.0], [95.9, 5774.0], [96.0, 5792.0], [96.1, 5802.0], [96.2, 5812.0], [96.3, 5823.0], [96.4, 5832.0], [96.5, 5835.0], [96.6, 5851.0], [96.7, 5863.0], [96.8, 5887.0], [96.9, 5897.0], [97.0, 5914.0], [97.1, 5953.0], [97.2, 5973.0], [97.3, 5981.0], [97.4, 6058.0], [97.5, 6082.0], [97.6, 6085.0], [97.7, 6106.0], [97.8, 6133.0], [97.9, 6145.0], [98.0, 6191.0], [98.1, 6194.0], [98.2, 6202.0], [98.3, 6233.0], [98.4, 6240.0], [98.5, 6290.0], [98.6, 6309.0], [98.7, 6324.0], [98.8, 6368.0], [98.9, 6417.0], [99.0, 6421.0], [99.1, 6431.0], [99.2, 6492.0], [99.3, 6608.0], [99.4, 6609.0], [99.5, 6621.0], [99.6, 6688.0], [99.7, 6988.0], [99.8, 7127.0], [99.9, 7250.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 50.0, "series": [{"data": [[600.0, 17.0], [700.0, 11.0], [800.0, 14.0], [900.0, 14.0], [1000.0, 10.0], [1100.0, 6.0], [1200.0, 15.0], [1300.0, 4.0], [1400.0, 1.0], [1600.0, 4.0], [1700.0, 4.0], [1800.0, 7.0], [1900.0, 15.0], [2000.0, 8.0], [2100.0, 8.0], [2200.0, 9.0], [2300.0, 8.0], [2400.0, 8.0], [2500.0, 9.0], [2600.0, 9.0], [2700.0, 8.0], [2800.0, 12.0], [2900.0, 8.0], [3000.0, 9.0], [3100.0, 16.0], [3200.0, 10.0], [3300.0, 13.0], [3400.0, 19.0], [3500.0, 14.0], [3600.0, 28.0], [3700.0, 15.0], [3800.0, 17.0], [3900.0, 16.0], [4000.0, 26.0], [4200.0, 36.0], [4100.0, 29.0], [4300.0, 39.0], [4400.0, 38.0], [4600.0, 50.0], [4500.0, 43.0], [4800.0, 39.0], [4700.0, 40.0], [5100.0, 33.0], [4900.0, 32.0], [5000.0, 27.0], [5200.0, 26.0], [5300.0, 13.0], [5400.0, 11.0], [5500.0, 12.0], [5600.0, 13.0], [5700.0, 9.0], [5800.0, 9.0], [6100.0, 5.0], [5900.0, 4.0], [6000.0, 3.0], [6200.0, 4.0], [6300.0, 3.0], [6600.0, 4.0], [6400.0, 4.0], [6900.0, 1.0], [7100.0, 1.0], [7200.0, 1.0], [200.0, 3.0], [300.0, 29.0], [400.0, 29.0], [500.0, 18.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 62.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 829.0, "series": [{"data": [[1.0, 109.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 62.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 829.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 309.22700000000003, "minX": 1.54958322E12, "maxY": 309.22700000000003, "series": [{"data": [[1.54958322E12, 309.22700000000003]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 360.1111111111111, "minX": 1.0, "maxY": 7127.0, "series": [{"data": [[2.0, 4605.0], [3.0, 4352.0], [4.0, 4292.0], [5.0, 4762.0], [7.0, 4418.0], [8.0, 4553.0], [9.0, 4378.0], [10.0, 4907.0], [11.0, 4606.0], [12.0, 5018.0], [13.0, 4314.0], [15.0, 4350.5], [16.0, 4420.0], [17.0, 4837.0], [19.0, 4644.0], [20.0, 4470.0], [21.0, 4386.0], [22.0, 4252.0], [24.0, 4458.0], [25.0, 4459.0], [26.0, 4548.0], [27.0, 4427.0], [28.0, 4369.0], [29.0, 4281.0], [30.0, 4417.0], [31.0, 4640.0], [33.0, 5021.0], [32.0, 4525.0], [35.0, 5171.0], [34.0, 4894.0], [37.0, 4627.0], [36.0, 4764.0], [39.0, 4581.0], [38.0, 4169.0], [41.0, 4802.0], [43.0, 413.0], [42.0, 2725.5], [45.0, 832.25], [44.0, 1551.0], [46.0, 874.625], [47.0, 990.2857142857142], [48.0, 360.1111111111111], [49.0, 4726.0], [50.0, 2501.0], [51.0, 1186.4], [52.0, 1212.0], [53.0, 1187.6], [54.0, 2002.0], [55.0, 5204.0], [57.0, 4324.0], [56.0, 4677.0], [59.0, 1864.6666666666667], [58.0, 5296.0], [60.0, 2356.0], [61.0, 1425.0], [63.0, 2258.0], [62.0, 4276.0], [66.0, 4659.0], [65.0, 4690.0], [64.0, 5115.0], [68.0, 2042.0], [69.0, 2300.0], [71.0, 4099.0], [70.0, 4532.0], [73.0, 1200.6666666666665], [72.0, 1903.3333333333333], [75.0, 2827.0], [74.0, 5069.0], [76.0, 2623.5], [77.0, 2697.5], [79.0, 5314.0], [78.0, 4603.0], [81.0, 1888.6666666666667], [83.0, 2693.5], [82.0, 4842.0], [80.0, 5006.0], [87.0, 4618.0], [86.0, 4043.0], [85.0, 4758.0], [84.0, 5230.0], [89.0, 1564.25], [90.0, 1790.6666666666667], [91.0, 2480.0], [88.0, 4855.0], [92.0, 2433.5], [95.0, 5007.5], [93.0, 4395.0], [97.0, 2566.0], [98.0, 2307.5], [99.0, 5198.0], [96.0, 4052.0], [101.0, 2040.3333333333333], [103.0, 1351.8333333333333], [102.0, 1958.6666666666667], [100.0, 4308.0], [104.0, 2945.0], [107.0, 5115.0], [106.0, 4263.0], [105.0, 4670.0], [110.0, 2250.333333333333], [111.0, 2163.333333333333], [109.0, 4334.0], [108.0, 5034.0], [112.0, 2840.0], [114.0, 2658.0], [113.0, 2820.5], [115.0, 1868.25], [118.0, 2387.5], [119.0, 3947.0], [117.0, 4059.0], [116.0, 4857.0], [123.0, 4283.0], [122.0, 4597.0], [121.0, 5306.0], [120.0, 4953.0], [126.0, 2867.5], [127.0, 4324.0], [125.0, 4790.0], [124.0, 4713.0], [128.0, 3245.0], [130.0, 2820.5], [132.0, 2855.5], [135.0, 4412.0], [134.0, 5613.0], [133.0, 5851.0], [131.0, 4573.0], [129.0, 4775.0], [137.0, 1788.5], [136.0, 2041.3333333333333], [138.0, 2907.5], [139.0, 2544.5], [141.0, 1931.25], [140.0, 1575.4], [143.0, 3381.5], [142.0, 5202.0], [144.0, 2420.0], [145.0, 3016.0], [151.0, 4810.5], [149.0, 4645.0], [148.0, 4910.0], [147.0, 4664.0], [153.0, 3008.5], [155.0, 2022.3333333333333], [156.0, 2435.666666666667], [159.0, 4470.0], [158.0, 4642.0], [157.0, 4787.0], [154.0, 4505.0], [152.0, 4572.0], [161.0, 2981.5], [166.0, 2813.0], [167.0, 3026.0], [165.0, 5474.0], [164.0, 5532.0], [163.0, 5504.0], [162.0, 4923.0], [160.0, 4545.0], [169.0, 3571.5], [170.0, 1718.5], [174.0, 2445.5], [175.0, 2606.5], [173.0, 4645.5], [171.0, 5006.0], [168.0, 4417.0], [176.0, 2835.5], [178.0, 2957.5], [180.0, 3380.5], [181.0, 2137.0], [183.0, 3703.5], [182.0, 3936.0], [179.0, 4260.0], [185.0, 2012.2], [189.0, 2328.5], [190.0, 3029.5], [191.0, 2720.5], [188.0, 5138.0], [187.0, 4883.0], [186.0, 4834.0], [184.0, 4309.0], [194.0, 3100.5], [196.0, 3236.5], [198.0, 4835.0], [197.0, 6106.0], [195.0, 5030.0], [193.0, 4781.0], [192.0, 4527.0], [202.0, 2833.0], [203.0, 3488.5], [204.0, 3013.5], [207.0, 2943.0], [206.0, 4289.0], [205.0, 4456.0], [201.0, 4661.0], [200.0, 5293.0], [208.0, 2364.0], [209.0, 2997.0], [210.0, 1255.0], [212.0, 3017.0], [215.0, 4958.0], [214.0, 5228.0], [213.0, 3598.0], [211.0, 5698.5], [223.0, 4040.0], [222.0, 4883.0], [221.0, 6988.0], [220.0, 4598.0], [219.0, 5287.0], [218.0, 5897.0], [217.0, 5590.0], [216.0, 4685.0], [231.0, 4886.0], [230.0, 3876.0], [229.0, 5400.0], [228.0, 4963.0], [227.0, 4669.0], [225.0, 5391.0], [224.0, 3582.0], [239.0, 4774.0], [237.0, 4932.0], [236.0, 4826.0], [235.0, 4440.0], [234.0, 5270.0], [233.0, 5301.0], [232.0, 5297.0], [247.0, 5067.0], [246.0, 4347.0], [244.0, 4797.0], [243.0, 4901.0], [242.0, 5437.0], [241.0, 4360.0], [240.0, 5914.0], [255.0, 4761.0], [254.0, 5493.0], [253.0, 5586.0], [252.0, 5053.0], [251.0, 4892.0], [250.0, 3694.0], [249.0, 4558.0], [248.0, 5330.0], [270.0, 4310.0], [271.0, 5654.0], [269.0, 4587.0], [268.0, 5278.0], [267.0, 4525.0], [266.0, 4620.0], [265.0, 4879.0], [264.0, 5334.0], [263.0, 4946.0], [257.0, 4962.0], [256.0, 4944.0], [259.0, 5409.0], [258.0, 4148.0], [262.0, 4400.0], [261.0, 5887.0], [260.0, 6309.0], [286.0, 5754.0], [287.0, 4549.0], [285.0, 4963.0], [284.0, 5168.0], [283.0, 4817.0], [282.0, 4784.0], [281.0, 5295.0], [280.0, 4281.0], [279.0, 4537.0], [273.0, 5289.0], [272.0, 6688.0], [275.0, 5139.0], [274.0, 4898.0], [278.0, 5113.0], [277.0, 5241.0], [276.0, 5644.0], [301.0, 4223.0], [297.0, 3660.0], [296.0, 3002.333333333333], [298.0, 2850.3333333333335], [300.0, 3492.5], [291.0, 5823.0], [290.0, 5499.0], [289.0, 4940.5], [299.0, 2789.6666666666665], [303.0, 4796.0], [302.0, 5147.0], [295.0, 5447.0], [294.0, 4823.0], [293.0, 5282.0], [292.0, 4695.0], [318.0, 3691.5], [305.0, 3298.0], [307.0, 3585.5], [306.0, 5774.0], [317.0, 5722.0], [316.0, 4526.0], [309.0, 2536.1666666666665], [308.0, 4779.0], [311.0, 2702.5], [304.0, 5973.0], [310.0, 2631.0], [314.0, 4010.5], [315.0, 5195.0], [313.0, 3307.0], [312.0, 3456.5], [319.0, 4741.0], [333.0, 2385.6666666666665], [321.0, 2981.0], [322.0, 3209.5], [332.0, 4960.0], [323.0, 4271.0], [325.0, 4106.5], [324.0, 4760.0], [327.0, 2859.0], [320.0, 6621.0], [326.0, 5165.0], [329.0, 3007.666666666667], [328.0, 3087.0], [331.0, 3128.6666666666665], [330.0, 5287.0], [335.0, 4630.0], [334.0, 4660.0], [350.0, 4650.0], [346.0, 3123.0], [338.0, 3245.5], [337.0, 7127.0], [336.0, 4765.0], [339.0, 6324.0], [343.0, 4525.0], [342.0, 4722.0], [341.0, 5504.0], [340.0, 6417.0], [347.0, 3378.0], [351.0, 3145.6666666666665], [349.0, 5802.0], [348.0, 6082.0], [345.0, 6290.0], [344.0, 5088.0], [364.0, 2695.0], [353.0, 3038.0], [354.0, 3913.0], [355.0, 5420.0], [357.0, 3010.0], [356.0, 4188.0], [360.0, 3701.5], [359.0, 3834.5], [352.0, 5284.0], [358.0, 6368.0], [362.0, 3994.0], [361.0, 5812.0], [363.0, 4848.0], [367.0, 5247.0], [366.0, 4889.0], [365.0, 3920.0], [383.0, 4145.0], [376.0, 3190.5], [377.0, 3362.25], [378.0, 3434.333333333333], [379.0, 3280.3333333333335], [381.0, 3489.6], [382.0, 2313.0], [375.0, 5585.0], [369.0, 4894.0], [368.0, 4772.0], [371.0, 6233.0], [370.0, 4447.0], [374.0, 4174.0], [373.0, 6194.0], [372.0, 4292.0], [398.0, 3790.5], [393.0, 4940.5], [387.0, 3431.0], [386.0, 6202.0], [385.0, 6058.0], [384.0, 4596.0], [390.0, 5623.0], [389.0, 4215.0], [388.0, 4492.0], [394.0, 2620.0], [399.0, 4493.5], [397.0, 6085.0], [396.0, 4942.0], [395.0, 5428.5], [392.0, 5159.5], [414.0, 3740.5], [401.0, 3761.0], [400.0, 5348.0], [403.0, 4952.0], [402.0, 5040.0], [407.0, 5570.0], [406.0, 5625.0], [405.0, 4044.0], [404.0, 6608.0], [412.0, 2750.0], [415.0, 3916.5], [413.0, 4616.5], [411.0, 6145.0], [410.0, 5295.0], [409.0, 4216.0], [408.0, 5953.0], [423.0, 3440.5], [420.0, 3486.5], [422.0, 3606.0], [421.0, 3620.5], [424.0, 3778.5], [425.0, 4214.0], [427.0, 4643.0], [426.0, 5231.0], [428.0, 3130.6666666666665], [419.0, 4238.0], [418.0, 4673.0], [417.0, 3456.0], [416.0, 4666.0], [429.0, 3344.0], [430.0, 4370.5], [431.0, 4611.0], [446.0, 4328.0], [432.0, 2687.0], [439.0, 3885.0], [438.0, 4229.0], [437.0, 3627.0], [436.0, 4357.0], [433.0, 3963.0], [447.0, 3966.5], [445.0, 4761.0], [444.0, 4312.0], [435.0, 5633.0], [434.0, 4008.0], [443.0, 5863.0], [442.0, 4597.0], [441.0, 4427.0], [440.0, 4107.0], [463.0, 5377.0], [457.0, 3624.3333333333335], [456.0, 3317.5], [459.0, 2925.3333333333335], [462.0, 3778.0], [461.0, 5176.0], [460.0, 4880.0], [451.0, 4085.0], [450.0, 5200.0], [449.0, 4760.0], [448.0, 5742.0], [458.0, 3622.0], [455.0, 5190.0], [454.0, 4743.0], [453.0, 5560.0], [452.0, 5335.0], [478.0, 5360.0], [466.0, 3514.0], [465.0, 4775.0], [464.0, 4969.0], [467.0, 4789.0], [471.0, 3454.0], [470.0, 4180.5], [468.0, 3719.0], [479.0, 3614.0], [477.0, 4325.0], [476.0, 4610.0], [475.0, 5511.0], [474.0, 3825.0], [473.0, 4610.0], [472.0, 4050.0], [494.0, 4796.0], [481.0, 3741.5], [480.0, 4442.0], [487.0, 4918.0], [486.0, 4031.0], [485.0, 3056.0], [484.0, 4492.0], [482.0, 3662.0], [488.0, 3137.0], [489.0, 3784.0], [495.0, 3589.5], [493.0, 4521.0], [492.0, 4688.0], [483.0, 4726.0], [491.0, 4442.0], [490.0, 3320.0], [508.0, 3240.5], [499.0, 3627.5], [498.0, 4359.0], [497.0, 4283.0], [496.0, 5181.0], [501.0, 3557.5], [500.0, 4431.0], [502.0, 4519.0], [503.0, 3782.3333333333335], [506.0, 3438.5], [505.0, 4396.0], [504.0, 4078.0], [511.0, 3856.0], [510.0, 4217.0], [509.0, 5327.0], [507.0, 3959.0], [518.0, 3803.0], [515.0, 3567.5], [514.0, 3737.0], [513.0, 3411.0], [512.0, 5434.0], [517.0, 3626.0], [516.0, 3163.0], [527.0, 4673.0], [526.0, 4158.0], [525.0, 4609.0], [519.0, 3264.0], [537.0, 4360.0], [536.0, 3368.0], [539.0, 4033.0], [538.0, 4592.0], [541.0, 4769.0], [540.0, 4083.0], [543.0, 5185.0], [542.0, 4507.0], [520.0, 3824.5], [524.0, 3776.5], [523.0, 3890.6666666666665], [521.0, 3903.0], [529.0, 3462.6666666666665], [531.0, 4783.0], [530.0, 3601.0], [528.0, 3679.0], [532.0, 3430.0000000000005], [535.0, 3929.6666666666665], [533.0, 3893.0], [568.0, 3541.8], [546.0, 4056.0], [549.0, 4017.5], [548.0, 3645.0], [547.0, 5124.0], [551.0, 4190.0], [550.0, 4941.0], [553.0, 3500.5], [552.0, 3449.0], [554.0, 4784.0], [556.0, 4517.0], [555.0, 3798.0], [557.0, 4138.0], [558.0, 3823.0], [559.0, 3422.0], [545.0, 4712.0], [544.0, 4859.0], [561.0, 2451.0], [565.0, 4484.5], [567.0, 3567.0], [566.0, 3417.0], [564.0, 3785.0], [563.0, 4077.0], [562.0, 3810.0], [570.0, 3526.0], [574.0, 3763.5], [573.0, 2942.0], [572.0, 4681.0], [571.0, 4634.0], [575.0, 3993.0], [560.0, 4324.0], [569.0, 3523.6666666666665], [602.0, 4209.0], [588.0, 4234.0], [584.0, 4464.0], [585.0, 3660.0], [586.0, 3693.75], [587.0, 3773.8], [590.0, 3575.0], [589.0, 3819.0], [592.0, 2671.0], [594.0, 3515.0], [593.0, 3288.0], [603.0, 3654.0], [604.0, 3772.0], [606.0, 4020.0], [605.0, 3587.0], [607.0, 4354.0], [601.0, 4013.0], [600.0, 3511.0], [591.0, 4189.0], [577.0, 3686.0], [576.0, 4405.0], [579.0, 4508.0], [578.0, 4310.0], [581.0, 3868.0], [580.0, 4384.0], [583.0, 4097.0], [582.0, 3819.0], [595.0, 3630.0], [597.0, 3604.6666666666665], [596.0, 4028.0], [599.0, 3485.0], [598.0, 3592.0], [611.0, 3545.5], [610.0, 3383.3333333333335], [609.0, 4456.0], [608.0, 3138.0], [612.0, 3636.0], [614.0, 4609.0], [613.0, 3178.0], [624.0, 3494.0], [615.0, 3518.0], [617.0, 4186.0], [616.0, 3401.0], [618.0, 3851.0], [621.0, 4035.5], [620.0, 4182.0], [619.0, 4153.0], [622.0, 4408.0], [623.0, 3784.0], [626.0, 3708.0], [627.0, 3734.0], [625.0, 3683.5], [628.0, 3895.0], [629.0, 3373.6], [630.0, 4449.5], [1.0, 4962.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[309.22700000000003, 3643.229000000004]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 630.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6283.333333333333, "minX": 1.54958322E12, "maxY": 6999.4, "series": [{"data": [[1.54958322E12, 6999.4]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958322E12, 6283.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3643.229000000004, "minX": 1.54958322E12, "maxY": 3643.229000000004, "series": [{"data": [[1.54958322E12, 3643.229000000004]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3643.2169999999987, "minX": 1.54958322E12, "maxY": 3643.2169999999987, "series": [{"data": [[1.54958322E12, 3643.2169999999987]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 32.29499999999998, "minX": 1.54958322E12, "maxY": 32.29499999999998, "series": [{"data": [[1.54958322E12, 32.29499999999998]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 220.0, "minX": 1.54958322E12, "maxY": 7250.0, "series": [{"data": [[1.54958322E12, 7250.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958322E12, 220.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958322E12, 5295.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958322E12, 6420.96]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958322E12, 5696.9]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4202.0, "minX": 16.0, "maxY": 4202.0, "series": [{"data": [[16.0, 4202.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4202.0, "minX": 16.0, "maxY": 4202.0, "series": [{"data": [[16.0, 4202.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958322E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958322E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958322E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958322E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958322E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958322E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Transactions Per Second"}},
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
