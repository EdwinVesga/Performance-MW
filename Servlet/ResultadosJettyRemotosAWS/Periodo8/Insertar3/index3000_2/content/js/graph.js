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
        data: {"result": {"minY": 191.0, "minX": 0.0, "maxY": 9351.0, "series": [{"data": [[0.0, 191.0], [0.1, 215.0], [0.2, 243.0], [0.3, 271.0], [0.4, 279.0], [0.5, 284.0], [0.6, 293.0], [0.7, 303.0], [0.8, 316.0], [0.9, 322.0], [1.0, 327.0], [1.1, 332.0], [1.2, 333.0], [1.3, 346.0], [1.4, 361.0], [1.5, 366.0], [1.6, 371.0], [1.7, 372.0], [1.8, 381.0], [1.9, 382.0], [2.0, 396.0], [2.1, 398.0], [2.2, 402.0], [2.3, 407.0], [2.4, 415.0], [2.5, 417.0], [2.6, 421.0], [2.7, 425.0], [2.8, 428.0], [2.9, 437.0], [3.0, 442.0], [3.1, 444.0], [3.2, 446.0], [3.3, 450.0], [3.4, 460.0], [3.5, 460.0], [3.6, 464.0], [3.7, 469.0], [3.8, 486.0], [3.9, 494.0], [4.0, 499.0], [4.1, 506.0], [4.2, 511.0], [4.3, 517.0], [4.4, 527.0], [4.5, 531.0], [4.6, 540.0], [4.7, 548.0], [4.8, 559.0], [4.9, 560.0], [5.0, 568.0], [5.1, 573.0], [5.2, 583.0], [5.3, 590.0], [5.4, 602.0], [5.5, 607.0], [5.6, 614.0], [5.7, 617.0], [5.8, 625.0], [5.9, 630.0], [6.0, 641.0], [6.1, 649.0], [6.2, 662.0], [6.3, 670.0], [6.4, 679.0], [6.5, 697.0], [6.6, 700.0], [6.7, 730.0], [6.8, 748.0], [6.9, 751.0], [7.0, 761.0], [7.1, 763.0], [7.2, 768.0], [7.3, 785.0], [7.4, 792.0], [7.5, 800.0], [7.6, 810.0], [7.7, 821.0], [7.8, 833.0], [7.9, 842.0], [8.0, 851.0], [8.1, 860.0], [8.2, 869.0], [8.3, 884.0], [8.4, 894.0], [8.5, 909.0], [8.6, 917.0], [8.7, 939.0], [8.8, 945.0], [8.9, 952.0], [9.0, 959.0], [9.1, 963.0], [9.2, 978.0], [9.3, 989.0], [9.4, 996.0], [9.5, 1000.0], [9.6, 1011.0], [9.7, 1018.0], [9.8, 1026.0], [9.9, 1028.0], [10.0, 1039.0], [10.1, 1054.0], [10.2, 1067.0], [10.3, 1074.0], [10.4, 1078.0], [10.5, 1082.0], [10.6, 1088.0], [10.7, 1094.0], [10.8, 1099.0], [10.9, 1108.0], [11.0, 1121.0], [11.1, 1124.0], [11.2, 1134.0], [11.3, 1152.0], [11.4, 1157.0], [11.5, 1180.0], [11.6, 1185.0], [11.7, 1205.0], [11.8, 1215.0], [11.9, 1227.0], [12.0, 1241.0], [12.1, 1256.0], [12.2, 1272.0], [12.3, 1278.0], [12.4, 1286.0], [12.5, 1293.0], [12.6, 1313.0], [12.7, 1337.0], [12.8, 1359.0], [12.9, 1369.0], [13.0, 1376.0], [13.1, 1382.0], [13.2, 1389.0], [13.3, 1393.0], [13.4, 1404.0], [13.5, 1408.0], [13.6, 1416.0], [13.7, 1421.0], [13.8, 1426.0], [13.9, 1434.0], [14.0, 1447.0], [14.1, 1453.0], [14.2, 1458.0], [14.3, 1484.0], [14.4, 1505.0], [14.5, 1516.0], [14.6, 1526.0], [14.7, 1530.0], [14.8, 1539.0], [14.9, 1540.0], [15.0, 1561.0], [15.1, 1584.0], [15.2, 1588.0], [15.3, 1598.0], [15.4, 1603.0], [15.5, 1606.0], [15.6, 1615.0], [15.7, 1625.0], [15.8, 1646.0], [15.9, 1655.0], [16.0, 1661.0], [16.1, 1672.0], [16.2, 1678.0], [16.3, 1683.0], [16.4, 1687.0], [16.5, 1689.0], [16.6, 1700.0], [16.7, 1719.0], [16.8, 1725.0], [16.9, 1731.0], [17.0, 1747.0], [17.1, 1754.0], [17.2, 1760.0], [17.3, 1776.0], [17.4, 1791.0], [17.5, 1807.0], [17.6, 1823.0], [17.7, 1832.0], [17.8, 1835.0], [17.9, 1840.0], [18.0, 1844.0], [18.1, 1856.0], [18.2, 1870.0], [18.3, 1880.0], [18.4, 1891.0], [18.5, 1903.0], [18.6, 1910.0], [18.7, 1917.0], [18.8, 1922.0], [18.9, 1926.0], [19.0, 1932.0], [19.1, 1934.0], [19.2, 1941.0], [19.3, 1958.0], [19.4, 1965.0], [19.5, 1974.0], [19.6, 1984.0], [19.7, 1988.0], [19.8, 1995.0], [19.9, 1999.0], [20.0, 2010.0], [20.1, 2016.0], [20.2, 2024.0], [20.3, 2039.0], [20.4, 2051.0], [20.5, 2064.0], [20.6, 2075.0], [20.7, 2078.0], [20.8, 2082.0], [20.9, 2094.0], [21.0, 2096.0], [21.1, 2112.0], [21.2, 2121.0], [21.3, 2123.0], [21.4, 2125.0], [21.5, 2134.0], [21.6, 2141.0], [21.7, 2144.0], [21.8, 2147.0], [21.9, 2152.0], [22.0, 2160.0], [22.1, 2176.0], [22.2, 2187.0], [22.3, 2202.0], [22.4, 2209.0], [22.5, 2218.0], [22.6, 2226.0], [22.7, 2231.0], [22.8, 2240.0], [22.9, 2248.0], [23.0, 2254.0], [23.1, 2266.0], [23.2, 2269.0], [23.3, 2275.0], [23.4, 2280.0], [23.5, 2283.0], [23.6, 2287.0], [23.7, 2298.0], [23.8, 2316.0], [23.9, 2333.0], [24.0, 2343.0], [24.1, 2355.0], [24.2, 2362.0], [24.3, 2371.0], [24.4, 2386.0], [24.5, 2390.0], [24.6, 2401.0], [24.7, 2414.0], [24.8, 2426.0], [24.9, 2436.0], [25.0, 2452.0], [25.1, 2456.0], [25.2, 2460.0], [25.3, 2468.0], [25.4, 2479.0], [25.5, 2481.0], [25.6, 2485.0], [25.7, 2491.0], [25.8, 2501.0], [25.9, 2507.0], [26.0, 2515.0], [26.1, 2530.0], [26.2, 2533.0], [26.3, 2535.0], [26.4, 2546.0], [26.5, 2555.0], [26.6, 2570.0], [26.7, 2580.0], [26.8, 2600.0], [26.9, 2607.0], [27.0, 2608.0], [27.1, 2621.0], [27.2, 2626.0], [27.3, 2630.0], [27.4, 2640.0], [27.5, 2646.0], [27.6, 2661.0], [27.7, 2670.0], [27.8, 2686.0], [27.9, 2708.0], [28.0, 2712.0], [28.1, 2718.0], [28.2, 2731.0], [28.3, 2734.0], [28.4, 2743.0], [28.5, 2755.0], [28.6, 2760.0], [28.7, 2769.0], [28.8, 2771.0], [28.9, 2781.0], [29.0, 2790.0], [29.1, 2794.0], [29.2, 2801.0], [29.3, 2809.0], [29.4, 2816.0], [29.5, 2821.0], [29.6, 2826.0], [29.7, 2837.0], [29.8, 2846.0], [29.9, 2854.0], [30.0, 2863.0], [30.1, 2871.0], [30.2, 2877.0], [30.3, 2892.0], [30.4, 2900.0], [30.5, 2918.0], [30.6, 2924.0], [30.7, 2929.0], [30.8, 2940.0], [30.9, 2955.0], [31.0, 2960.0], [31.1, 2965.0], [31.2, 2973.0], [31.3, 2978.0], [31.4, 2982.0], [31.5, 2986.0], [31.6, 2989.0], [31.7, 2998.0], [31.8, 3003.0], [31.9, 3011.0], [32.0, 3015.0], [32.1, 3023.0], [32.2, 3034.0], [32.3, 3043.0], [32.4, 3050.0], [32.5, 3058.0], [32.6, 3066.0], [32.7, 3081.0], [32.8, 3090.0], [32.9, 3098.0], [33.0, 3103.0], [33.1, 3112.0], [33.2, 3118.0], [33.3, 3128.0], [33.4, 3133.0], [33.5, 3137.0], [33.6, 3147.0], [33.7, 3148.0], [33.8, 3159.0], [33.9, 3163.0], [34.0, 3169.0], [34.1, 3174.0], [34.2, 3184.0], [34.3, 3189.0], [34.4, 3196.0], [34.5, 3214.0], [34.6, 3217.0], [34.7, 3221.0], [34.8, 3229.0], [34.9, 3233.0], [35.0, 3246.0], [35.1, 3249.0], [35.2, 3254.0], [35.3, 3258.0], [35.4, 3259.0], [35.5, 3260.0], [35.6, 3273.0], [35.7, 3280.0], [35.8, 3281.0], [35.9, 3284.0], [36.0, 3290.0], [36.1, 3296.0], [36.2, 3307.0], [36.3, 3310.0], [36.4, 3315.0], [36.5, 3331.0], [36.6, 3335.0], [36.7, 3346.0], [36.8, 3356.0], [36.9, 3362.0], [37.0, 3366.0], [37.1, 3368.0], [37.2, 3372.0], [37.3, 3380.0], [37.4, 3391.0], [37.5, 3398.0], [37.6, 3400.0], [37.7, 3408.0], [37.8, 3414.0], [37.9, 3417.0], [38.0, 3424.0], [38.1, 3425.0], [38.2, 3432.0], [38.3, 3446.0], [38.4, 3450.0], [38.5, 3455.0], [38.6, 3460.0], [38.7, 3465.0], [38.8, 3471.0], [38.9, 3483.0], [39.0, 3493.0], [39.1, 3495.0], [39.2, 3499.0], [39.3, 3505.0], [39.4, 3508.0], [39.5, 3511.0], [39.6, 3516.0], [39.7, 3521.0], [39.8, 3528.0], [39.9, 3533.0], [40.0, 3538.0], [40.1, 3545.0], [40.2, 3548.0], [40.3, 3559.0], [40.4, 3562.0], [40.5, 3564.0], [40.6, 3573.0], [40.7, 3574.0], [40.8, 3576.0], [40.9, 3580.0], [41.0, 3585.0], [41.1, 3590.0], [41.2, 3592.0], [41.3, 3599.0], [41.4, 3609.0], [41.5, 3611.0], [41.6, 3614.0], [41.7, 3629.0], [41.8, 3633.0], [41.9, 3637.0], [42.0, 3642.0], [42.1, 3651.0], [42.2, 3655.0], [42.3, 3666.0], [42.4, 3671.0], [42.5, 3677.0], [42.6, 3683.0], [42.7, 3685.0], [42.8, 3692.0], [42.9, 3693.0], [43.0, 3697.0], [43.1, 3700.0], [43.2, 3703.0], [43.3, 3708.0], [43.4, 3720.0], [43.5, 3722.0], [43.6, 3733.0], [43.7, 3735.0], [43.8, 3739.0], [43.9, 3744.0], [44.0, 3750.0], [44.1, 3760.0], [44.2, 3771.0], [44.3, 3774.0], [44.4, 3779.0], [44.5, 3786.0], [44.6, 3793.0], [44.7, 3801.0], [44.8, 3806.0], [44.9, 3811.0], [45.0, 3816.0], [45.1, 3818.0], [45.2, 3822.0], [45.3, 3825.0], [45.4, 3827.0], [45.5, 3840.0], [45.6, 3852.0], [45.7, 3857.0], [45.8, 3863.0], [45.9, 3866.0], [46.0, 3871.0], [46.1, 3878.0], [46.2, 3889.0], [46.3, 3892.0], [46.4, 3899.0], [46.5, 3901.0], [46.6, 3902.0], [46.7, 3915.0], [46.8, 3929.0], [46.9, 3933.0], [47.0, 3937.0], [47.1, 3942.0], [47.2, 3955.0], [47.3, 3963.0], [47.4, 3970.0], [47.5, 3975.0], [47.6, 3980.0], [47.7, 3985.0], [47.8, 3988.0], [47.9, 3999.0], [48.0, 4002.0], [48.1, 4019.0], [48.2, 4023.0], [48.3, 4029.0], [48.4, 4031.0], [48.5, 4038.0], [48.6, 4042.0], [48.7, 4046.0], [48.8, 4057.0], [48.9, 4064.0], [49.0, 4071.0], [49.1, 4087.0], [49.2, 4089.0], [49.3, 4094.0], [49.4, 4097.0], [49.5, 4104.0], [49.6, 4108.0], [49.7, 4114.0], [49.8, 4116.0], [49.9, 4121.0], [50.0, 4122.0], [50.1, 4125.0], [50.2, 4131.0], [50.3, 4139.0], [50.4, 4146.0], [50.5, 4150.0], [50.6, 4154.0], [50.7, 4160.0], [50.8, 4161.0], [50.9, 4167.0], [51.0, 4170.0], [51.1, 4173.0], [51.2, 4181.0], [51.3, 4186.0], [51.4, 4188.0], [51.5, 4195.0], [51.6, 4201.0], [51.7, 4206.0], [51.8, 4210.0], [51.9, 4216.0], [52.0, 4218.0], [52.1, 4222.0], [52.2, 4231.0], [52.3, 4240.0], [52.4, 4250.0], [52.5, 4263.0], [52.6, 4266.0], [52.7, 4275.0], [52.8, 4280.0], [52.9, 4293.0], [53.0, 4295.0], [53.1, 4301.0], [53.2, 4309.0], [53.3, 4315.0], [53.4, 4323.0], [53.5, 4328.0], [53.6, 4332.0], [53.7, 4340.0], [53.8, 4355.0], [53.9, 4360.0], [54.0, 4365.0], [54.1, 4378.0], [54.2, 4380.0], [54.3, 4384.0], [54.4, 4386.0], [54.5, 4394.0], [54.6, 4397.0], [54.7, 4399.0], [54.8, 4412.0], [54.9, 4430.0], [55.0, 4440.0], [55.1, 4452.0], [55.2, 4467.0], [55.3, 4478.0], [55.4, 4485.0], [55.5, 4493.0], [55.6, 4499.0], [55.7, 4519.0], [55.8, 4524.0], [55.9, 4532.0], [56.0, 4534.0], [56.1, 4550.0], [56.2, 4553.0], [56.3, 4562.0], [56.4, 4577.0], [56.5, 4581.0], [56.6, 4588.0], [56.7, 4598.0], [56.8, 4602.0], [56.9, 4609.0], [57.0, 4615.0], [57.1, 4629.0], [57.2, 4635.0], [57.3, 4648.0], [57.4, 4652.0], [57.5, 4665.0], [57.6, 4670.0], [57.7, 4676.0], [57.8, 4683.0], [57.9, 4688.0], [58.0, 4694.0], [58.1, 4696.0], [58.2, 4701.0], [58.3, 4707.0], [58.4, 4715.0], [58.5, 4733.0], [58.6, 4739.0], [58.7, 4747.0], [58.8, 4753.0], [58.9, 4756.0], [59.0, 4763.0], [59.1, 4769.0], [59.2, 4776.0], [59.3, 4789.0], [59.4, 4800.0], [59.5, 4802.0], [59.6, 4808.0], [59.7, 4822.0], [59.8, 4827.0], [59.9, 4839.0], [60.0, 4858.0], [60.1, 4868.0], [60.2, 4878.0], [60.3, 4884.0], [60.4, 4902.0], [60.5, 4904.0], [60.6, 4915.0], [60.7, 4921.0], [60.8, 4933.0], [60.9, 4946.0], [61.0, 4948.0], [61.1, 4962.0], [61.2, 4969.0], [61.3, 4975.0], [61.4, 4981.0], [61.5, 5008.0], [61.6, 5019.0], [61.7, 5023.0], [61.8, 5029.0], [61.9, 5039.0], [62.0, 5047.0], [62.1, 5057.0], [62.2, 5066.0], [62.3, 5080.0], [62.4, 5089.0], [62.5, 5106.0], [62.6, 5118.0], [62.7, 5136.0], [62.8, 5139.0], [62.9, 5142.0], [63.0, 5153.0], [63.1, 5168.0], [63.2, 5181.0], [63.3, 5185.0], [63.4, 5190.0], [63.5, 5201.0], [63.6, 5213.0], [63.7, 5218.0], [63.8, 5219.0], [63.9, 5230.0], [64.0, 5246.0], [64.1, 5254.0], [64.2, 5262.0], [64.3, 5269.0], [64.4, 5276.0], [64.5, 5279.0], [64.6, 5293.0], [64.7, 5296.0], [64.8, 5303.0], [64.9, 5311.0], [65.0, 5325.0], [65.1, 5328.0], [65.2, 5343.0], [65.3, 5353.0], [65.4, 5359.0], [65.5, 5363.0], [65.6, 5376.0], [65.7, 5379.0], [65.8, 5385.0], [65.9, 5390.0], [66.0, 5400.0], [66.1, 5406.0], [66.2, 5410.0], [66.3, 5414.0], [66.4, 5432.0], [66.5, 5438.0], [66.6, 5455.0], [66.7, 5465.0], [66.8, 5468.0], [66.9, 5474.0], [67.0, 5481.0], [67.1, 5487.0], [67.2, 5499.0], [67.3, 5514.0], [67.4, 5523.0], [67.5, 5531.0], [67.6, 5533.0], [67.7, 5548.0], [67.8, 5556.0], [67.9, 5558.0], [68.0, 5570.0], [68.1, 5581.0], [68.2, 5591.0], [68.3, 5597.0], [68.4, 5603.0], [68.5, 5611.0], [68.6, 5614.0], [68.7, 5620.0], [68.8, 5622.0], [68.9, 5632.0], [69.0, 5647.0], [69.1, 5654.0], [69.2, 5662.0], [69.3, 5670.0], [69.4, 5695.0], [69.5, 5707.0], [69.6, 5714.0], [69.7, 5719.0], [69.8, 5727.0], [69.9, 5734.0], [70.0, 5743.0], [70.1, 5750.0], [70.2, 5756.0], [70.3, 5772.0], [70.4, 5785.0], [70.5, 5791.0], [70.6, 5802.0], [70.7, 5814.0], [70.8, 5819.0], [70.9, 5844.0], [71.0, 5847.0], [71.1, 5855.0], [71.2, 5869.0], [71.3, 5887.0], [71.4, 5908.0], [71.5, 5911.0], [71.6, 5917.0], [71.7, 5921.0], [71.8, 5924.0], [71.9, 5928.0], [72.0, 5932.0], [72.1, 5937.0], [72.2, 5947.0], [72.3, 5953.0], [72.4, 5960.0], [72.5, 5968.0], [72.6, 5970.0], [72.7, 5972.0], [72.8, 5978.0], [72.9, 5983.0], [73.0, 5985.0], [73.1, 5988.0], [73.2, 5999.0], [73.3, 6002.0], [73.4, 6008.0], [73.5, 6013.0], [73.6, 6019.0], [73.7, 6028.0], [73.8, 6035.0], [73.9, 6039.0], [74.0, 6051.0], [74.1, 6059.0], [74.2, 6067.0], [74.3, 6073.0], [74.4, 6093.0], [74.5, 6097.0], [74.6, 6099.0], [74.7, 6107.0], [74.8, 6123.0], [74.9, 6129.0], [75.0, 6134.0], [75.1, 6143.0], [75.2, 6153.0], [75.3, 6167.0], [75.4, 6175.0], [75.5, 6189.0], [75.6, 6199.0], [75.7, 6205.0], [75.8, 6209.0], [75.9, 6219.0], [76.0, 6227.0], [76.1, 6232.0], [76.2, 6239.0], [76.3, 6243.0], [76.4, 6255.0], [76.5, 6257.0], [76.6, 6261.0], [76.7, 6266.0], [76.8, 6274.0], [76.9, 6282.0], [77.0, 6285.0], [77.1, 6290.0], [77.2, 6292.0], [77.3, 6300.0], [77.4, 6302.0], [77.5, 6314.0], [77.6, 6323.0], [77.7, 6325.0], [77.8, 6326.0], [77.9, 6332.0], [78.0, 6341.0], [78.1, 6351.0], [78.2, 6361.0], [78.3, 6367.0], [78.4, 6381.0], [78.5, 6385.0], [78.6, 6390.0], [78.7, 6397.0], [78.8, 6398.0], [78.9, 6404.0], [79.0, 6411.0], [79.1, 6421.0], [79.2, 6432.0], [79.3, 6439.0], [79.4, 6443.0], [79.5, 6447.0], [79.6, 6461.0], [79.7, 6465.0], [79.8, 6482.0], [79.9, 6484.0], [80.0, 6490.0], [80.1, 6500.0], [80.2, 6506.0], [80.3, 6508.0], [80.4, 6510.0], [80.5, 6512.0], [80.6, 6520.0], [80.7, 6533.0], [80.8, 6534.0], [80.9, 6538.0], [81.0, 6544.0], [81.1, 6545.0], [81.2, 6553.0], [81.3, 6557.0], [81.4, 6559.0], [81.5, 6567.0], [81.6, 6585.0], [81.7, 6595.0], [81.8, 6604.0], [81.9, 6609.0], [82.0, 6613.0], [82.1, 6615.0], [82.2, 6620.0], [82.3, 6622.0], [82.4, 6632.0], [82.5, 6641.0], [82.6, 6646.0], [82.7, 6652.0], [82.8, 6658.0], [82.9, 6667.0], [83.0, 6667.0], [83.1, 6672.0], [83.2, 6678.0], [83.3, 6686.0], [83.4, 6695.0], [83.5, 6698.0], [83.6, 6707.0], [83.7, 6710.0], [83.8, 6712.0], [83.9, 6713.0], [84.0, 6716.0], [84.1, 6727.0], [84.2, 6734.0], [84.3, 6741.0], [84.4, 6744.0], [84.5, 6752.0], [84.6, 6758.0], [84.7, 6764.0], [84.8, 6769.0], [84.9, 6771.0], [85.0, 6779.0], [85.1, 6785.0], [85.2, 6791.0], [85.3, 6800.0], [85.4, 6804.0], [85.5, 6808.0], [85.6, 6830.0], [85.7, 6833.0], [85.8, 6839.0], [85.9, 6849.0], [86.0, 6851.0], [86.1, 6854.0], [86.2, 6858.0], [86.3, 6859.0], [86.4, 6863.0], [86.5, 6868.0], [86.6, 6870.0], [86.7, 6877.0], [86.8, 6881.0], [86.9, 6890.0], [87.0, 6892.0], [87.1, 6902.0], [87.2, 6912.0], [87.3, 6924.0], [87.4, 6929.0], [87.5, 6934.0], [87.6, 6942.0], [87.7, 6948.0], [87.8, 6953.0], [87.9, 6956.0], [88.0, 6964.0], [88.1, 6967.0], [88.2, 6983.0], [88.3, 6989.0], [88.4, 6993.0], [88.5, 6995.0], [88.6, 7000.0], [88.7, 7009.0], [88.8, 7021.0], [88.9, 7029.0], [89.0, 7040.0], [89.1, 7054.0], [89.2, 7057.0], [89.3, 7068.0], [89.4, 7077.0], [89.5, 7092.0], [89.6, 7099.0], [89.7, 7107.0], [89.8, 7116.0], [89.9, 7124.0], [90.0, 7127.0], [90.1, 7135.0], [90.2, 7146.0], [90.3, 7153.0], [90.4, 7157.0], [90.5, 7165.0], [90.6, 7173.0], [90.7, 7179.0], [90.8, 7185.0], [90.9, 7197.0], [91.0, 7208.0], [91.1, 7210.0], [91.2, 7213.0], [91.3, 7223.0], [91.4, 7235.0], [91.5, 7244.0], [91.6, 7251.0], [91.7, 7256.0], [91.8, 7261.0], [91.9, 7265.0], [92.0, 7271.0], [92.1, 7277.0], [92.2, 7288.0], [92.3, 7297.0], [92.4, 7299.0], [92.5, 7311.0], [92.6, 7318.0], [92.7, 7334.0], [92.8, 7350.0], [92.9, 7353.0], [93.0, 7354.0], [93.1, 7360.0], [93.2, 7371.0], [93.3, 7380.0], [93.4, 7383.0], [93.5, 7388.0], [93.6, 7399.0], [93.7, 7421.0], [93.8, 7428.0], [93.9, 7433.0], [94.0, 7453.0], [94.1, 7473.0], [94.2, 7478.0], [94.3, 7490.0], [94.4, 7498.0], [94.5, 7509.0], [94.6, 7517.0], [94.7, 7524.0], [94.8, 7532.0], [94.9, 7548.0], [95.0, 7554.0], [95.1, 7559.0], [95.2, 7578.0], [95.3, 7583.0], [95.4, 7591.0], [95.5, 7602.0], [95.6, 7615.0], [95.7, 7623.0], [95.8, 7638.0], [95.9, 7664.0], [96.0, 7674.0], [96.1, 7685.0], [96.2, 7703.0], [96.3, 7716.0], [96.4, 7722.0], [96.5, 7726.0], [96.6, 7732.0], [96.7, 7737.0], [96.8, 7753.0], [96.9, 7765.0], [97.0, 7779.0], [97.1, 7789.0], [97.2, 7797.0], [97.3, 7804.0], [97.4, 7818.0], [97.5, 7834.0], [97.6, 7848.0], [97.7, 7865.0], [97.8, 7876.0], [97.9, 7899.0], [98.0, 7905.0], [98.1, 7923.0], [98.2, 7926.0], [98.3, 7943.0], [98.4, 7956.0], [98.5, 7978.0], [98.6, 7989.0], [98.7, 8011.0], [98.8, 8032.0], [98.9, 8119.0], [99.0, 8125.0], [99.1, 8135.0], [99.2, 8152.0], [99.3, 8250.0], [99.4, 8319.0], [99.5, 8418.0], [99.6, 8484.0], [99.7, 8550.0], [99.8, 8611.0], [99.9, 8718.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 65.0, "series": [{"data": [[600.0, 37.0], [700.0, 27.0], [800.0, 30.0], [900.0, 30.0], [1000.0, 40.0], [1100.0, 25.0], [1200.0, 26.0], [1300.0, 26.0], [1400.0, 30.0], [1500.0, 28.0], [1600.0, 38.0], [1700.0, 25.0], [1800.0, 31.0], [1900.0, 43.0], [2000.0, 33.0], [2100.0, 38.0], [2200.0, 43.0], [2300.0, 26.0], [2400.0, 36.0], [2500.0, 30.0], [2600.0, 32.0], [2800.0, 37.0], [2700.0, 39.0], [2900.0, 41.0], [3000.0, 35.0], [3100.0, 45.0], [3200.0, 51.0], [3300.0, 44.0], [3400.0, 49.0], [3500.0, 63.0], [3600.0, 52.0], [3700.0, 49.0], [3800.0, 53.0], [3900.0, 45.0], [4000.0, 44.0], [4300.0, 49.0], [4100.0, 65.0], [4200.0, 45.0], [4600.0, 44.0], [4500.0, 34.0], [4400.0, 27.0], [4700.0, 36.0], [4800.0, 30.0], [4900.0, 32.0], [5000.0, 31.0], [5100.0, 30.0], [5200.0, 39.0], [5300.0, 36.0], [5400.0, 37.0], [5500.0, 33.0], [5600.0, 34.0], [5700.0, 34.0], [5800.0, 23.0], [5900.0, 56.0], [6100.0, 30.0], [6000.0, 42.0], [6300.0, 47.0], [6200.0, 50.0], [6400.0, 36.0], [6600.0, 53.0], [6500.0, 52.0], [6700.0, 52.0], [6900.0, 46.0], [6800.0, 53.0], [7100.0, 40.0], [7000.0, 31.0], [7200.0, 44.0], [7400.0, 24.0], [7300.0, 36.0], [7600.0, 21.0], [7500.0, 32.0], [7700.0, 32.0], [7800.0, 21.0], [7900.0, 20.0], [8100.0, 12.0], [8000.0, 8.0], [8300.0, 4.0], [8200.0, 2.0], [8400.0, 4.0], [8500.0, 4.0], [8600.0, 4.0], [8700.0, 1.0], [9100.0, 1.0], [9300.0, 1.0], [100.0, 1.0], [200.0, 19.0], [300.0, 43.0], [400.0, 58.0], [500.0, 40.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 9300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 121.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2568.0, "series": [{"data": [[1.0, 311.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 121.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2568.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 640.6865942028982, "minX": 1.54960806E12, "maxY": 876.7236286919837, "series": [{"data": [[1.54960812E12, 876.7236286919837], [1.54960806E12, 640.6865942028982]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 375.3333333333333, "minX": 1.0, "maxY": 9351.0, "series": [{"data": [[2.0, 7885.0], [4.0, 7279.0], [5.0, 8034.0], [6.0, 6894.0], [7.0, 7117.0], [8.0, 7821.0], [9.0, 7251.0], [10.0, 6948.0], [11.0, 7128.0], [12.0, 7556.0], [13.0, 7280.0], [14.0, 7925.0], [16.0, 6882.0], [18.0, 6976.0], [19.0, 7775.0], [20.0, 7720.0], [21.0, 7559.0], [22.0, 6868.0], [23.0, 7327.0], [24.0, 7588.0], [25.0, 7294.0], [26.0, 7636.0], [27.0, 6667.0], [28.0, 7146.0], [29.0, 8135.0], [30.0, 6953.0], [33.0, 6698.0], [32.0, 7761.0], [35.0, 7664.0], [34.0, 7989.0], [37.0, 7675.0], [36.0, 8119.0], [39.0, 7381.0], [38.0, 7116.0], [41.0, 6769.0], [40.0, 7621.0], [43.0, 7259.5], [45.0, 6797.0], [44.0, 7779.0], [47.0, 6658.0], [46.0, 7264.0], [48.0, 7428.0], [51.0, 7703.0], [50.0, 7375.5], [53.0, 7460.5], [54.0, 8011.0], [57.0, 6958.0], [56.0, 7122.0], [59.0, 7805.0], [58.0, 8028.0], [61.0, 7380.0], [60.0, 7027.0], [63.0, 7235.0], [62.0, 7470.0], [67.0, 6860.0], [66.0, 7716.0], [65.0, 7175.5], [70.0, 8032.0], [69.0, 7303.5], [75.0, 7579.0], [74.0, 7869.0], [73.0, 7424.0], [72.0, 7722.5], [79.0, 6714.0], [78.0, 7031.0], [77.0, 7692.0], [76.0, 7834.0], [83.0, 3780.0], [82.0, 1904.5], [81.0, 6734.0], [80.0, 7010.0], [84.0, 3941.5], [85.0, 2859.6666666666665], [86.0, 3556.5], [87.0, 1517.8333333333333], [88.0, 1075.3], [90.0, 1475.75], [91.0, 1247.375], [89.0, 378.3076923076923], [92.0, 1421.5714285714287], [93.0, 1407.7142857142858], [94.0, 3996.5], [95.0, 7716.0], [96.0, 3693.0], [99.0, 3819.0], [98.0, 5082.0], [100.0, 2862.3333333333335], [103.0, 7623.0], [102.0, 6959.0], [101.0, 6645.0], [104.0, 4146.0], [107.0, 2604.6666666666665], [106.0, 7789.0], [105.0, 6617.0], [111.0, 2551.6666666666665], [110.0, 4084.0], [109.0, 2039.75], [108.0, 2852.6666666666665], [112.0, 3919.5], [113.0, 2293.0], [114.0, 2921.6666666666665], [115.0, 4326.5], [117.0, 375.3333333333333], [118.0, 2970.5], [116.0, 2287.5], [119.0, 7107.0], [121.0, 3916.5], [120.0, 2295.75], [123.0, 7181.0], [127.0, 2572.0], [126.0, 7899.0], [125.0, 7928.0], [124.0, 7838.0], [131.0, 2267.75], [132.0, 2306.5], [133.0, 1976.5], [135.0, 3937.5], [134.0, 7208.0], [130.0, 7538.0], [129.0, 7244.0], [128.0, 7964.0], [136.0, 2327.75], [137.0, 3045.3333333333335], [141.0, 3679.5], [140.0, 3837.5], [142.0, 3937.0], [143.0, 7108.0], [139.0, 7022.5], [145.0, 2081.25], [151.0, 3549.0], [150.0, 7517.0], [149.0, 7297.0], [148.0, 7224.0], [147.0, 7388.0], [146.0, 6852.0], [144.0, 7473.0], [152.0, 3873.5], [156.0, 2633.6666666666665], [157.0, 460.0], [159.0, 2497.0], [158.0, 7519.5], [155.0, 6641.0], [154.0, 7671.0], [153.0, 7917.0], [161.0, 2420.25], [160.0, 3529.5], [162.0, 3831.5], [164.0, 3010.6666666666665], [167.0, 6967.0], [166.0, 7040.0], [165.0, 7865.0], [163.0, 7956.0], [171.0, 2615.6666666666665], [173.0, 4078.0], [172.0, 2862.0], [174.0, 2609.333333333333], [175.0, 1761.2], [170.0, 7642.0], [169.0, 7371.0], [168.0, 7621.0], [176.0, 2530.333333333333], [178.0, 2336.0], [177.0, 3854.0], [179.0, 3707.0], [181.0, 4314.0], [183.0, 7208.0], [182.0, 7300.0], [180.0, 6748.0], [191.0, 6835.0], [190.0, 6462.0], [189.0, 6648.0], [188.0, 6490.0], [187.0, 7721.0], [185.0, 7753.0], [184.0, 6693.0], [194.0, 2163.25], [195.0, 2968.3333333333335], [193.0, 2361.875], [192.0, 486.0], [196.0, 4006.0], [199.0, 6857.0], [197.0, 7240.0], [204.0, 2833.6666666666665], [205.0, 2697.333333333333], [207.0, 2167.25], [206.0, 2027.0], [203.0, 6819.0], [202.0, 7631.0], [201.0, 7077.0], [213.0, 646.6666666666666], [212.0, 3032.3333333333335], [211.0, 3901.0], [210.0, 3693.0], [209.0, 3996.0], [215.0, 3636.0], [214.0, 5223.666666666667], [208.0, 7421.0], [216.0, 2267.75], [219.0, 3566.0], [223.0, 6615.0], [222.0, 7581.5], [220.0, 6859.0], [218.0, 6926.0], [217.0, 7804.0], [226.0, 2009.6], [225.0, 2180.0], [227.0, 2760.666666666667], [230.0, 2922.3333333333335], [229.0, 3332.2], [231.0, 4038.5], [224.0, 7614.0], [232.0, 499.0], [236.0, 3526.5], [238.0, 6520.0], [237.0, 6675.0], [235.0, 7726.0], [234.0, 6950.0], [233.0, 6721.5], [241.0, 3707.5], [245.0, 2965.333333333333], [247.0, 6484.0], [246.0, 6995.0], [244.0, 7388.0], [243.0, 6947.5], [240.0, 7525.5], [252.0, 3779.5], [255.0, 2880.6666666666665], [254.0, 7223.0], [253.0, 6667.0], [251.0, 6411.0], [250.0, 7561.0], [249.0, 6535.0], [248.0, 6830.0], [268.0, 3626.0], [257.0, 3576.5], [259.0, 2989.0], [258.0, 6763.0], [261.0, 2150.25], [263.0, 6302.0], [256.0, 6942.0], [262.0, 6983.0], [260.0, 3865.0], [264.0, 603.0], [265.0, 5184.333333333333], [266.0, 837.6666666666666], [267.0, 4860.333333333333], [270.0, 3470.0], [269.0, 7153.0], [271.0, 3820.0], [286.0, 4040.0], [272.0, 2922.3333333333335], [273.0, 3527.5], [275.0, 6269.0], [274.0, 6410.0], [285.0, 6243.0], [284.0, 6261.0], [277.0, 2217.2], [278.0, 3561.0], [279.0, 7353.0], [276.0, 3752.0], [282.0, 4016.5], [283.0, 4109.5], [287.0, 2529.25], [281.0, 7093.5], [301.0, 7008.0], [291.0, 3784.0], [290.0, 3906.5], [293.0, 3713.0], [292.0, 7029.0], [295.0, 7447.0], [289.0, 6589.0], [288.0, 8550.0], [294.0, 7068.0], [297.0, 3708.0], [296.0, 6769.0], [303.0, 6510.0], [302.0, 7353.0], [300.0, 6553.0], [299.0, 6758.0], [298.0, 6718.0], [317.0, 2441.0], [307.0, 4067.0], [308.0, 3852.0], [309.0, 6839.0], [311.0, 6212.0], [304.0, 7256.0], [306.0, 6398.0], [305.0, 6506.0], [310.0, 6441.0], [312.0, 3960.0], [313.0, 4082.5], [316.0, 2116.2], [314.0, 4050.0], [318.0, 4119.0], [319.0, 7762.0], [315.0, 3549.0], [334.0, 4351.5], [323.0, 4075.0], [325.0, 2456.25], [324.0, 6595.0], [327.0, 7171.0], [320.0, 6557.0], [322.0, 7498.0], [321.0, 6538.0], [326.0, 6149.0], [335.0, 3132.3333333333335], [333.0, 6326.0], [332.0, 6325.0], [331.0, 7057.0], [330.0, 6904.0], [329.0, 7288.0], [328.0, 6559.0], [350.0, 2466.25], [338.0, 4336.0], [339.0, 2935.666666666667], [340.0, 2254.25], [341.0, 2864.333333333333], [343.0, 6614.0], [337.0, 6073.0], [336.0, 6063.0], [342.0, 6770.0], [346.0, 982.0], [347.0, 4869.0], [345.0, 4009.0], [351.0, 2976.333333333333], [344.0, 6858.0], [349.0, 4129.0], [348.0, 6351.0], [366.0, 3062.666666666667], [352.0, 3423.0], [354.0, 7153.0], [353.0, 7326.0], [359.0, 6607.0], [358.0, 6153.0], [357.0, 7105.0], [356.0, 6415.0], [361.0, 3639.5], [363.0, 4482.0], [364.0, 2493.25], [365.0, 2456.75], [367.0, 6879.0], [362.0, 6077.0], [360.0, 7428.0], [383.0, 2737.333333333333], [373.0, 4198.0], [371.0, 2704.0], [370.0, 6511.0], [369.0, 5969.0], [368.0, 6761.0], [375.0, 7377.0], [374.0, 6804.0], [372.0, 2860.0], [379.0, 4157.5], [382.0, 6579.0], [380.0, 6656.0], [378.0, 7120.0], [377.0, 6741.0], [376.0, 7195.0], [396.0, 4017.5], [385.0, 3045.333333333333], [384.0, 2553.25], [391.0, 6613.0], [386.0, 3959.5], [387.0, 7182.0], [388.0, 3507.5], [389.0, 6372.0], [390.0, 2862.0], [398.0, 4537.0], [399.0, 6779.0], [395.0, 7135.0], [394.0, 6507.0], [393.0, 5847.0], [392.0, 7134.0], [413.0, 6221.0], [402.0, 2180.2], [401.0, 4709.5], [400.0, 6275.0], [407.0, 6253.0], [406.0, 5821.0], [405.0, 6002.0], [404.0, 6863.0], [403.0, 2773.5], [411.0, 3537.5], [415.0, 6604.0], [414.0, 5970.0], [412.0, 5913.0], [410.0, 6710.0], [409.0, 6964.0], [408.0, 7284.0], [429.0, 6125.0], [422.0, 2566.5], [421.0, 3828.5], [420.0, 3571.0], [430.0, 3982.5], [428.0, 6691.0], [419.0, 7168.0], [418.0, 6413.0], [417.0, 7391.0], [416.0, 6293.0], [423.0, 6545.0], [427.0, 5885.0], [426.0, 6209.0], [425.0, 7926.0], [424.0, 7093.0], [447.0, 3008.333333333333], [437.0, 3499.0], [436.0, 6388.0], [438.0, 8616.0], [445.0, 3557.0], [446.0, 2690.333333333333], [444.0, 7009.0], [435.0, 6035.0], [434.0, 5707.0], [433.0, 6767.0], [432.0, 6984.0], [439.0, 6806.0], [443.0, 6440.0], [442.0, 5743.0], [441.0, 9351.0], [440.0, 5582.0], [461.0, 4198.5], [448.0, 3845.0], [455.0, 3116.666666666667], [454.0, 6067.0], [453.0, 7987.0], [452.0, 8125.0], [458.0, 3617.0], [457.0, 3573.5], [456.0, 5046.0], [459.0, 2915.0], [460.0, 3660.5], [451.0, 5611.0], [450.0, 8611.0], [449.0, 6752.0], [463.0, 8418.0], [462.0, 7478.0], [477.0, 3586.0], [466.0, 3499.5], [465.0, 2618.0], [467.0, 2434.75], [464.0, 4037.0], [470.0, 3515.0], [469.0, 6523.0], [468.0, 5936.0], [471.0, 5719.0], [479.0, 6983.0], [475.0, 6764.0], [474.0, 9187.0], [473.0, 8288.0], [472.0, 5956.0], [478.0, 6715.0], [476.0, 5570.0], [494.0, 6424.0], [482.0, 3039.666666666667], [483.0, 2445.8], [481.0, 3869.0], [480.0, 6140.0], [485.0, 3463.0], [484.0, 6622.0], [486.0, 5530.0], [487.0, 8718.0], [495.0, 2686.75], [489.0, 7524.0], [488.0, 6373.0], [493.0, 7055.0], [492.0, 6508.0], [491.0, 5952.0], [490.0, 5815.0], [508.0, 4068.5], [496.0, 4670.0], [497.0, 5951.0], [499.0, 6390.0], [498.0, 6669.0], [502.0, 2897.666666666667], [501.0, 7245.0], [500.0, 6854.0], [503.0, 4515.5], [504.0, 3802.5], [506.0, 2900.333333333333], [505.0, 5734.0], [509.0, 4362.5], [507.0, 4621.5], [511.0, 3715.0], [510.0, 6696.0], [519.0, 3254.333333333333], [514.0, 3941.0], [513.0, 3911.5], [512.0, 6995.0], [515.0, 2578.0], [516.0, 5923.0], [517.0, 2919.25], [518.0, 3190.333333333333], [529.0, 4699.5], [530.0, 3872.5], [533.0, 6802.5], [531.0, 5376.0], [534.0, 2956.5], [535.0, 3400.666666666667], [528.0, 4338.5], [543.0, 2490.0], [542.0, 3839.0], [541.0, 3338.5], [536.0, 3298.0], [537.0, 5929.0], [539.0, 5190.0], [538.0, 5388.0], [540.0, 4007.0], [521.0, 4080.0], [520.0, 5366.0], [522.0, 3527.0], [523.0, 4580.5], [524.0, 6562.0], [526.0, 6667.0], [525.0, 5606.0], [527.0, 8123.0], [548.0, 3713.0], [544.0, 3832.5], [547.0, 2809.5], [546.0, 5219.0], [545.0, 4271.5], [561.0, 4492.0], [560.0, 8546.0], [564.0, 5153.0], [563.0, 6946.0], [575.0, 6777.0], [574.0, 7557.0], [573.0, 7477.0], [571.0, 3141.0], [570.0, 7051.0], [572.0, 3384.0], [568.0, 3750.0], [551.0, 6830.0], [550.0, 8437.0], [549.0, 5355.0], [569.0, 3583.666666666667], [565.0, 4072.0], [566.0, 3472.5], [567.0, 7353.0], [552.0, 5062.5], [556.0, 3176.0], [557.0, 3777.6666666666665], [558.0, 4779.0], [559.0, 7779.0], [555.0, 3179.75], [554.0, 2434.714285714286], [553.0, 3157.333333333333], [580.0, 2674.5], [577.0, 2962.333333333333], [576.0, 4429.0], [591.0, 6158.0], [590.0, 8555.0], [589.0, 6613.0], [588.0, 6802.5], [579.0, 4372.0], [578.0, 7000.0], [581.0, 3097.25], [582.0, 8501.0], [583.0, 3697.666666666667], [586.0, 3333.666666666667], [585.0, 2896.25], [584.0, 7360.0], [592.0, 4171.0], [593.0, 6232.0], [607.0, 6712.0], [606.0, 7238.0], [601.0, 3514.0], [600.0, 7353.0], [602.0, 7711.0], [604.0, 6399.0], [603.0, 5438.0], [605.0, 4017.0], [594.0, 3681.5], [596.0, 2985.2], [595.0, 7884.0], [597.0, 2779.2], [599.0, 6232.0], [598.0, 6699.0], [636.0, 7303.0], [610.0, 3377.666666666667], [609.0, 4776.0], [608.0, 6503.0], [612.0, 3989.3333333333335], [611.0, 7421.0], [613.0, 1600.0], [614.0, 3523.4], [632.0, 5855.0], [615.0, 8484.0], [634.0, 6482.0], [633.0, 6555.0], [637.0, 6366.0], [638.0, 4265.5], [639.0, 8250.0], [624.0, 3588.666666666667], [627.0, 3108.0], [629.0, 7062.0], [628.0, 7396.0], [631.0, 3568.666666666667], [630.0, 4679.0], [625.0, 3295.333333333333], [626.0, 3368.333333333333], [619.0, 1552.6666666666667], [618.0, 5158.0], [617.0, 3488.666666666667], [616.0, 7354.0], [623.0, 3783.666666666667], [622.0, 6912.0], [621.0, 8463.0], [620.0, 6772.0], [664.0, 4063.0], [641.0, 4860.5], [642.0, 3162.0], [644.0, 2901.8], [645.0, 5970.0], [647.0, 5603.0], [646.0, 5972.0], [665.0, 2874.25], [666.0, 4782.5], [670.0, 2855.0], [669.0, 6284.0], [668.0, 7504.0], [667.0, 6285.0], [671.0, 3911.666666666667], [643.0, 3559.0], [648.0, 3376.75], [649.0, 4195.0], [650.0, 3194.5], [651.0, 6611.0], [653.0, 6506.0], [652.0, 6929.0], [654.0, 4450.0], [655.0, 5745.0], [640.0, 6300.0], [656.0, 3596.25], [660.0, 3919.5], [658.0, 6631.0], [657.0, 8319.0], [661.0, 5983.0], [663.0, 3668.666666666667], [662.0, 5290.0], [699.0, 2204.5], [688.0, 4172.0], [677.0, 4695.5], [678.0, 3730.5], [696.0, 6564.0], [679.0, 6259.0], [698.0, 4789.0], [697.0, 7756.0], [701.0, 3584.0], [700.0, 7205.5], [702.0, 2767.5], [703.0, 3501.666666666667], [680.0, 3243.666666666667], [681.0, 5983.0], [683.0, 7863.0], [682.0, 6199.0], [685.0, 7517.0], [684.0, 6264.0], [687.0, 6170.0], [672.0, 6013.0], [674.0, 6839.0], [673.0, 6408.0], [676.0, 7399.0], [675.0, 5591.0], [686.0, 5148.0], [691.0, 2642.6666666666665], [690.0, 3378.75], [689.0, 5820.0], [693.0, 2737.3333333333335], [692.0, 2710.625], [695.0, 3360.5], [694.0, 2546.0], [728.0, 2720.25], [705.0, 3951.0], [704.0, 4327.5], [706.0, 2896.75], [707.0, 5924.0], [708.0, 5208.5], [709.0, 2089.0], [711.0, 6927.0], [710.0, 6237.0], [720.0, 2500.777777777778], [733.0, 4510.5], [734.0, 7737.0], [735.0, 4016.0], [731.0, 2925.0], [732.0, 3384.0], [729.0, 3137.6], [730.0, 3274.5], [722.0, 2842.8], [723.0, 4750.0], [724.0, 4169.5], [725.0, 6397.0], [727.0, 5794.0], [726.0, 6344.0], [721.0, 3025.25], [714.0, 4089.5], [713.0, 3285.666666666667], [712.0, 3333.333333333333], [715.0, 3900.5], [716.0, 5712.0], [718.0, 7732.0], [717.0, 6132.0], [719.0, 3493.0], [742.0, 3265.8], [738.0, 3180.0], [737.0, 3624.666666666667], [736.0, 6432.0], [750.0, 3906.0], [751.0, 7736.0], [749.0, 3236.0], [748.0, 2939.8], [739.0, 3633.0], [741.0, 3439.25], [740.0, 3256.0], [743.0, 2796.6666666666665], [760.0, 2858.0], [761.0, 2735.7999999999997], [762.0, 2963.6666666666665], [766.0, 2755.285714285714], [767.0, 4134.5], [765.0, 3295.2], [763.0, 5112.5], [764.0, 3218.6], [753.0, 4741.5], [754.0, 3432.4], [755.0, 3521.333333333333], [756.0, 3019.0], [757.0, 3861.333333333333], [758.0, 2658.0], [759.0, 3202.0], [752.0, 4719.0], [746.0, 2857.2], [745.0, 3437.666666666667], [744.0, 4239.0], [747.0, 3303.25], [796.0, 5553.0], [772.0, 4273.5], [768.0, 2961.0], [782.0, 3003.0], [783.0, 3174.833333333333], [778.0, 3971.0], [780.0, 6739.0], [779.0, 5487.0], [781.0, 4806.5], [769.0, 3589.25], [775.0, 2921.8], [793.0, 6727.0], [792.0, 5786.0], [795.0, 5638.0], [794.0, 5614.0], [797.0, 5523.0], [799.0, 6212.0], [798.0, 6028.0], [784.0, 3030.0], [785.0, 3320.5], [786.0, 2908.142857142857], [787.0, 3164.25], [788.0, 3566.333333333333], [791.0, 5558.0], [790.0, 5987.0], [789.0, 6143.0], [774.0, 3708.666666666667], [773.0, 3845.25], [771.0, 2121.0], [770.0, 4099.5], [776.0, 3674.333333333333], [777.0, 4934.0], [826.0, 5486.5], [830.0, 6051.0], [831.0, 7463.0], [817.0, 6151.0], [816.0, 5363.0], [819.0, 5974.0], [818.0, 5513.0], [821.0, 6099.0], [820.0, 6273.0], [829.0, 5432.0], [828.0, 5621.0], [827.0, 5514.0], [824.0, 7210.0], [807.0, 7213.0], [806.0, 6059.0], [805.0, 5727.0], [804.0, 6008.0], [803.0, 5667.0], [802.0, 7318.0], [801.0, 7474.0], [800.0, 5905.0], [815.0, 5327.0], [814.0, 5942.0], [813.0, 5978.0], [812.0, 5431.0], [811.0, 6787.0], [810.0, 5911.0], [809.0, 6167.0], [808.0, 6227.0], [823.0, 6097.0], [822.0, 5756.0], [860.0, 5154.0], [863.0, 5408.0], [849.0, 5186.0], [848.0, 6043.0], [851.0, 5486.0], [850.0, 5761.0], [853.0, 5202.0], [852.0, 4809.0], [862.0, 6860.0], [861.0, 7260.0], [859.0, 5531.0], [858.0, 5845.0], [857.0, 6686.0], [856.0, 6329.0], [847.0, 5927.0], [833.0, 7036.0], [832.0, 5869.0], [835.0, 7092.0], [834.0, 6833.0], [837.0, 5730.0], [836.0, 5276.0], [839.0, 6039.0], [838.0, 5999.0], [846.0, 6093.5], [844.0, 5693.0], [843.0, 6626.0], [842.0, 6094.0], [841.0, 6130.0], [840.0, 5705.0], [855.0, 6904.0], [854.0, 5713.0], [892.0, 5551.0], [895.0, 5400.0], [880.0, 5039.0], [882.0, 6807.0], [881.0, 5158.0], [885.0, 5311.0], [884.0, 7009.5], [894.0, 5606.0], [893.0, 6109.0], [891.0, 5071.0], [890.0, 5871.0], [889.0, 6121.0], [888.0, 5408.0], [879.0, 5647.0], [864.0, 6437.0], [867.0, 5611.0], [866.0, 6413.0], [869.0, 5614.0], [868.0, 6955.0], [871.0, 7019.0], [870.0, 5863.0], [878.0, 5688.5], [876.0, 5379.0], [874.0, 5855.0], [873.0, 5556.0], [872.0, 5973.0], [887.0, 5468.0], [886.0, 6950.0], [924.0, 4902.0], [927.0, 6900.0], [913.0, 5543.0], [912.0, 5386.0], [915.0, 5138.0], [914.0, 5279.0], [917.0, 5972.0], [916.0, 6221.0], [926.0, 4921.0], [925.0, 5262.0], [923.0, 6266.0], [922.0, 5381.0], [921.0, 4769.0], [920.0, 5087.0], [911.0, 5118.0], [896.0, 5351.0], [898.0, 6771.0], [897.0, 5138.0], [901.0, 5899.0], [900.0, 5776.5], [903.0, 5960.0], [902.0, 4871.0], [910.0, 5059.0], [909.0, 5055.0], [908.0, 5433.0], [907.0, 6303.0], [906.0, 5741.0], [905.0, 6752.0], [904.0, 5246.0], [919.0, 4892.0], [918.0, 6593.0], [956.0, 6052.0], [959.0, 5533.0], [945.0, 5439.0], [944.0, 6742.0], [947.0, 6445.0], [946.0, 5370.0], [949.0, 5594.0], [948.0, 4902.0], [958.0, 5222.0], [957.0, 6744.0], [955.0, 5025.0], [954.0, 6539.0], [953.0, 4609.0], [952.0, 6384.0], [943.0, 6545.0], [929.0, 4715.0], [928.0, 6660.0], [931.0, 6685.0], [930.0, 5295.0], [933.0, 5359.0], [932.0, 5626.0], [935.0, 5218.0], [934.0, 5591.0], [942.0, 5414.0], [941.0, 4934.0], [940.0, 4839.0], [939.0, 5068.0], [938.0, 5718.0], [937.0, 5433.0], [936.0, 6595.0], [951.0, 6708.0], [950.0, 4902.0], [988.0, 6486.0], [991.0, 6710.0], [976.0, 4974.0], [978.0, 6456.0], [977.0, 4884.0], [980.0, 5199.0], [979.0, 6338.0], [990.0, 5169.0], [989.0, 6019.0], [987.0, 4975.0], [986.0, 5177.0], [985.0, 6500.0], [984.0, 6354.0], [975.0, 5019.0], [961.0, 4948.0], [960.0, 5035.0], [963.0, 4696.0], [962.0, 5008.0], [965.0, 4527.0], [964.0, 6332.0], [967.0, 4672.0], [966.0, 6325.0], [974.0, 5441.0], [973.0, 4868.0], [972.0, 4556.0], [971.0, 6326.0], [970.0, 6494.0], [969.0, 5747.0], [968.0, 6397.0], [983.0, 5583.5], [981.0, 6443.0], [1016.0, 3381.0], [1020.0, 4084.5], [1010.0, 3474.5], [1011.0, 3248.5], [1013.0, 3281.625], [1012.0, 4805.0], [1015.0, 3925.75], [1014.0, 3552.222222222222], [1017.0, 3837.333333333333], [1007.0, 3830.4], [993.0, 5042.0], [992.0, 6274.0], [995.0, 5094.0], [994.0, 5325.0], [997.0, 6257.0], [996.0, 5412.0], [999.0, 5057.0], [998.0, 5569.0], [1006.0, 4351.333333333333], [1005.0, 3767.666666666667], [1004.0, 6534.0], [1003.0, 5142.0], [1002.0, 6288.0], [1001.0, 5327.0], [1000.0, 5213.0], [1021.0, 3572.4], [1023.0, 3192.6], [1009.0, 3368.6666666666665], [1008.0, 3443.285714285714], [1022.0, 4180.0], [1019.0, 3229.0], [1018.0, 3835.25], [1036.0, 4739.5], [1024.0, 4054.0], [1034.0, 4269.5], [1032.0, 6450.0], [1030.0, 5184.0], [1052.0, 4628.333333333333], [1050.0, 5328.0], [1048.0, 5181.0], [1044.0, 5006.0], [1046.0, 4857.0], [1042.0, 3825.0], [1040.0, 5127.0], [1026.0, 3754.4], [1028.0, 3882.6666666666665], [1078.0, 3414.0], [1076.0, 4799.0], [1074.0, 4200.5], [1072.0, 4665.0], [1038.0, 6229.0], [1084.0, 3783.3333333333335], [1082.0, 5754.0], [1080.0, 4070.5], [1056.0, 3448.5], [1062.0, 3605.0], [1060.0, 5557.0], [1058.0, 5850.0], [1064.0, 3535.0], [1066.0, 4319.0], [1068.0, 4130.0], [1070.0, 4667.0], [1096.0, 3793.0], [1116.0, 3140.5], [1110.0, 3223.75], [1118.0, 3821.5], [1090.0, 4838.0], [1088.0, 5659.0], [1094.0, 4608.0], [1092.0, 4231.0], [1114.0, 3325.0], [1112.0, 4677.0], [1098.0, 3709.5], [1136.0, 4301.0], [1102.0, 5383.0], [1148.0, 3392.6666666666665], [1146.0, 3609.6666666666665], [1150.0, 3677.75], [1142.0, 3764.5], [1144.0, 3368.0], [1140.0, 3748.6666666666665], [1138.0, 3539.0], [1128.0, 4311.0], [1130.0, 3172.3333333333335], [1132.0, 3515.6666666666665], [1134.0, 5106.0], [1126.0, 3497.0], [1124.0, 3752.6], [1122.0, 4324.0], [1120.0, 5556.0], [1108.0, 3795.0], [1106.0, 4044.3333333333335], [1104.0, 5597.0], [1166.0, 3470.6666666666665], [1180.0, 3753.25], [1156.0, 4136.0], [1154.0, 4908.0], [1152.0, 5051.0], [1182.0, 4262.5], [1176.0, 3352.8571428571427], [1178.0, 5181.0], [1174.0, 3986.6666666666665], [1172.0, 3439.1428571428573], [1170.0, 4553.0], [1168.0, 5139.0], [1158.0, 3518.0], [1162.0, 2727.0], [1160.0, 4332.0], [1164.0, 5295.0], [1184.0, 4058.75], [1214.0, 5032.0], [1212.0, 3752.3333333333335], [1208.0, 3655.0], [1210.0, 4927.0], [1200.0, 3748.0], [1202.0, 5468.0], [1204.0, 3823.75], [1206.0, 3943.3333333333335], [1186.0, 3637.625], [1194.0, 3599.0], [1196.0, 3832.6666666666665], [1198.0, 3242.5], [1188.0, 4001.5], [1190.0, 4363.0], [1266.0, 5015.0], [1218.0, 3521.5], [1220.0, 3215.0], [1222.0, 4116.0], [1244.0, 3743.0], [1246.0, 4206.0], [1216.0, 4314.0], [1242.0, 4410.5], [1240.0, 6013.0], [1238.0, 3999.5], [1236.0, 3786.25], [1234.0, 5080.0], [1232.0, 4395.0], [1224.0, 3767.0], [1226.0, 4293.0], [1228.0, 4164.0], [1252.0, 3833.5], [1248.0, 4408.0], [1250.0, 4296.0], [1278.0, 3968.2], [1274.0, 4738.0], [1272.0, 5005.0], [1270.0, 4959.0], [1268.0, 5562.0], [1276.0, 3299.4], [1264.0, 3997.5], [1230.0, 4140.0], [1254.0, 4015.8], [1258.0, 4052.0], [1260.0, 3690.0], [1262.0, 3784.0], [1256.0, 3957.0], [1284.0, 5662.0], [1286.0, 3717.6], [1280.0, 4203.5], [1308.0, 3580.4], [1310.0, 4601.5], [1304.0, 4028.0], [1302.0, 5406.0], [1306.0, 4579.0], [1296.0, 4412.5], [1298.0, 5378.0], [1300.0, 3718.0], [1282.0, 3695.833333333333], [1288.0, 3871.25], [1290.0, 4367.0], [1294.0, 4191.666666666667], [1314.0, 3843.0], [1316.0, 3845.4], [1318.0, 3707.0], [1320.0, 5342.0], [1322.0, 3794.5], [1324.0, 4206.333333333333], [1326.0, 4650.0], [1312.0, 3814.0], [1340.0, 5276.0], [1342.0, 3949.6], [1336.0, 4911.0], [1338.0, 3660.0], [1328.0, 4018.285714285714], [1330.0, 4756.0], [1332.0, 5168.0], [1334.0, 4116.75], [1292.0, 3912.0], [1350.0, 5218.0], [1346.0, 4184.6], [1344.0, 4403.5], [1374.0, 4271.0], [1370.0, 3726.75], [1366.0, 4384.0], [1368.0, 4004.0], [1364.0, 3936.6666666666665], [1362.0, 3653.5], [1360.0, 3570.0], [1352.0, 3871.6666666666665], [1348.0, 3980.0], [1356.0, 3976.2], [1358.0, 3845.6666666666665], [1392.0, 3784.0], [1394.0, 3572.0], [1396.0, 4096.5], [1398.0, 3685.0], [1400.0, 3103.0], [1406.0, 3748.3333333333335], [1404.0, 4077.3333333333335], [1402.0, 4434.0], [1376.0, 4581.5], [1378.0, 4455.0], [1380.0, 5284.0], [1382.0, 4966.0], [1384.0, 4566.0], [1386.0, 3093.6666666666665], [1388.0, 4581.5], [1390.0, 3982.6], [1354.0, 3117.0], [1412.0, 4573.5], [1408.0, 3565.666666666667], [1436.0, 4436.333333333333], [1434.0, 4047.5], [1432.0, 4256.0], [1430.0, 4747.0], [1428.0, 5379.0], [1426.0, 3780.3333333333335], [1424.0, 4161.0], [1410.0, 3801.0], [1414.0, 4207.333333333333], [1418.0, 3936.8], [1416.0, 3408.0], [1420.0, 3996.0], [1440.0, 3931.0], [1442.0, 2981.0], [1470.0, 4621.5], [1468.0, 4180.0], [1466.0, 4114.0], [1460.0, 4277.0], [1462.0, 4607.0], [1464.0, 4620.0], [1458.0, 4165.75], [1456.0, 4870.0], [1444.0, 4171.666666666667], [1446.0, 4082.0], [1448.0, 2992.0], [1450.0, 4290.333333333333], [1452.0, 4225.0], [1454.0, 5343.0], [1422.0, 3936.0], [1498.0, 4604.333333333333], [1472.0, 3924.428571428571], [1502.0, 4216.0], [1500.0, 5198.5], [1496.0, 4439.666666666667], [1494.0, 3962.75], [1490.0, 4290.0], [1492.0, 4692.0], [1488.0, 3775.6666666666665], [1474.0, 4089.75], [1476.0, 3593.25], [1478.0, 3058.0], [1480.0, 4789.0], [1484.0, 4421.0], [1504.0, 4493.0], [1486.0, 3366.0], [1079.0, 3500.2], [1031.0, 3609.0], [1027.0, 4865.0], [1029.0, 4884.0], [1025.0, 4279.75], [1053.0, 4358.5], [1055.0, 5806.5], [1043.0, 3634.0], [1041.0, 5354.0], [1047.0, 5254.0], [1045.0, 6620.0], [1051.0, 6182.0], [1049.0, 5265.0], [1033.0, 4322.5], [1035.0, 5260.0], [1039.0, 6387.0], [1037.0, 6391.0], [1075.0, 3431.6666666666665], [1077.0, 4279.5], [1081.0, 3892.3333333333335], [1083.0, 5377.0], [1087.0, 5286.0], [1059.0, 5617.0], [1057.0, 5642.0], [1063.0, 5115.0], [1061.0, 5141.0], [1067.0, 5756.0], [1065.0, 4755.0], [1085.0, 4240.0], [1069.0, 3851.25], [1071.0, 4096.5], [1097.0, 3734.0], [1089.0, 4749.5], [1091.0, 4360.0], [1095.0, 4275.0], [1093.0, 5490.0], [1119.0, 4214.0], [1117.0, 4992.0], [1115.0, 3193.8333333333335], [1111.0, 4176.0], [1113.0, 4059.0], [1099.0, 3539.3333333333335], [1103.0, 4670.0], [1101.0, 5101.5], [1123.0, 3341.0], [1147.0, 3791.0], [1145.0, 3970.3333333333335], [1143.0, 4524.0], [1149.0, 3578.8333333333335], [1151.0, 5720.0], [1121.0, 4267.0], [1141.0, 3746.0], [1139.0, 4058.5], [1137.0, 5345.0], [1125.0, 3537.0], [1127.0, 3581.6666666666665], [1129.0, 3777.2], [1131.0, 6367.0], [1135.0, 5928.0], [1133.0, 4097.0], [1105.0, 4419.0], [1107.0, 2745.5], [1109.0, 4501.0], [1159.0, 3573.0], [1183.0, 3891.0], [1181.0, 4173.0], [1177.0, 4391.0], [1179.0, 5045.0], [1175.0, 3372.3333333333335], [1173.0, 3456.0], [1169.0, 4141.0], [1171.0, 3731.0], [1153.0, 4094.5], [1155.0, 4577.5], [1157.0, 4220.0], [1161.0, 3312.5], [1165.0, 4485.0], [1163.0, 4179.0], [1201.0, 4150.0], [1167.0, 5313.0], [1213.0, 3723.6666666666665], [1215.0, 4581.5], [1209.0, 3524.0], [1211.0, 4049.0], [1207.0, 3839.0], [1203.0, 3615.666666666667], [1205.0, 4080.5], [1187.0, 3153.3333333333335], [1189.0, 3532.5], [1191.0, 5136.0], [1195.0, 4250.0], [1193.0, 4836.5], [1197.0, 4325.0], [1199.0, 5219.0], [1185.0, 3818.6666666666665], [1227.0, 4364.0], [1223.0, 3120.5], [1225.0, 4990.0], [1221.0, 3647.5], [1219.0, 3693.3333333333335], [1217.0, 4417.333333333333], [1247.0, 5311.0], [1245.0, 4007.0], [1243.0, 3608.0], [1241.0, 3801.0], [1239.0, 3496.5], [1237.0, 3380.153846153846], [1235.0, 4737.0], [1233.0, 4689.0], [1229.0, 3858.0], [1231.0, 4344.0], [1279.0, 4122.0], [1249.0, 5474.0], [1251.0, 4203.0], [1277.0, 3695.0], [1275.0, 3745.4444444444443], [1273.0, 5477.0], [1271.0, 4126.0], [1269.0, 5486.0], [1267.0, 4092.0], [1265.0, 4856.0], [1255.0, 5887.0], [1257.0, 3989.6666666666665], [1259.0, 5023.0], [1261.0, 5634.5], [1263.0, 4933.0], [1253.0, 4265.333333333333], [1283.0, 4858.0], [1309.0, 3697.0], [1311.0, 3713.0], [1305.0, 4140.5], [1303.0, 5400.0], [1307.0, 4162.0], [1297.0, 3675.0], [1299.0, 4744.0], [1301.0, 4536.5], [1285.0, 5581.0], [1281.0, 3701.5], [1289.0, 3552.6], [1287.0, 3986.0], [1315.0, 4019.6666666666665], [1317.0, 3870.0], [1319.0, 4210.0], [1321.0, 4411.5], [1327.0, 3820.0], [1325.0, 3326.0], [1323.0, 4490.5], [1313.0, 3724.5], [1343.0, 3637.5], [1339.0, 3420.5], [1341.0, 5026.0], [1335.0, 3189.0], [1337.0, 3786.0], [1329.0, 4915.0], [1331.0, 4808.0], [1333.0, 3671.0], [1293.0, 4069.25], [1353.0, 4366.2], [1355.0, 3940.142857142857], [1371.0, 4097.25], [1347.0, 3966.0], [1345.0, 4028.75], [1375.0, 4264.0], [1373.0, 3261.6666666666665], [1369.0, 4761.0], [1367.0, 4363.0], [1365.0, 4284.333333333333], [1363.0, 4027.0], [1361.0, 4559.5], [1351.0, 4562.0], [1349.0, 6196.0], [1357.0, 4634.0], [1359.0, 3933.0], [1393.0, 4719.0], [1395.0, 4052.25], [1397.0, 4391.0], [1399.0, 4054.0], [1405.0, 4244.666666666667], [1407.0, 4002.0], [1403.0, 4548.0], [1401.0, 5113.0], [1377.0, 5969.0], [1379.0, 3593.0], [1381.0, 4743.0], [1383.0, 3796.2], [1385.0, 4977.0], [1389.0, 3669.4], [1387.0, 4659.0], [1391.0, 4907.5], [1415.0, 4346.0], [1419.0, 4157.5], [1409.0, 4222.6], [1437.0, 2957.0], [1439.0, 4321.2], [1433.0, 4160.0], [1431.0, 3044.0], [1429.0, 5299.0], [1435.0, 5146.0], [1425.0, 3116.0], [1427.0, 3715.4], [1411.0, 4636.0], [1413.0, 3721.0], [1417.0, 3700.0], [1421.0, 3406.6], [1423.0, 4176.0], [1441.0, 4584.0], [1443.0, 3462.0], [1471.0, 3574.3333333333335], [1469.0, 5270.0], [1465.0, 4707.333333333333], [1467.0, 3907.5], [1461.0, 2838.0], [1463.0, 4029.0], [1459.0, 4333.0], [1457.0, 4046.0], [1445.0, 4522.0], [1447.0, 3485.0], [1449.0, 3305.5], [1451.0, 3920.5], [1453.0, 4107.0], [1455.0, 4629.0], [1501.0, 3936.0], [1497.0, 4770.5], [1475.0, 3927.0], [1473.0, 4271.1], [1503.0, 4471.0], [1499.0, 3935.6666666666665], [1495.0, 4069.6666666666665], [1491.0, 3940.0], [1493.0, 4220.0], [1489.0, 4389.333333333333], [1477.0, 3617.0], [1479.0, 3936.5], [1481.0, 4346.5], [1483.0, 4409.0], [1485.0, 4978.5], [1505.0, 3819.0], [1487.0, 4683.0], [1.0, 7582.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[789.862000000001, 4195.036333333334]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1505.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 4636.8, "minX": 1.54960806E12, "maxY": 13302.3, "series": [{"data": [[1.54960812E12, 13302.3], [1.54960806E12, 7745.216666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960812E12, 7963.2], [1.54960806E12, 4636.8]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1887.7780797101443, "minX": 1.54960806E12, "maxY": 5538.503164556961, "series": [{"data": [[1.54960812E12, 5538.503164556961], [1.54960806E12, 1887.7780797101443]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960812E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1887.767210144929, "minX": 1.54960806E12, "maxY": 5538.50105485231, "series": [{"data": [[1.54960812E12, 5538.50105485231], [1.54960806E12, 1887.767210144929]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960812E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 1.9456521739130421, "minX": 1.54960806E12, "maxY": 96.63449367088602, "series": [{"data": [[1.54960812E12, 96.63449367088602], [1.54960806E12, 1.9456521739130421]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960812E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 191.0, "minX": 1.54960806E12, "maxY": 9351.0, "series": [{"data": [[1.54960812E12, 9351.0], [1.54960806E12, 4380.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960812E12, 1926.0], [1.54960806E12, 191.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960812E12, 7126.9], [1.54960806E12, 3314.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960812E12, 8124.98], [1.54960806E12, 4001.3000000000006]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960812E12, 7553.95], [1.54960806E12, 3570.5]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1894.5, "minX": 18.0, "maxY": 5603.0, "series": [{"data": [[18.0, 1894.5], [31.0, 5603.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 31.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1894.5, "minX": 18.0, "maxY": 5603.0, "series": [{"data": [[18.0, 1894.5], [31.0, 5603.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 31.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 11.533333333333333, "minX": 1.54960806E12, "maxY": 38.46666666666667, "series": [{"data": [[1.54960812E12, 11.533333333333333], [1.54960806E12, 38.46666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 18.4, "minX": 1.54960806E12, "maxY": 31.6, "series": [{"data": [[1.54960812E12, 31.6], [1.54960806E12, 18.4]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 18.4, "minX": 1.54960806E12, "maxY": 31.6, "series": [{"data": [[1.54960812E12, 31.6], [1.54960806E12, 18.4]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960812E12, "title": "Transactions Per Second"}},
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
