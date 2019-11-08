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
        data: {"result": {"minY": 251.0, "minX": 0.0, "maxY": 6787.0, "series": [{"data": [[0.0, 251.0], [0.1, 276.0], [0.2, 293.0], [0.3, 293.0], [0.4, 310.0], [0.5, 313.0], [0.6, 340.0], [0.7, 340.0], [0.8, 342.0], [0.9, 343.0], [1.0, 345.0], [1.1, 346.0], [1.2, 346.0], [1.3, 347.0], [1.4, 347.0], [1.5, 349.0], [1.6, 353.0], [1.7, 356.0], [1.8, 360.0], [1.9, 363.0], [2.0, 373.0], [2.1, 376.0], [2.2, 376.0], [2.3, 381.0], [2.4, 383.0], [2.5, 385.0], [2.6, 385.0], [2.7, 386.0], [2.8, 390.0], [2.9, 390.0], [3.0, 397.0], [3.1, 400.0], [3.2, 403.0], [3.3, 412.0], [3.4, 413.0], [3.5, 414.0], [3.6, 420.0], [3.7, 421.0], [3.8, 422.0], [3.9, 424.0], [4.0, 424.0], [4.1, 424.0], [4.2, 435.0], [4.3, 440.0], [4.4, 445.0], [4.5, 449.0], [4.6, 450.0], [4.7, 451.0], [4.8, 451.0], [4.9, 456.0], [5.0, 456.0], [5.1, 457.0], [5.2, 474.0], [5.3, 475.0], [5.4, 484.0], [5.5, 487.0], [5.6, 489.0], [5.7, 491.0], [5.8, 495.0], [5.9, 503.0], [6.0, 509.0], [6.1, 513.0], [6.2, 516.0], [6.3, 522.0], [6.4, 525.0], [6.5, 530.0], [6.6, 540.0], [6.7, 541.0], [6.8, 549.0], [6.9, 550.0], [7.0, 553.0], [7.1, 557.0], [7.2, 559.0], [7.3, 566.0], [7.4, 567.0], [7.5, 567.0], [7.6, 568.0], [7.7, 570.0], [7.8, 571.0], [7.9, 587.0], [8.0, 588.0], [8.1, 589.0], [8.2, 604.0], [8.3, 619.0], [8.4, 619.0], [8.5, 627.0], [8.6, 635.0], [8.7, 649.0], [8.8, 657.0], [8.9, 671.0], [9.0, 674.0], [9.1, 677.0], [9.2, 687.0], [9.3, 688.0], [9.4, 709.0], [9.5, 713.0], [9.6, 716.0], [9.7, 721.0], [9.8, 723.0], [9.9, 727.0], [10.0, 739.0], [10.1, 749.0], [10.2, 758.0], [10.3, 758.0], [10.4, 763.0], [10.5, 774.0], [10.6, 785.0], [10.7, 815.0], [10.8, 818.0], [10.9, 849.0], [11.0, 850.0], [11.1, 856.0], [11.2, 870.0], [11.3, 871.0], [11.4, 871.0], [11.5, 885.0], [11.6, 887.0], [11.7, 896.0], [11.8, 898.0], [11.9, 901.0], [12.0, 907.0], [12.1, 909.0], [12.2, 909.0], [12.3, 917.0], [12.4, 920.0], [12.5, 925.0], [12.6, 928.0], [12.7, 933.0], [12.8, 942.0], [12.9, 943.0], [13.0, 951.0], [13.1, 951.0], [13.2, 955.0], [13.3, 972.0], [13.4, 978.0], [13.5, 986.0], [13.6, 997.0], [13.7, 1003.0], [13.8, 1012.0], [13.9, 1026.0], [14.0, 1033.0], [14.1, 1039.0], [14.2, 1052.0], [14.3, 1054.0], [14.4, 1067.0], [14.5, 1069.0], [14.6, 1070.0], [14.7, 1075.0], [14.8, 1090.0], [14.9, 1099.0], [15.0, 1102.0], [15.1, 1103.0], [15.2, 1121.0], [15.3, 1125.0], [15.4, 1142.0], [15.5, 1149.0], [15.6, 1154.0], [15.7, 1155.0], [15.8, 1179.0], [15.9, 1194.0], [16.0, 1199.0], [16.1, 1200.0], [16.2, 1201.0], [16.3, 1217.0], [16.4, 1227.0], [16.5, 1244.0], [16.6, 1246.0], [16.7, 1247.0], [16.8, 1254.0], [16.9, 1277.0], [17.0, 1280.0], [17.1, 1286.0], [17.2, 1290.0], [17.3, 1300.0], [17.4, 1302.0], [17.5, 1305.0], [17.6, 1308.0], [17.7, 1318.0], [17.8, 1319.0], [17.9, 1325.0], [18.0, 1326.0], [18.1, 1340.0], [18.2, 1364.0], [18.3, 1364.0], [18.4, 1373.0], [18.5, 1376.0], [18.6, 1379.0], [18.7, 1380.0], [18.8, 1381.0], [18.9, 1382.0], [19.0, 1388.0], [19.1, 1389.0], [19.2, 1389.0], [19.3, 1396.0], [19.4, 1396.0], [19.5, 1398.0], [19.6, 1400.0], [19.7, 1400.0], [19.8, 1426.0], [19.9, 1426.0], [20.0, 1469.0], [20.1, 1493.0], [20.2, 1502.0], [20.3, 1512.0], [20.4, 1516.0], [20.5, 1516.0], [20.6, 1526.0], [20.7, 1526.0], [20.8, 1534.0], [20.9, 1535.0], [21.0, 1537.0], [21.1, 1546.0], [21.2, 1556.0], [21.3, 1586.0], [21.4, 1595.0], [21.5, 1613.0], [21.6, 1618.0], [21.7, 1618.0], [21.8, 1627.0], [21.9, 1638.0], [22.0, 1654.0], [22.1, 1655.0], [22.2, 1656.0], [22.3, 1658.0], [22.4, 1663.0], [22.5, 1679.0], [22.6, 1702.0], [22.7, 1708.0], [22.8, 1722.0], [22.9, 1727.0], [23.0, 1728.0], [23.1, 1728.0], [23.2, 1729.0], [23.3, 1743.0], [23.4, 1772.0], [23.5, 1774.0], [23.6, 1774.0], [23.7, 1779.0], [23.8, 1786.0], [23.9, 1791.0], [24.0, 1792.0], [24.1, 1796.0], [24.2, 1815.0], [24.3, 1820.0], [24.4, 1835.0], [24.5, 1838.0], [24.6, 1850.0], [24.7, 1853.0], [24.8, 1861.0], [24.9, 1868.0], [25.0, 1871.0], [25.1, 1877.0], [25.2, 1885.0], [25.3, 1885.0], [25.4, 1900.0], [25.5, 1908.0], [25.6, 1917.0], [25.7, 1923.0], [25.8, 1925.0], [25.9, 1945.0], [26.0, 1952.0], [26.1, 1961.0], [26.2, 1965.0], [26.3, 1971.0], [26.4, 1987.0], [26.5, 2008.0], [26.6, 2010.0], [26.7, 2015.0], [26.8, 2055.0], [26.9, 2055.0], [27.0, 2057.0], [27.1, 2060.0], [27.2, 2069.0], [27.3, 2071.0], [27.4, 2077.0], [27.5, 2088.0], [27.6, 2089.0], [27.7, 2093.0], [27.8, 2097.0], [27.9, 2125.0], [28.0, 2127.0], [28.1, 2127.0], [28.2, 2138.0], [28.3, 2138.0], [28.4, 2142.0], [28.5, 2143.0], [28.6, 2145.0], [28.7, 2156.0], [28.8, 2171.0], [28.9, 2175.0], [29.0, 2198.0], [29.1, 2230.0], [29.2, 2255.0], [29.3, 2257.0], [29.4, 2273.0], [29.5, 2275.0], [29.6, 2282.0], [29.7, 2285.0], [29.8, 2304.0], [29.9, 2317.0], [30.0, 2327.0], [30.1, 2327.0], [30.2, 2329.0], [30.3, 2333.0], [30.4, 2335.0], [30.5, 2345.0], [30.6, 2362.0], [30.7, 2380.0], [30.8, 2380.0], [30.9, 2406.0], [31.0, 2425.0], [31.1, 2431.0], [31.2, 2433.0], [31.3, 2434.0], [31.4, 2435.0], [31.5, 2442.0], [31.6, 2452.0], [31.7, 2486.0], [31.8, 2517.0], [31.9, 2522.0], [32.0, 2532.0], [32.1, 2535.0], [32.2, 2555.0], [32.3, 2555.0], [32.4, 2559.0], [32.5, 2577.0], [32.6, 2577.0], [32.7, 2582.0], [32.8, 2600.0], [32.9, 2605.0], [33.0, 2608.0], [33.1, 2624.0], [33.2, 2628.0], [33.3, 2646.0], [33.4, 2650.0], [33.5, 2653.0], [33.6, 2655.0], [33.7, 2658.0], [33.8, 2663.0], [33.9, 2703.0], [34.0, 2704.0], [34.1, 2725.0], [34.2, 2726.0], [34.3, 2726.0], [34.4, 2728.0], [34.5, 2729.0], [34.6, 2735.0], [34.7, 2756.0], [34.8, 2767.0], [34.9, 2767.0], [35.0, 2785.0], [35.1, 2795.0], [35.2, 2805.0], [35.3, 2811.0], [35.4, 2825.0], [35.5, 2833.0], [35.6, 2843.0], [35.7, 2903.0], [35.8, 2911.0], [35.9, 2912.0], [36.0, 2924.0], [36.1, 2927.0], [36.2, 2953.0], [36.3, 2954.0], [36.4, 2978.0], [36.5, 2983.0], [36.6, 2997.0], [36.7, 2997.0], [36.8, 3000.0], [36.9, 3011.0], [37.0, 3014.0], [37.1, 3019.0], [37.2, 3024.0], [37.3, 3030.0], [37.4, 3037.0], [37.5, 3041.0], [37.6, 3064.0], [37.7, 3074.0], [37.8, 3079.0], [37.9, 3120.0], [38.0, 3123.0], [38.1, 3126.0], [38.2, 3177.0], [38.3, 3210.0], [38.4, 3268.0], [38.5, 3283.0], [38.6, 3292.0], [38.7, 3301.0], [38.8, 3304.0], [38.9, 3366.0], [39.0, 3398.0], [39.1, 3413.0], [39.2, 3415.0], [39.3, 3418.0], [39.4, 3432.0], [39.5, 3482.0], [39.6, 3502.0], [39.7, 3511.0], [39.8, 3530.0], [39.9, 3534.0], [40.0, 3558.0], [40.1, 3562.0], [40.2, 3573.0], [40.3, 3580.0], [40.4, 3599.0], [40.5, 3610.0], [40.6, 3620.0], [40.7, 3623.0], [40.8, 3627.0], [40.9, 3629.0], [41.0, 3633.0], [41.1, 3641.0], [41.2, 3653.0], [41.3, 3657.0], [41.4, 3676.0], [41.5, 3696.0], [41.6, 3698.0], [41.7, 3703.0], [41.8, 3714.0], [41.9, 3718.0], [42.0, 3726.0], [42.1, 3732.0], [42.2, 3733.0], [42.3, 3738.0], [42.4, 3738.0], [42.5, 3739.0], [42.6, 3752.0], [42.7, 3772.0], [42.8, 3773.0], [42.9, 3779.0], [43.0, 3782.0], [43.1, 3788.0], [43.2, 3797.0], [43.3, 3799.0], [43.4, 3800.0], [43.5, 3811.0], [43.6, 3823.0], [43.7, 3826.0], [43.8, 3850.0], [43.9, 3851.0], [44.0, 3860.0], [44.1, 3873.0], [44.2, 3874.0], [44.3, 3878.0], [44.4, 3882.0], [44.5, 3888.0], [44.6, 3893.0], [44.7, 3904.0], [44.8, 3913.0], [44.9, 3916.0], [45.0, 3927.0], [45.1, 3927.0], [45.2, 3933.0], [45.3, 3933.0], [45.4, 3941.0], [45.5, 3956.0], [45.6, 3964.0], [45.7, 3966.0], [45.8, 3982.0], [45.9, 3987.0], [46.0, 3988.0], [46.1, 3989.0], [46.2, 3992.0], [46.3, 3998.0], [46.4, 4011.0], [46.5, 4015.0], [46.6, 4019.0], [46.7, 4020.0], [46.8, 4033.0], [46.9, 4041.0], [47.0, 4053.0], [47.1, 4055.0], [47.2, 4062.0], [47.3, 4070.0], [47.4, 4079.0], [47.5, 4080.0], [47.6, 4085.0], [47.7, 4090.0], [47.8, 4099.0], [47.9, 4103.0], [48.0, 4104.0], [48.1, 4105.0], [48.2, 4111.0], [48.3, 4120.0], [48.4, 4125.0], [48.5, 4130.0], [48.6, 4130.0], [48.7, 4135.0], [48.8, 4138.0], [48.9, 4141.0], [49.0, 4144.0], [49.1, 4144.0], [49.2, 4149.0], [49.3, 4154.0], [49.4, 4159.0], [49.5, 4160.0], [49.6, 4166.0], [49.7, 4168.0], [49.8, 4169.0], [49.9, 4172.0], [50.0, 4172.0], [50.1, 4173.0], [50.2, 4173.0], [50.3, 4175.0], [50.4, 4179.0], [50.5, 4182.0], [50.6, 4184.0], [50.7, 4185.0], [50.8, 4185.0], [50.9, 4186.0], [51.0, 4187.0], [51.1, 4188.0], [51.2, 4192.0], [51.3, 4195.0], [51.4, 4195.0], [51.5, 4204.0], [51.6, 4206.0], [51.7, 4209.0], [51.8, 4213.0], [51.9, 4216.0], [52.0, 4219.0], [52.1, 4226.0], [52.2, 4231.0], [52.3, 4231.0], [52.4, 4233.0], [52.5, 4237.0], [52.6, 4240.0], [52.7, 4241.0], [52.8, 4242.0], [52.9, 4244.0], [53.0, 4245.0], [53.1, 4246.0], [53.2, 4253.0], [53.3, 4254.0], [53.4, 4256.0], [53.5, 4261.0], [53.6, 4264.0], [53.7, 4265.0], [53.8, 4268.0], [53.9, 4277.0], [54.0, 4280.0], [54.1, 4281.0], [54.2, 4282.0], [54.3, 4283.0], [54.4, 4284.0], [54.5, 4285.0], [54.6, 4289.0], [54.7, 4292.0], [54.8, 4297.0], [54.9, 4298.0], [55.0, 4302.0], [55.1, 4304.0], [55.2, 4305.0], [55.3, 4307.0], [55.4, 4310.0], [55.5, 4311.0], [55.6, 4313.0], [55.7, 4317.0], [55.8, 4323.0], [55.9, 4326.0], [56.0, 4329.0], [56.1, 4330.0], [56.2, 4330.0], [56.3, 4336.0], [56.4, 4344.0], [56.5, 4344.0], [56.6, 4346.0], [56.7, 4348.0], [56.8, 4351.0], [56.9, 4353.0], [57.0, 4353.0], [57.1, 4353.0], [57.2, 4356.0], [57.3, 4357.0], [57.4, 4357.0], [57.5, 4366.0], [57.6, 4366.0], [57.7, 4368.0], [57.8, 4372.0], [57.9, 4372.0], [58.0, 4376.0], [58.1, 4379.0], [58.2, 4382.0], [58.3, 4384.0], [58.4, 4388.0], [58.5, 4388.0], [58.6, 4389.0], [58.7, 4392.0], [58.8, 4394.0], [58.9, 4395.0], [59.0, 4397.0], [59.1, 4400.0], [59.2, 4403.0], [59.3, 4408.0], [59.4, 4411.0], [59.5, 4412.0], [59.6, 4413.0], [59.7, 4414.0], [59.8, 4422.0], [59.9, 4426.0], [60.0, 4426.0], [60.1, 4434.0], [60.2, 4436.0], [60.3, 4436.0], [60.4, 4436.0], [60.5, 4438.0], [60.6, 4438.0], [60.7, 4442.0], [60.8, 4442.0], [60.9, 4446.0], [61.0, 4449.0], [61.1, 4452.0], [61.2, 4454.0], [61.3, 4459.0], [61.4, 4459.0], [61.5, 4461.0], [61.6, 4464.0], [61.7, 4465.0], [61.8, 4466.0], [61.9, 4466.0], [62.0, 4466.0], [62.1, 4467.0], [62.2, 4477.0], [62.3, 4478.0], [62.4, 4480.0], [62.5, 4482.0], [62.6, 4482.0], [62.7, 4486.0], [62.8, 4488.0], [62.9, 4494.0], [63.0, 4498.0], [63.1, 4500.0], [63.2, 4501.0], [63.3, 4502.0], [63.4, 4503.0], [63.5, 4504.0], [63.6, 4511.0], [63.7, 4515.0], [63.8, 4515.0], [63.9, 4516.0], [64.0, 4520.0], [64.1, 4524.0], [64.2, 4526.0], [64.3, 4527.0], [64.4, 4530.0], [64.5, 4530.0], [64.6, 4531.0], [64.7, 4531.0], [64.8, 4535.0], [64.9, 4539.0], [65.0, 4543.0], [65.1, 4544.0], [65.2, 4544.0], [65.3, 4545.0], [65.4, 4548.0], [65.5, 4550.0], [65.6, 4555.0], [65.7, 4556.0], [65.8, 4559.0], [65.9, 4559.0], [66.0, 4563.0], [66.1, 4564.0], [66.2, 4566.0], [66.3, 4568.0], [66.4, 4568.0], [66.5, 4571.0], [66.6, 4574.0], [66.7, 4577.0], [66.8, 4581.0], [66.9, 4582.0], [67.0, 4585.0], [67.1, 4587.0], [67.2, 4588.0], [67.3, 4592.0], [67.4, 4594.0], [67.5, 4595.0], [67.6, 4599.0], [67.7, 4601.0], [67.8, 4601.0], [67.9, 4604.0], [68.0, 4610.0], [68.1, 4611.0], [68.2, 4613.0], [68.3, 4613.0], [68.4, 4614.0], [68.5, 4615.0], [68.6, 4617.0], [68.7, 4619.0], [68.8, 4622.0], [68.9, 4625.0], [69.0, 4631.0], [69.1, 4632.0], [69.2, 4633.0], [69.3, 4634.0], [69.4, 4650.0], [69.5, 4651.0], [69.6, 4651.0], [69.7, 4652.0], [69.8, 4657.0], [69.9, 4672.0], [70.0, 4679.0], [70.1, 4686.0], [70.2, 4687.0], [70.3, 4690.0], [70.4, 4691.0], [70.5, 4692.0], [70.6, 4696.0], [70.7, 4696.0], [70.8, 4697.0], [70.9, 4700.0], [71.0, 4703.0], [71.1, 4709.0], [71.2, 4714.0], [71.3, 4715.0], [71.4, 4715.0], [71.5, 4723.0], [71.6, 4724.0], [71.7, 4735.0], [71.8, 4735.0], [71.9, 4738.0], [72.0, 4739.0], [72.1, 4739.0], [72.2, 4749.0], [72.3, 4749.0], [72.4, 4752.0], [72.5, 4753.0], [72.6, 4755.0], [72.7, 4756.0], [72.8, 4759.0], [72.9, 4762.0], [73.0, 4768.0], [73.1, 4772.0], [73.2, 4774.0], [73.3, 4776.0], [73.4, 4776.0], [73.5, 4776.0], [73.6, 4779.0], [73.7, 4780.0], [73.8, 4786.0], [73.9, 4792.0], [74.0, 4797.0], [74.1, 4801.0], [74.2, 4802.0], [74.3, 4803.0], [74.4, 4803.0], [74.5, 4806.0], [74.6, 4813.0], [74.7, 4818.0], [74.8, 4818.0], [74.9, 4830.0], [75.0, 4830.0], [75.1, 4835.0], [75.2, 4838.0], [75.3, 4847.0], [75.4, 4853.0], [75.5, 4861.0], [75.6, 4864.0], [75.7, 4872.0], [75.8, 4872.0], [75.9, 4878.0], [76.0, 4879.0], [76.1, 4880.0], [76.2, 4884.0], [76.3, 4886.0], [76.4, 4888.0], [76.5, 4889.0], [76.6, 4892.0], [76.7, 4894.0], [76.8, 4899.0], [76.9, 4901.0], [77.0, 4901.0], [77.1, 4903.0], [77.2, 4909.0], [77.3, 4910.0], [77.4, 4916.0], [77.5, 4917.0], [77.6, 4924.0], [77.7, 4931.0], [77.8, 4934.0], [77.9, 4936.0], [78.0, 4942.0], [78.1, 4943.0], [78.2, 4951.0], [78.3, 4953.0], [78.4, 4955.0], [78.5, 4958.0], [78.6, 4958.0], [78.7, 4959.0], [78.8, 4964.0], [78.9, 4974.0], [79.0, 4980.0], [79.1, 4981.0], [79.2, 4983.0], [79.3, 4987.0], [79.4, 4991.0], [79.5, 4995.0], [79.6, 4997.0], [79.7, 4998.0], [79.8, 5000.0], [79.9, 5003.0], [80.0, 5006.0], [80.1, 5020.0], [80.2, 5021.0], [80.3, 5024.0], [80.4, 5032.0], [80.5, 5033.0], [80.6, 5039.0], [80.7, 5044.0], [80.8, 5045.0], [80.9, 5049.0], [81.0, 5050.0], [81.1, 5054.0], [81.2, 5057.0], [81.3, 5057.0], [81.4, 5060.0], [81.5, 5061.0], [81.6, 5071.0], [81.7, 5078.0], [81.8, 5091.0], [81.9, 5094.0], [82.0, 5103.0], [82.1, 5111.0], [82.2, 5113.0], [82.3, 5117.0], [82.4, 5120.0], [82.5, 5120.0], [82.6, 5121.0], [82.7, 5122.0], [82.8, 5123.0], [82.9, 5129.0], [83.0, 5130.0], [83.1, 5138.0], [83.2, 5138.0], [83.3, 5138.0], [83.4, 5138.0], [83.5, 5142.0], [83.6, 5160.0], [83.7, 5172.0], [83.8, 5178.0], [83.9, 5179.0], [84.0, 5182.0], [84.1, 5184.0], [84.2, 5184.0], [84.3, 5188.0], [84.4, 5192.0], [84.5, 5198.0], [84.6, 5205.0], [84.7, 5208.0], [84.8, 5209.0], [84.9, 5212.0], [85.0, 5215.0], [85.1, 5216.0], [85.2, 5220.0], [85.3, 5227.0], [85.4, 5234.0], [85.5, 5237.0], [85.6, 5238.0], [85.7, 5238.0], [85.8, 5240.0], [85.9, 5241.0], [86.0, 5250.0], [86.1, 5261.0], [86.2, 5284.0], [86.3, 5293.0], [86.4, 5296.0], [86.5, 5298.0], [86.6, 5301.0], [86.7, 5314.0], [86.8, 5318.0], [86.9, 5319.0], [87.0, 5322.0], [87.1, 5324.0], [87.2, 5338.0], [87.3, 5340.0], [87.4, 5346.0], [87.5, 5350.0], [87.6, 5367.0], [87.7, 5367.0], [87.8, 5373.0], [87.9, 5377.0], [88.0, 5383.0], [88.1, 5388.0], [88.2, 5399.0], [88.3, 5410.0], [88.4, 5416.0], [88.5, 5420.0], [88.6, 5423.0], [88.7, 5429.0], [88.8, 5434.0], [88.9, 5436.0], [89.0, 5436.0], [89.1, 5438.0], [89.2, 5448.0], [89.3, 5453.0], [89.4, 5456.0], [89.5, 5460.0], [89.6, 5465.0], [89.7, 5474.0], [89.8, 5486.0], [89.9, 5490.0], [90.0, 5490.0], [90.1, 5492.0], [90.2, 5493.0], [90.3, 5495.0], [90.4, 5506.0], [90.5, 5508.0], [90.6, 5526.0], [90.7, 5529.0], [90.8, 5530.0], [90.9, 5531.0], [91.0, 5537.0], [91.1, 5555.0], [91.2, 5568.0], [91.3, 5582.0], [91.4, 5582.0], [91.5, 5586.0], [91.6, 5590.0], [91.7, 5599.0], [91.8, 5601.0], [91.9, 5607.0], [92.0, 5609.0], [92.1, 5613.0], [92.2, 5620.0], [92.3, 5623.0], [92.4, 5631.0], [92.5, 5636.0], [92.6, 5638.0], [92.7, 5638.0], [92.8, 5639.0], [92.9, 5640.0], [93.0, 5656.0], [93.1, 5660.0], [93.2, 5662.0], [93.3, 5662.0], [93.4, 5663.0], [93.5, 5664.0], [93.6, 5672.0], [93.7, 5674.0], [93.8, 5682.0], [93.9, 5683.0], [94.0, 5683.0], [94.1, 5691.0], [94.2, 5703.0], [94.3, 5706.0], [94.4, 5708.0], [94.5, 5708.0], [94.6, 5731.0], [94.7, 5741.0], [94.8, 5748.0], [94.9, 5752.0], [95.0, 5765.0], [95.1, 5767.0], [95.2, 5771.0], [95.3, 5771.0], [95.4, 5773.0], [95.5, 5778.0], [95.6, 5780.0], [95.7, 5801.0], [95.8, 5804.0], [95.9, 5841.0], [96.0, 5891.0], [96.1, 5895.0], [96.2, 5914.0], [96.3, 5916.0], [96.4, 5927.0], [96.5, 5927.0], [96.6, 5928.0], [96.7, 5943.0], [96.8, 5960.0], [96.9, 5971.0], [97.0, 6024.0], [97.1, 6028.0], [97.2, 6029.0], [97.3, 6038.0], [97.4, 6054.0], [97.5, 6072.0], [97.6, 6073.0], [97.7, 6092.0], [97.8, 6100.0], [97.9, 6101.0], [98.0, 6131.0], [98.1, 6141.0], [98.2, 6153.0], [98.3, 6203.0], [98.4, 6218.0], [98.5, 6243.0], [98.6, 6275.0], [98.7, 6296.0], [98.8, 6312.0], [98.9, 6324.0], [99.0, 6381.0], [99.1, 6386.0], [99.2, 6390.0], [99.3, 6474.0], [99.4, 6479.0], [99.5, 6490.0], [99.6, 6602.0], [99.7, 6652.0], [99.8, 6701.0], [99.9, 6787.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 2.0, "minX": 200.0, "maxY": 46.0, "series": [{"data": [[600.0, 12.0], [700.0, 13.0], [800.0, 12.0], [900.0, 18.0], [1000.0, 13.0], [1100.0, 11.0], [1200.0, 12.0], [1300.0, 23.0], [1400.0, 5.0], [1500.0, 13.0], [1600.0, 11.0], [1700.0, 16.0], [1800.0, 12.0], [1900.0, 11.0], [2000.0, 14.0], [2100.0, 12.0], [2200.0, 7.0], [2300.0, 11.0], [2400.0, 9.0], [2500.0, 10.0], [2600.0, 11.0], [2700.0, 13.0], [2800.0, 5.0], [2900.0, 11.0], [3000.0, 11.0], [3100.0, 4.0], [3200.0, 4.0], [3300.0, 4.0], [3400.0, 5.0], [3500.0, 9.0], [3700.0, 17.0], [3600.0, 12.0], [3800.0, 13.0], [3900.0, 17.0], [4000.0, 15.0], [4100.0, 36.0], [4300.0, 41.0], [4200.0, 35.0], [4600.0, 32.0], [4500.0, 46.0], [4400.0, 40.0], [4800.0, 28.0], [4700.0, 32.0], [4900.0, 30.0], [5100.0, 26.0], [5000.0, 22.0], [5200.0, 20.0], [5300.0, 17.0], [5600.0, 24.0], [5400.0, 21.0], [5500.0, 14.0], [5700.0, 15.0], [5800.0, 5.0], [6000.0, 8.0], [5900.0, 8.0], [6100.0, 5.0], [6300.0, 5.0], [6200.0, 5.0], [6400.0, 3.0], [6600.0, 2.0], [6700.0, 2.0], [200.0, 3.0], [300.0, 27.0], [400.0, 29.0], [500.0, 23.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 6700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 59.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 799.0, "series": [{"data": [[1.0, 142.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 59.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 799.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 280.01899999999995, "minX": 1.54958304E12, "maxY": 280.01899999999995, "series": [{"data": [[1.54958304E12, 280.01899999999995]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958304E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 370.4, "minX": 1.0, "maxY": 6701.0, "series": [{"data": [[2.0, 4382.0], [3.0, 4244.0], [4.0, 5448.0], [5.0, 4209.0], [6.0, 5138.0], [8.0, 4368.0], [9.0, 4395.0], [11.0, 4572.5], [13.0, 4580.0], [14.0, 4692.0], [15.0, 4901.0], [17.0, 5051.0], [18.0, 4442.0], [19.0, 4466.0], [20.0, 5024.0], [21.0, 4480.0], [22.0, 5691.0], [23.0, 4366.0], [24.0, 4622.0], [25.0, 4599.0], [26.0, 4459.0], [27.0, 4246.0], [28.0, 4330.0], [29.0, 4434.0], [30.0, 5636.0], [31.0, 4958.0], [33.0, 4379.0], [32.0, 4723.0], [35.0, 4389.0], [34.0, 5416.0], [37.0, 4896.0], [38.0, 2815.5], [39.0, 2325.5], [41.0, 370.4], [40.0, 1224.8], [43.0, 1332.0], [42.0, 1866.8571428571427], [45.0, 1330.25], [44.0, 1043.5], [47.0, 1103.2], [46.0, 2505.5], [49.0, 2848.0], [48.0, 2524.5], [50.0, 401.0], [51.0, 2052.8], [53.0, 4187.0], [52.0, 4175.0], [55.0, 1367.75], [54.0, 4888.0], [56.0, 3001.0], [59.0, 2635.5], [58.0, 4702.0], [61.0, 4924.0], [60.0, 4466.0], [63.0, 1801.75], [62.0, 2875.5], [65.0, 1182.0], [64.0, 1467.75], [66.0, 2446.333333333333], [67.0, 2599.0], [69.0, 2469.0], [68.0, 1249.2], [70.0, 2839.0], [71.0, 4559.0], [75.0, 4120.0], [74.0, 4974.0], [73.0, 4403.0], [72.0, 5490.0], [79.0, 4254.0], [78.0, 4397.0], [77.0, 4755.0], [80.0, 2630.5], [83.0, 1202.1666666666667], [82.0, 2889.5], [81.0, 2655.5], [84.0, 1331.1666666666665], [85.0, 2809.5], [87.0, 2251.0], [86.0, 3129.0], [91.0, 4461.0], [90.0, 4135.0], [89.0, 4079.0], [88.0, 4172.0], [95.0, 4535.0], [94.0, 4488.0], [93.0, 5683.0], [92.0, 4526.0], [96.0, 1500.0], [97.0, 2078.5], [99.0, 2923.25], [103.0, 2300.0], [102.0, 2400.5], [101.0, 4173.0], [100.0, 5324.0], [104.0, 2885.5], [106.0, 3189.5], [105.0, 4818.0], [108.0, 4201.0], [110.0, 1550.5], [109.0, 3311.5], [111.0, 4617.0], [115.0, 3032.0], [114.0, 5771.0], [113.0, 5731.0], [112.0, 6024.0], [117.0, 2600.0], [119.0, 2493.0], [118.0, 4735.0], [116.0, 5660.0], [120.0, 2505.333333333333], [121.0, 2535.5], [123.0, 5971.0], [122.0, 5314.0], [124.0, 2003.3333333333333], [127.0, 4336.0], [126.0, 5030.5], [128.0, 2639.5], [129.0, 2816.0], [130.0, 1612.0], [131.0, 2959.0], [135.0, 4672.0], [134.0, 4329.0], [133.0, 5284.0], [132.0, 4903.0], [136.0, 3064.5], [139.0, 1806.0], [138.0, 2327.0], [140.0, 3688.0], [142.0, 2675.0], [143.0, 763.0], [141.0, 3989.0], [137.0, 5599.0], [144.0, 3771.6666666666665], [145.0, 2876.0], [147.0, 1753.25], [151.0, 4715.0], [150.0, 4880.0], [149.0, 4302.0], [148.0, 5623.0], [146.0, 3992.0], [155.0, 1747.8], [154.0, 3096.5], [158.0, 1033.0], [159.0, 4706.0], [157.0, 4159.0], [156.0, 4687.0], [153.0, 4997.0], [152.0, 5003.0], [165.0, 2227.666666666667], [164.0, 2391.0], [163.0, 2713.666666666667], [162.0, 2181.666666666667], [167.0, 5044.0], [166.0, 3904.0], [161.0, 4973.0], [160.0, 3927.0], [169.0, 1739.8333333333333], [171.0, 2200.75], [170.0, 2824.5], [172.0, 2470.333333333333], [175.0, 4080.0], [174.0, 5354.5], [168.0, 6092.0], [179.0, 2490.5], [183.0, 2013.8], [182.0, 2468.0], [181.0, 4759.5], [178.0, 5748.0], [177.0, 4613.0], [176.0, 4735.0], [184.0, 2950.5], [186.0, 2877.0], [188.0, 2382.0], [190.0, 2837.5], [191.0, 4357.0], [189.0, 6479.0], [187.0, 4015.0], [185.0, 6072.0], [192.0, 2208.75], [195.0, 3208.0], [199.0, 5682.0], [198.0, 4651.0], [197.0, 4959.0], [196.0, 5495.0], [194.0, 5278.0], [201.0, 3145.0], [202.0, 2608.333333333333], [207.0, 1815.0], [206.0, 2193.666666666667], [205.0, 3637.0], [204.0, 2683.0], [203.0, 3039.5], [200.0, 4755.0], [208.0, 3085.666666666667], [209.0, 2880.666666666667], [210.0, 3148.0], [211.0, 2545.5], [215.0, 3369.5], [214.0, 5383.0], [213.0, 4981.0], [212.0, 5683.0], [220.0, 2872.0], [219.0, 2875.333333333333], [222.0, 2291.3333333333335], [223.0, 2587.666666666667], [221.0, 5537.0], [218.0, 5172.0], [217.0, 4753.0], [216.0, 4478.0], [228.0, 3245.5], [230.0, 3939.5], [231.0, 4486.0], [229.0, 6312.0], [227.0, 6101.0], [226.0, 5006.0], [225.0, 4502.0], [224.0, 5318.0], [239.0, 1964.375], [238.0, 2164.5], [237.0, 1880.0], [236.0, 4530.0], [235.0, 4936.0], [234.0, 4886.0], [233.0, 4715.0], [232.0, 4351.0], [242.0, 2934.0], [243.0, 2946.5], [244.0, 2298.25], [246.0, 4522.0], [247.0, 3647.5], [241.0, 4980.0], [240.0, 5741.0], [250.0, 1149.0], [253.0, 1924.0], [255.0, 5238.0], [254.0, 5537.0], [252.0, 5613.0], [251.0, 4611.0], [249.0, 3779.0], [248.0, 3739.0], [270.0, 3264.0], [258.0, 2480.0], [257.0, 2724.6666666666665], [256.0, 2550.0], [263.0, 5639.0], [262.0, 4700.0], [261.0, 4226.0], [260.0, 4983.0], [265.0, 3031.0], [264.0, 2716.0], [267.0, 2935.0], [266.0, 5943.0], [271.0, 2593.4], [269.0, 5291.0], [259.0, 4943.0], [286.0, 5590.0], [281.0, 2570.0], [272.0, 3691.5], [273.0, 5113.0], [275.0, 5071.0], [274.0, 3860.0], [279.0, 4729.5], [278.0, 5301.0], [276.0, 4564.0], [282.0, 3748.5], [287.0, 2560.6666666666665], [285.0, 5208.0], [284.0, 5453.0], [283.0, 3772.0], [280.0, 4527.0], [289.0, 3813.5], [288.0, 2530.3333333333335], [290.0, 3845.0], [291.0, 5138.0], [293.0, 3092.25], [295.0, 3746.0], [294.0, 3331.5], [303.0, 4631.0], [297.0, 6141.0], [296.0, 4298.0], [299.0, 4141.0], [298.0, 5388.0], [302.0, 4503.0], [301.0, 5129.0], [300.0, 4185.0], [318.0, 3464.0], [312.0, 2780.5], [311.0, 2800.75], [310.0, 3297.5], [309.0, 6218.0], [308.0, 5240.0], [313.0, 2925.0], [314.0, 3694.0], [315.0, 4516.0], [317.0, 3883.0], [316.0, 4085.0], [307.0, 5474.0], [306.0, 3799.0], [305.0, 4772.0], [304.0, 5121.0], [319.0, 5465.0], [332.0, 3288.5], [321.0, 2615.5], [323.0, 2868.0], [322.0, 5708.0], [326.0, 3114.0], [325.0, 5928.0], [324.0, 5752.0], [327.0, 4256.0], [320.0, 4498.0], [330.0, 3108.6666666666665], [334.0, 2208.0], [333.0, 2977.5], [335.0, 5023.5], [329.0, 5060.0], [328.0, 4604.0], [331.0, 5057.0], [351.0, 3874.0], [339.0, 2519.6666666666665], [338.0, 5804.0], [337.0, 5927.0], [336.0, 5531.0], [343.0, 4414.0], [342.0, 5586.0], [341.0, 5552.0], [347.0, 3424.5], [348.0, 2738.3333333333335], [350.0, 5198.0], [349.0, 4219.0], [346.0, 4531.0], [345.0, 3610.0], [344.0, 4892.0], [364.0, 2839.5], [352.0, 3747.0], [353.0, 4277.0], [354.0, 3511.0], [355.0, 3030.0], [358.0, 3729.0], [357.0, 4020.0], [356.0, 4388.0], [359.0, 5490.0], [362.0, 3225.6666666666665], [361.0, 5373.0], [360.0, 5420.0], [363.0, 6296.0], [367.0, 3370.5], [366.0, 6701.0], [365.0, 5492.0], [382.0, 4501.0], [368.0, 3956.0], [370.0, 2498.6666666666665], [369.0, 6490.0], [371.0, 4792.5], [375.0, 3826.5], [374.0, 3355.5], [373.0, 4934.0], [372.0, 4830.0], [383.0, 5296.0], [377.0, 4615.0], [376.0, 4634.0], [381.0, 5410.0], [380.0, 4571.0], [379.0, 4412.0], [378.0, 4951.0], [387.0, 3657.0], [386.0, 3085.6666666666665], [385.0, 4004.0], [384.0, 3284.3333333333335], [390.0, 3980.0], [389.0, 4520.0], [388.0, 5338.0], [391.0, 4184.0], [394.0, 3481.5], [395.0, 3698.0], [397.0, 3436.0], [396.0, 4776.0], [398.0, 3944.0], [399.0, 3635.0], [393.0, 5377.0], [392.0, 5049.0], [413.0, 2726.0], [402.0, 3944.5], [404.0, 2912.0], [405.0, 4394.0], [407.0, 5367.0], [401.0, 3696.0], [400.0, 3752.0], [406.0, 5045.0], [408.0, 3258.25], [411.0, 2985.875], [412.0, 3566.0], [403.0, 5656.0], [410.0, 3813.0], [409.0, 4995.0], [415.0, 3259.0], [414.0, 4882.0], [429.0, 3211.5], [417.0, 3408.0], [418.0, 3580.6666666666665], [428.0, 4686.0], [419.0, 5555.0], [416.0, 3517.5], [423.0, 3738.0], [421.0, 3613.25], [420.0, 5662.0], [422.0, 4326.5], [427.0, 3575.0], [426.0, 5184.0], [425.0, 3956.0], [424.0, 5117.0], [431.0, 5801.0], [430.0, 4991.0], [444.0, 3279.3333333333335], [432.0, 4047.0], [435.0, 5638.0], [434.0, 4577.0], [433.0, 5039.0], [439.0, 4511.0], [437.0, 3586.5], [436.0, 4861.0], [438.0, 3561.0], [445.0, 2719.6666666666665], [447.0, 3222.3333333333335], [441.0, 6073.0], [440.0, 4592.0], [446.0, 4206.0], [443.0, 5138.0], [442.0, 5582.0], [462.0, 3770.0], [454.0, 4003.0], [453.0, 4714.0], [452.0, 5298.0], [455.0, 2894.5], [456.0, 3102.0], [459.0, 3153.25], [461.0, 3707.0], [463.0, 3826.0], [460.0, 4353.0], [451.0, 4853.0], [450.0, 4304.0], [449.0, 5021.0], [448.0, 4738.0], [458.0, 4144.0], [457.0, 4357.0], [477.0, 3720.6666666666665], [467.0, 4277.5], [466.0, 5103.0], [465.0, 4436.0], [464.0, 3823.0], [470.0, 3371.3333333333335], [469.0, 5367.0], [468.0, 4909.0], [471.0, 4243.0], [474.0, 4257.5], [475.0, 3632.5], [478.0, 3698.0], [479.0, 3988.0], [473.0, 5061.0], [472.0, 4619.0], [476.0, 4348.0], [483.0, 3930.75], [481.0, 4082.0], [480.0, 3154.0], [487.0, 3534.0], [486.0, 4585.0], [482.0, 4161.0], [485.0, 3266.0], [484.0, 4086.0], [493.0, 3030.0], [492.0, 5773.0], [495.0, 5340.0], [489.0, 5033.0], [488.0, 4454.0], [491.0, 4899.0], [490.0, 5142.0], [494.0, 5607.0], [510.0, 4588.0], [496.0, 3280.5], [500.0, 3350.0], [501.0, 3916.0], [499.0, 3916.0], [498.0, 4446.0], [497.0, 4426.0], [502.0, 4131.0], [503.0, 4344.0], [511.0, 4213.0], [505.0, 4601.0], [504.0, 4594.0], [509.0, 4550.0], [508.0, 4566.0], [507.0, 4125.0], [506.0, 4166.0], [540.0, 4388.0], [543.0, 3966.0], [529.0, 4268.0], [528.0, 4813.0], [531.0, 4696.0], [530.0, 4231.0], [533.0, 4610.0], [532.0, 5237.0], [542.0, 3933.0], [541.0, 3657.0], [539.0, 4500.0], [538.0, 4955.0], [537.0, 4543.0], [536.0, 4368.0], [527.0, 4326.0], [512.0, 4568.0], [514.0, 4703.0], [513.0, 4366.0], [516.0, 5138.0], [515.0, 4264.0], [518.0, 3732.0], [517.0, 4917.0], [526.0, 4574.0], [525.0, 3304.0], [524.0, 4019.0], [523.0, 5261.0], [522.0, 4563.0], [521.0, 3580.0], [520.0, 4122.0], [535.0, 4910.0], [534.0, 4289.0], [572.0, 3292.0], [575.0, 4265.0], [560.0, 3998.0], [562.0, 4041.0], [561.0, 4555.0], [565.0, 4494.0], [564.0, 4771.0], [574.0, 4413.0], [573.0, 3703.0], [571.0, 3123.0], [570.0, 4103.0], [569.0, 3511.0], [568.0, 4323.0], [559.0, 3850.0], [545.0, 4901.0], [544.0, 3726.0], [547.0, 3788.0], [546.0, 4581.0], [549.0, 4504.0], [548.0, 4438.0], [551.0, 4149.0], [550.0, 4204.0], [558.0, 3927.0], [557.0, 4240.0], [556.0, 4344.0], [555.0, 4411.0], [554.0, 3913.0], [553.0, 4179.0], [552.0, 4436.0], [567.0, 3797.0], [566.0, 4104.0], [604.0, 4601.0], [607.0, 4346.0], [593.0, 4524.0], [592.0, 4353.0], [595.0, 3599.0], [594.0, 4559.0], [597.0, 4055.0], [596.0, 4544.0], [606.0, 4011.0], [605.0, 3773.0], [603.0, 3418.0], [602.0, 3878.0], [601.0, 3398.0], [600.0, 3629.0], [591.0, 3064.0], [577.0, 4650.0], [576.0, 4090.0], [579.0, 3530.0], [578.0, 4422.0], [581.0, 4838.0], [580.0, 3413.0], [583.0, 4253.0], [582.0, 3653.0], [590.0, 3893.0], [589.0, 4033.5], [587.0, 4292.0], [586.0, 4154.0], [585.0, 4245.0], [584.0, 3558.0], [599.0, 4111.0], [598.0, 3987.0], [610.0, 3502.0], [609.0, 4168.0], [608.0, 3482.0], [1.0, 4459.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[280.01899999999995, 3500.9180000000033]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 610.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6283.333333333333, "minX": 1.54958304E12, "maxY": 6982.0, "series": [{"data": [[1.54958304E12, 6982.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958304E12, 6283.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958304E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3500.9180000000033, "minX": 1.54958304E12, "maxY": 3500.9180000000033, "series": [{"data": [[1.54958304E12, 3500.9180000000033]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958304E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3500.9129999999996, "minX": 1.54958304E12, "maxY": 3500.9129999999996, "series": [{"data": [[1.54958304E12, 3500.9129999999996]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958304E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 51.29900000000002, "minX": 1.54958304E12, "maxY": 51.29900000000002, "series": [{"data": [[1.54958304E12, 51.29900000000002]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958304E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 251.0, "minX": 1.54958304E12, "maxY": 6787.0, "series": [{"data": [[1.54958304E12, 6787.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958304E12, 251.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958304E12, 5490.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958304E12, 6380.43]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958304E12, 5764.349999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958304E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4172.5, "minX": 16.0, "maxY": 4172.5, "series": [{"data": [[16.0, 4172.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4172.5, "minX": 16.0, "maxY": 4172.5, "series": [{"data": [[16.0, 4172.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958304E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958304E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958304E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958304E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958304E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958304E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958304E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958304E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958304E12, "title": "Transactions Per Second"}},
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
