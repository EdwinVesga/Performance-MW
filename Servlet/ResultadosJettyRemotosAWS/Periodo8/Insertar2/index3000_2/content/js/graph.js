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
        data: {"result": {"minY": 186.0, "minX": 0.0, "maxY": 8958.0, "series": [{"data": [[0.0, 186.0], [0.1, 204.0], [0.2, 242.0], [0.3, 252.0], [0.4, 274.0], [0.5, 288.0], [0.6, 295.0], [0.7, 304.0], [0.8, 312.0], [0.9, 319.0], [1.0, 322.0], [1.1, 325.0], [1.2, 327.0], [1.3, 331.0], [1.4, 340.0], [1.5, 348.0], [1.6, 350.0], [1.7, 353.0], [1.8, 358.0], [1.9, 363.0], [2.0, 369.0], [2.1, 378.0], [2.2, 384.0], [2.3, 386.0], [2.4, 388.0], [2.5, 397.0], [2.6, 402.0], [2.7, 403.0], [2.8, 408.0], [2.9, 422.0], [3.0, 423.0], [3.1, 432.0], [3.2, 435.0], [3.3, 438.0], [3.4, 443.0], [3.5, 453.0], [3.6, 459.0], [3.7, 463.0], [3.8, 476.0], [3.9, 482.0], [4.0, 491.0], [4.1, 506.0], [4.2, 531.0], [4.3, 541.0], [4.4, 550.0], [4.5, 558.0], [4.6, 570.0], [4.7, 592.0], [4.8, 610.0], [4.9, 629.0], [5.0, 661.0], [5.1, 855.0], [5.2, 1004.0], [5.3, 1058.0], [5.4, 1083.0], [5.5, 1092.0], [5.6, 1095.0], [5.7, 1103.0], [5.8, 1114.0], [5.9, 1123.0], [6.0, 1128.0], [6.1, 1135.0], [6.2, 1148.0], [6.3, 1156.0], [6.4, 1184.0], [6.5, 1192.0], [6.6, 1204.0], [6.7, 1209.0], [6.8, 1213.0], [6.9, 1236.0], [7.0, 1245.0], [7.1, 1264.0], [7.2, 1274.0], [7.3, 1284.0], [7.4, 1292.0], [7.5, 1300.0], [7.6, 1301.0], [7.7, 1308.0], [7.8, 1322.0], [7.9, 1332.0], [8.0, 1364.0], [8.1, 1379.0], [8.2, 1388.0], [8.3, 1398.0], [8.4, 1408.0], [8.5, 1426.0], [8.6, 1438.0], [8.7, 1464.0], [8.8, 1497.0], [8.9, 1513.0], [9.0, 1521.0], [9.1, 1534.0], [9.2, 1547.0], [9.3, 1567.0], [9.4, 1589.0], [9.5, 1596.0], [9.6, 1608.0], [9.7, 1615.0], [9.8, 1620.0], [9.9, 1629.0], [10.0, 1633.0], [10.1, 1638.0], [10.2, 1645.0], [10.3, 1660.0], [10.4, 1669.0], [10.5, 1678.0], [10.6, 1705.0], [10.7, 1712.0], [10.8, 1724.0], [10.9, 1738.0], [11.0, 1764.0], [11.1, 1770.0], [11.2, 1778.0], [11.3, 1783.0], [11.4, 1794.0], [11.5, 1807.0], [11.6, 1813.0], [11.7, 1822.0], [11.8, 1829.0], [11.9, 1839.0], [12.0, 1847.0], [12.1, 1858.0], [12.2, 1889.0], [12.3, 1893.0], [12.4, 1912.0], [12.5, 1923.0], [12.6, 1930.0], [12.7, 1933.0], [12.8, 1950.0], [12.9, 1956.0], [13.0, 1963.0], [13.1, 1964.0], [13.2, 1965.0], [13.3, 1974.0], [13.4, 1980.0], [13.5, 1987.0], [13.6, 1992.0], [13.7, 1994.0], [13.8, 2004.0], [13.9, 2012.0], [14.0, 2020.0], [14.1, 2025.0], [14.2, 2028.0], [14.3, 2032.0], [14.4, 2041.0], [14.5, 2052.0], [14.6, 2055.0], [14.7, 2072.0], [14.8, 2082.0], [14.9, 2088.0], [15.0, 2100.0], [15.1, 2106.0], [15.2, 2111.0], [15.3, 2114.0], [15.4, 2124.0], [15.5, 2135.0], [15.6, 2143.0], [15.7, 2160.0], [15.8, 2165.0], [15.9, 2177.0], [16.0, 2189.0], [16.1, 2190.0], [16.2, 2198.0], [16.3, 2203.0], [16.4, 2206.0], [16.5, 2209.0], [16.6, 2235.0], [16.7, 2247.0], [16.8, 2256.0], [16.9, 2261.0], [17.0, 2262.0], [17.1, 2271.0], [17.2, 2275.0], [17.3, 2278.0], [17.4, 2280.0], [17.5, 2287.0], [17.6, 2300.0], [17.7, 2309.0], [17.8, 2327.0], [17.9, 2335.0], [18.0, 2352.0], [18.1, 2358.0], [18.2, 2360.0], [18.3, 2378.0], [18.4, 2387.0], [18.5, 2397.0], [18.6, 2406.0], [18.7, 2413.0], [18.8, 2424.0], [18.9, 2430.0], [19.0, 2435.0], [19.1, 2436.0], [19.2, 2443.0], [19.3, 2448.0], [19.4, 2456.0], [19.5, 2459.0], [19.6, 2463.0], [19.7, 2471.0], [19.8, 2486.0], [19.9, 2496.0], [20.0, 2510.0], [20.1, 2516.0], [20.2, 2518.0], [20.3, 2520.0], [20.4, 2529.0], [20.5, 2538.0], [20.6, 2547.0], [20.7, 2563.0], [20.8, 2572.0], [20.9, 2578.0], [21.0, 2583.0], [21.1, 2585.0], [21.2, 2590.0], [21.3, 2610.0], [21.4, 2621.0], [21.5, 2634.0], [21.6, 2641.0], [21.7, 2645.0], [21.8, 2648.0], [21.9, 2656.0], [22.0, 2664.0], [22.1, 2667.0], [22.2, 2676.0], [22.3, 2679.0], [22.4, 2682.0], [22.5, 2690.0], [22.6, 2698.0], [22.7, 2707.0], [22.8, 2713.0], [22.9, 2717.0], [23.0, 2726.0], [23.1, 2730.0], [23.2, 2738.0], [23.3, 2742.0], [23.4, 2753.0], [23.5, 2756.0], [23.6, 2764.0], [23.7, 2777.0], [23.8, 2779.0], [23.9, 2781.0], [24.0, 2787.0], [24.1, 2791.0], [24.2, 2803.0], [24.3, 2818.0], [24.4, 2824.0], [24.5, 2834.0], [24.6, 2837.0], [24.7, 2843.0], [24.8, 2848.0], [24.9, 2854.0], [25.0, 2865.0], [25.1, 2871.0], [25.2, 2884.0], [25.3, 2894.0], [25.4, 2902.0], [25.5, 2912.0], [25.6, 2929.0], [25.7, 2935.0], [25.8, 2945.0], [25.9, 2956.0], [26.0, 2959.0], [26.1, 2965.0], [26.2, 2968.0], [26.3, 2974.0], [26.4, 2979.0], [26.5, 2981.0], [26.6, 2984.0], [26.7, 2987.0], [26.8, 2999.0], [26.9, 3004.0], [27.0, 3008.0], [27.1, 3013.0], [27.2, 3020.0], [27.3, 3039.0], [27.4, 3041.0], [27.5, 3044.0], [27.6, 3060.0], [27.7, 3066.0], [27.8, 3068.0], [27.9, 3080.0], [28.0, 3093.0], [28.1, 3097.0], [28.2, 3101.0], [28.3, 3102.0], [28.4, 3109.0], [28.5, 3112.0], [28.6, 3118.0], [28.7, 3123.0], [28.8, 3125.0], [28.9, 3137.0], [29.0, 3140.0], [29.1, 3150.0], [29.2, 3164.0], [29.3, 3165.0], [29.4, 3170.0], [29.5, 3176.0], [29.6, 3182.0], [29.7, 3189.0], [29.8, 3193.0], [29.9, 3212.0], [30.0, 3216.0], [30.1, 3235.0], [30.2, 3250.0], [30.3, 3258.0], [30.4, 3264.0], [30.5, 3267.0], [30.6, 3271.0], [30.7, 3272.0], [30.8, 3278.0], [30.9, 3281.0], [31.0, 3287.0], [31.1, 3292.0], [31.2, 3318.0], [31.3, 3320.0], [31.4, 3326.0], [31.5, 3333.0], [31.6, 3344.0], [31.7, 3349.0], [31.8, 3356.0], [31.9, 3364.0], [32.0, 3374.0], [32.1, 3379.0], [32.2, 3393.0], [32.3, 3400.0], [32.4, 3409.0], [32.5, 3424.0], [32.6, 3426.0], [32.7, 3433.0], [32.8, 3434.0], [32.9, 3447.0], [33.0, 3454.0], [33.1, 3468.0], [33.2, 3477.0], [33.3, 3485.0], [33.4, 3490.0], [33.5, 3495.0], [33.6, 3500.0], [33.7, 3519.0], [33.8, 3536.0], [33.9, 3542.0], [34.0, 3544.0], [34.1, 3546.0], [34.2, 3557.0], [34.3, 3562.0], [34.4, 3569.0], [34.5, 3572.0], [34.6, 3585.0], [34.7, 3587.0], [34.8, 3596.0], [34.9, 3602.0], [35.0, 3622.0], [35.1, 3629.0], [35.2, 3643.0], [35.3, 3658.0], [35.4, 3670.0], [35.5, 3674.0], [35.6, 3679.0], [35.7, 3690.0], [35.8, 3705.0], [35.9, 3711.0], [36.0, 3721.0], [36.1, 3727.0], [36.2, 3733.0], [36.3, 3740.0], [36.4, 3751.0], [36.5, 3775.0], [36.6, 3781.0], [36.7, 3805.0], [36.8, 3812.0], [36.9, 3828.0], [37.0, 3847.0], [37.1, 3859.0], [37.2, 3866.0], [37.3, 3879.0], [37.4, 3883.0], [37.5, 3897.0], [37.6, 3909.0], [37.7, 3920.0], [37.8, 3927.0], [37.9, 3932.0], [38.0, 3939.0], [38.1, 3954.0], [38.2, 3963.0], [38.3, 3975.0], [38.4, 3982.0], [38.5, 3985.0], [38.6, 3989.0], [38.7, 3990.0], [38.8, 3998.0], [38.9, 4006.0], [39.0, 4014.0], [39.1, 4017.0], [39.2, 4020.0], [39.3, 4025.0], [39.4, 4033.0], [39.5, 4038.0], [39.6, 4046.0], [39.7, 4054.0], [39.8, 4065.0], [39.9, 4074.0], [40.0, 4085.0], [40.1, 4088.0], [40.2, 4100.0], [40.3, 4107.0], [40.4, 4110.0], [40.5, 4117.0], [40.6, 4121.0], [40.7, 4128.0], [40.8, 4129.0], [40.9, 4135.0], [41.0, 4140.0], [41.1, 4143.0], [41.2, 4149.0], [41.3, 4155.0], [41.4, 4160.0], [41.5, 4170.0], [41.6, 4178.0], [41.7, 4196.0], [41.8, 4199.0], [41.9, 4206.0], [42.0, 4214.0], [42.1, 4222.0], [42.2, 4237.0], [42.3, 4243.0], [42.4, 4248.0], [42.5, 4254.0], [42.6, 4260.0], [42.7, 4261.0], [42.8, 4264.0], [42.9, 4271.0], [43.0, 4280.0], [43.1, 4285.0], [43.2, 4290.0], [43.3, 4295.0], [43.4, 4299.0], [43.5, 4308.0], [43.6, 4327.0], [43.7, 4331.0], [43.8, 4345.0], [43.9, 4350.0], [44.0, 4369.0], [44.1, 4377.0], [44.2, 4386.0], [44.3, 4391.0], [44.4, 4396.0], [44.5, 4401.0], [44.6, 4404.0], [44.7, 4410.0], [44.8, 4416.0], [44.9, 4422.0], [45.0, 4427.0], [45.1, 4438.0], [45.2, 4441.0], [45.3, 4459.0], [45.4, 4462.0], [45.5, 4468.0], [45.6, 4480.0], [45.7, 4486.0], [45.8, 4490.0], [45.9, 4494.0], [46.0, 4498.0], [46.1, 4501.0], [46.2, 4503.0], [46.3, 4506.0], [46.4, 4512.0], [46.5, 4517.0], [46.6, 4529.0], [46.7, 4534.0], [46.8, 4542.0], [46.9, 4548.0], [47.0, 4561.0], [47.1, 4565.0], [47.2, 4573.0], [47.3, 4577.0], [47.4, 4579.0], [47.5, 4584.0], [47.6, 4589.0], [47.7, 4594.0], [47.8, 4599.0], [47.9, 4605.0], [48.0, 4609.0], [48.1, 4612.0], [48.2, 4616.0], [48.3, 4620.0], [48.4, 4632.0], [48.5, 4634.0], [48.6, 4637.0], [48.7, 4653.0], [48.8, 4658.0], [48.9, 4663.0], [49.0, 4674.0], [49.1, 4675.0], [49.2, 4684.0], [49.3, 4684.0], [49.4, 4687.0], [49.5, 4691.0], [49.6, 4704.0], [49.7, 4705.0], [49.8, 4709.0], [49.9, 4711.0], [50.0, 4718.0], [50.1, 4718.0], [50.2, 4722.0], [50.3, 4729.0], [50.4, 4730.0], [50.5, 4734.0], [50.6, 4742.0], [50.7, 4752.0], [50.8, 4755.0], [50.9, 4763.0], [51.0, 4768.0], [51.1, 4775.0], [51.2, 4778.0], [51.3, 4782.0], [51.4, 4786.0], [51.5, 4787.0], [51.6, 4794.0], [51.7, 4799.0], [51.8, 4803.0], [51.9, 4805.0], [52.0, 4813.0], [52.1, 4822.0], [52.2, 4829.0], [52.3, 4831.0], [52.4, 4835.0], [52.5, 4839.0], [52.6, 4843.0], [52.7, 4847.0], [52.8, 4855.0], [52.9, 4861.0], [53.0, 4867.0], [53.1, 4873.0], [53.2, 4878.0], [53.3, 4882.0], [53.4, 4889.0], [53.5, 4893.0], [53.6, 4900.0], [53.7, 4903.0], [53.8, 4909.0], [53.9, 4912.0], [54.0, 4916.0], [54.1, 4920.0], [54.2, 4923.0], [54.3, 4927.0], [54.4, 4930.0], [54.5, 4934.0], [54.6, 4945.0], [54.7, 4945.0], [54.8, 4951.0], [54.9, 4955.0], [55.0, 4958.0], [55.1, 4960.0], [55.2, 4968.0], [55.3, 4972.0], [55.4, 4974.0], [55.5, 4981.0], [55.6, 4989.0], [55.7, 5003.0], [55.8, 5011.0], [55.9, 5014.0], [56.0, 5020.0], [56.1, 5028.0], [56.2, 5032.0], [56.3, 5038.0], [56.4, 5041.0], [56.5, 5043.0], [56.6, 5047.0], [56.7, 5053.0], [56.8, 5054.0], [56.9, 5057.0], [57.0, 5077.0], [57.1, 5078.0], [57.2, 5085.0], [57.3, 5091.0], [57.4, 5096.0], [57.5, 5103.0], [57.6, 5108.0], [57.7, 5119.0], [57.8, 5126.0], [57.9, 5131.0], [58.0, 5138.0], [58.1, 5144.0], [58.2, 5147.0], [58.3, 5158.0], [58.4, 5163.0], [58.5, 5165.0], [58.6, 5175.0], [58.7, 5180.0], [58.8, 5184.0], [58.9, 5196.0], [59.0, 5199.0], [59.1, 5208.0], [59.2, 5210.0], [59.3, 5216.0], [59.4, 5223.0], [59.5, 5227.0], [59.6, 5236.0], [59.7, 5238.0], [59.8, 5251.0], [59.9, 5257.0], [60.0, 5260.0], [60.1, 5273.0], [60.2, 5274.0], [60.3, 5281.0], [60.4, 5283.0], [60.5, 5285.0], [60.6, 5290.0], [60.7, 5295.0], [60.8, 5303.0], [60.9, 5310.0], [61.0, 5312.0], [61.1, 5314.0], [61.2, 5323.0], [61.3, 5329.0], [61.4, 5330.0], [61.5, 5335.0], [61.6, 5342.0], [61.7, 5349.0], [61.8, 5356.0], [61.9, 5358.0], [62.0, 5365.0], [62.1, 5366.0], [62.2, 5372.0], [62.3, 5375.0], [62.4, 5382.0], [62.5, 5389.0], [62.6, 5390.0], [62.7, 5398.0], [62.8, 5403.0], [62.9, 5409.0], [63.0, 5432.0], [63.1, 5440.0], [63.2, 5445.0], [63.3, 5452.0], [63.4, 5462.0], [63.5, 5464.0], [63.6, 5467.0], [63.7, 5473.0], [63.8, 5476.0], [63.9, 5484.0], [64.0, 5492.0], [64.1, 5498.0], [64.2, 5499.0], [64.3, 5505.0], [64.4, 5513.0], [64.5, 5531.0], [64.6, 5533.0], [64.7, 5535.0], [64.8, 5539.0], [64.9, 5547.0], [65.0, 5555.0], [65.1, 5571.0], [65.2, 5590.0], [65.3, 5597.0], [65.4, 5600.0], [65.5, 5609.0], [65.6, 5624.0], [65.7, 5627.0], [65.8, 5635.0], [65.9, 5644.0], [66.0, 5653.0], [66.1, 5657.0], [66.2, 5675.0], [66.3, 5685.0], [66.4, 5696.0], [66.5, 5700.0], [66.6, 5702.0], [66.7, 5707.0], [66.8, 5712.0], [66.9, 5714.0], [67.0, 5722.0], [67.1, 5728.0], [67.2, 5739.0], [67.3, 5742.0], [67.4, 5745.0], [67.5, 5747.0], [67.6, 5750.0], [67.7, 5754.0], [67.8, 5758.0], [67.9, 5764.0], [68.0, 5768.0], [68.1, 5772.0], [68.2, 5776.0], [68.3, 5784.0], [68.4, 5785.0], [68.5, 5790.0], [68.6, 5797.0], [68.7, 5808.0], [68.8, 5810.0], [68.9, 5815.0], [69.0, 5821.0], [69.1, 5824.0], [69.2, 5828.0], [69.3, 5832.0], [69.4, 5844.0], [69.5, 5848.0], [69.6, 5852.0], [69.7, 5853.0], [69.8, 5857.0], [69.9, 5868.0], [70.0, 5873.0], [70.1, 5886.0], [70.2, 5887.0], [70.3, 5892.0], [70.4, 5901.0], [70.5, 5905.0], [70.6, 5908.0], [70.7, 5914.0], [70.8, 5923.0], [70.9, 5927.0], [71.0, 5928.0], [71.1, 5933.0], [71.2, 5937.0], [71.3, 5940.0], [71.4, 5945.0], [71.5, 5949.0], [71.6, 5953.0], [71.7, 5960.0], [71.8, 5960.0], [71.9, 5963.0], [72.0, 5972.0], [72.1, 5979.0], [72.2, 5980.0], [72.3, 5983.0], [72.4, 5986.0], [72.5, 5994.0], [72.6, 6000.0], [72.7, 6010.0], [72.8, 6016.0], [72.9, 6024.0], [73.0, 6036.0], [73.1, 6051.0], [73.2, 6053.0], [73.3, 6060.0], [73.4, 6063.0], [73.5, 6071.0], [73.6, 6085.0], [73.7, 6098.0], [73.8, 6105.0], [73.9, 6115.0], [74.0, 6120.0], [74.1, 6133.0], [74.2, 6136.0], [74.3, 6144.0], [74.4, 6166.0], [74.5, 6174.0], [74.6, 6190.0], [74.7, 6196.0], [74.8, 6204.0], [74.9, 6208.0], [75.0, 6218.0], [75.1, 6228.0], [75.2, 6238.0], [75.3, 6248.0], [75.4, 6276.0], [75.5, 6280.0], [75.6, 6291.0], [75.7, 6308.0], [75.8, 6315.0], [75.9, 6322.0], [76.0, 6334.0], [76.1, 6338.0], [76.2, 6346.0], [76.3, 6363.0], [76.4, 6369.0], [76.5, 6371.0], [76.6, 6374.0], [76.7, 6383.0], [76.8, 6391.0], [76.9, 6401.0], [77.0, 6409.0], [77.1, 6424.0], [77.2, 6435.0], [77.3, 6444.0], [77.4, 6450.0], [77.5, 6452.0], [77.6, 6461.0], [77.7, 6476.0], [77.8, 6484.0], [77.9, 6502.0], [78.0, 6508.0], [78.1, 6515.0], [78.2, 6529.0], [78.3, 6540.0], [78.4, 6545.0], [78.5, 6555.0], [78.6, 6567.0], [78.7, 6583.0], [78.8, 6594.0], [78.9, 6613.0], [79.0, 6615.0], [79.1, 6617.0], [79.2, 6623.0], [79.3, 6632.0], [79.4, 6638.0], [79.5, 6645.0], [79.6, 6652.0], [79.7, 6668.0], [79.8, 6684.0], [79.9, 6689.0], [80.0, 6696.0], [80.1, 6704.0], [80.2, 6707.0], [80.3, 6717.0], [80.4, 6725.0], [80.5, 6733.0], [80.6, 6737.0], [80.7, 6746.0], [80.8, 6750.0], [80.9, 6764.0], [81.0, 6778.0], [81.1, 6785.0], [81.2, 6797.0], [81.3, 6810.0], [81.4, 6819.0], [81.5, 6825.0], [81.6, 6830.0], [81.7, 6835.0], [81.8, 6840.0], [81.9, 6844.0], [82.0, 6850.0], [82.1, 6860.0], [82.2, 6869.0], [82.3, 6874.0], [82.4, 6883.0], [82.5, 6891.0], [82.6, 6894.0], [82.7, 6903.0], [82.8, 6910.0], [82.9, 6913.0], [83.0, 6918.0], [83.1, 6930.0], [83.2, 6938.0], [83.3, 6948.0], [83.4, 6951.0], [83.5, 6958.0], [83.6, 6960.0], [83.7, 6963.0], [83.8, 6966.0], [83.9, 6972.0], [84.0, 6974.0], [84.1, 6978.0], [84.2, 6982.0], [84.3, 6989.0], [84.4, 6999.0], [84.5, 7002.0], [84.6, 7017.0], [84.7, 7023.0], [84.8, 7033.0], [84.9, 7037.0], [85.0, 7041.0], [85.1, 7044.0], [85.2, 7050.0], [85.3, 7055.0], [85.4, 7062.0], [85.5, 7067.0], [85.6, 7075.0], [85.7, 7080.0], [85.8, 7082.0], [85.9, 7084.0], [86.0, 7091.0], [86.1, 7094.0], [86.2, 7103.0], [86.3, 7112.0], [86.4, 7122.0], [86.5, 7141.0], [86.6, 7142.0], [86.7, 7145.0], [86.8, 7153.0], [86.9, 7155.0], [87.0, 7162.0], [87.1, 7168.0], [87.2, 7173.0], [87.3, 7175.0], [87.4, 7178.0], [87.5, 7187.0], [87.6, 7192.0], [87.7, 7197.0], [87.8, 7206.0], [87.9, 7208.0], [88.0, 7217.0], [88.1, 7237.0], [88.2, 7242.0], [88.3, 7243.0], [88.4, 7251.0], [88.5, 7265.0], [88.6, 7271.0], [88.7, 7282.0], [88.8, 7292.0], [88.9, 7300.0], [89.0, 7312.0], [89.1, 7318.0], [89.2, 7329.0], [89.3, 7331.0], [89.4, 7336.0], [89.5, 7340.0], [89.6, 7344.0], [89.7, 7346.0], [89.8, 7352.0], [89.9, 7364.0], [90.0, 7367.0], [90.1, 7373.0], [90.2, 7382.0], [90.3, 7389.0], [90.4, 7395.0], [90.5, 7409.0], [90.6, 7420.0], [90.7, 7425.0], [90.8, 7440.0], [90.9, 7464.0], [91.0, 7482.0], [91.1, 7495.0], [91.2, 7505.0], [91.3, 7512.0], [91.4, 7530.0], [91.5, 7539.0], [91.6, 7555.0], [91.7, 7576.0], [91.8, 7605.0], [91.9, 7613.0], [92.0, 7619.0], [92.1, 7630.0], [92.2, 7642.0], [92.3, 7649.0], [92.4, 7651.0], [92.5, 7657.0], [92.6, 7675.0], [92.7, 7686.0], [92.8, 7692.0], [92.9, 7696.0], [93.0, 7711.0], [93.1, 7715.0], [93.2, 7724.0], [93.3, 7734.0], [93.4, 7738.0], [93.5, 7744.0], [93.6, 7750.0], [93.7, 7754.0], [93.8, 7771.0], [93.9, 7779.0], [94.0, 7790.0], [94.1, 7796.0], [94.2, 7818.0], [94.3, 7831.0], [94.4, 7833.0], [94.5, 7846.0], [94.6, 7851.0], [94.7, 7881.0], [94.8, 7889.0], [94.9, 7902.0], [95.0, 7927.0], [95.1, 7941.0], [95.2, 7953.0], [95.3, 7956.0], [95.4, 7962.0], [95.5, 7970.0], [95.6, 7986.0], [95.7, 8002.0], [95.8, 8020.0], [95.9, 8036.0], [96.0, 8053.0], [96.1, 8068.0], [96.2, 8075.0], [96.3, 8084.0], [96.4, 8092.0], [96.5, 8096.0], [96.6, 8119.0], [96.7, 8127.0], [96.8, 8135.0], [96.9, 8150.0], [97.0, 8172.0], [97.1, 8181.0], [97.2, 8199.0], [97.3, 8217.0], [97.4, 8240.0], [97.5, 8247.0], [97.6, 8263.0], [97.7, 8272.0], [97.8, 8282.0], [97.9, 8285.0], [98.0, 8290.0], [98.1, 8314.0], [98.2, 8323.0], [98.3, 8338.0], [98.4, 8352.0], [98.5, 8355.0], [98.6, 8368.0], [98.7, 8384.0], [98.8, 8394.0], [98.9, 8420.0], [99.0, 8435.0], [99.1, 8477.0], [99.2, 8507.0], [99.3, 8543.0], [99.4, 8553.0], [99.5, 8598.0], [99.6, 8638.0], [99.7, 8654.0], [99.8, 8819.0], [99.9, 8868.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 67.0, "series": [{"data": [[600.0, 9.0], [700.0, 1.0], [800.0, 1.0], [900.0, 2.0], [1000.0, 14.0], [1100.0, 27.0], [1200.0, 28.0], [1300.0, 25.0], [1400.0, 15.0], [1500.0, 21.0], [1600.0, 32.0], [1700.0, 26.0], [1800.0, 27.0], [1900.0, 43.0], [2000.0, 36.0], [2100.0, 37.0], [2300.0, 27.0], [2200.0, 41.0], [2400.0, 42.0], [2500.0, 41.0], [2600.0, 41.0], [2700.0, 44.0], [2800.0, 38.0], [2900.0, 43.0], [3000.0, 41.0], [3100.0, 49.0], [3200.0, 40.0], [3300.0, 34.0], [3400.0, 38.0], [3500.0, 40.0], [3700.0, 29.0], [3600.0, 25.0], [3800.0, 26.0], [3900.0, 38.0], [4000.0, 41.0], [4100.0, 49.0], [4200.0, 48.0], [4300.0, 31.0], [4400.0, 47.0], [4500.0, 54.0], [4600.0, 54.0], [4700.0, 65.0], [4800.0, 55.0], [4900.0, 62.0], [5100.0, 46.0], [5000.0, 55.0], [5200.0, 52.0], [5300.0, 60.0], [5400.0, 45.0], [5500.0, 32.0], [5600.0, 34.0], [5700.0, 66.0], [5800.0, 51.0], [6100.0, 29.0], [5900.0, 67.0], [6000.0, 35.0], [6200.0, 27.0], [6300.0, 38.0], [6400.0, 29.0], [6500.0, 29.0], [6600.0, 36.0], [6900.0, 53.0], [6700.0, 36.0], [6800.0, 43.0], [7100.0, 49.0], [7000.0, 51.0], [7200.0, 34.0], [7300.0, 48.0], [7400.0, 19.0], [7500.0, 20.0], [7600.0, 36.0], [7700.0, 34.0], [7800.0, 23.0], [7900.0, 24.0], [8000.0, 27.0], [8100.0, 19.0], [8200.0, 24.0], [8600.0, 8.0], [8300.0, 24.0], [8400.0, 10.0], [8500.0, 11.0], [8800.0, 4.0], [8900.0, 2.0], [100.0, 2.0], [200.0, 18.0], [300.0, 57.0], [400.0, 43.0], [500.0, 23.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 8900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 120.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2735.0, "series": [{"data": [[1.0, 145.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 120.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2735.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 852.0123333333329, "minX": 1.54960794E12, "maxY": 852.0123333333329, "series": [{"data": [[1.54960794E12, 852.0123333333329]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960794E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 347.3333333333333, "minX": 1.0, "maxY": 8903.0, "series": [{"data": [[2.0, 7352.0], [3.0, 7539.0], [5.0, 8164.5], [6.0, 7197.0], [9.0, 7888.0], [10.0, 7852.0], [11.0, 8543.0], [12.0, 7735.0], [13.0, 7494.0], [14.0, 7242.0], [15.0, 8573.0], [16.0, 8691.0], [18.0, 8167.5], [19.0, 7651.0], [20.0, 8279.0], [21.0, 7956.0], [22.0, 8654.0], [23.0, 8322.0], [24.0, 7141.0], [25.0, 7154.0], [27.0, 7271.0], [28.0, 8588.0], [29.0, 8149.0], [31.0, 7649.0], [32.0, 8285.0], [35.0, 7461.5], [34.0, 7253.0], [37.0, 8903.0], [36.0, 7116.0], [39.0, 7366.5], [41.0, 7798.0], [43.0, 7073.0], [42.0, 8638.0], [44.0, 7075.0], [47.0, 7753.0], [46.0, 7438.5], [49.0, 7606.0], [48.0, 7779.0], [51.0, 7831.0], [50.0, 7662.0], [53.0, 7282.0], [52.0, 7207.0], [55.0, 7534.0], [57.0, 7482.0], [56.0, 7962.0], [59.0, 8114.0], [61.0, 7744.0], [60.0, 8412.0], [62.0, 8262.0], [67.0, 7771.0], [66.0, 7942.0], [65.0, 7464.0], [64.0, 7895.0], [71.0, 8420.0], [70.0, 7622.0], [69.0, 7780.0], [68.0, 8661.0], [75.0, 1064.6000000000001], [74.0, 1018.0769230769231], [73.0, 1385.8571428571427], [72.0, 7292.0], [79.0, 1522.076923076923], [78.0, 347.3333333333333], [77.0, 2045.2], [76.0, 1551.8333333333335], [83.0, 1762.3636363636365], [82.0, 355.3333333333333], [81.0, 2257.0], [80.0, 1116.0], [84.0, 2059.5], [85.0, 2615.3333333333335], [87.0, 3762.5], [86.0, 7630.0], [89.0, 2680.6666666666665], [91.0, 8221.0], [90.0, 7774.0], [88.0, 8122.0], [94.0, 7781.5], [92.0, 7173.0], [96.0, 5536.666666666667], [97.0, 3972.5], [99.0, 3979.0], [98.0, 7094.0], [100.0, 622.0], [103.0, 4413.5], [102.0, 7346.0], [101.0, 7138.5], [104.0, 3227.3333333333335], [106.0, 3916.5], [107.0, 2207.75], [105.0, 7365.0], [111.0, 8274.0], [110.0, 8181.0], [109.0, 6958.0], [108.0, 7495.0], [115.0, 7930.0], [114.0, 7005.0], [113.0, 7037.0], [112.0, 8289.0], [116.0, 3981.5], [119.0, 7989.0], [118.0, 8244.0], [117.0, 7156.0], [123.0, 4054.5], [122.0, 7143.0], [121.0, 7292.0], [126.0, 2679.3333333333335], [127.0, 2797.0], [125.0, 7341.0], [124.0, 7954.0], [129.0, 2377.75], [132.0, 3083.6666666666665], [134.0, 3747.75], [133.0, 443.0], [135.0, 2073.75], [131.0, 7369.0], [130.0, 7680.0], [128.0, 6988.0], [137.0, 2034.5], [136.0, 3147.0], [141.0, 2821.3333333333335], [142.0, 2204.0], [143.0, 7873.0], [140.0, 7966.0], [139.0, 8477.0], [138.0, 8133.0], [146.0, 3116.3333333333335], [145.0, 2624.3333333333335], [144.0, 2793.6666666666665], [151.0, 8339.0], [150.0, 8316.0], [149.0, 8354.0], [148.0, 8534.0], [147.0, 7748.0], [156.0, 2650.0], [157.0, 2797.3333333333335], [159.0, 6955.0], [158.0, 7790.0], [155.0, 7191.0], [154.0, 7389.0], [153.0, 6963.0], [152.0, 7055.0], [160.0, 4449.5], [161.0, 2873.3333333333335], [164.0, 3079.6666666666665], [167.0, 2698.0], [166.0, 4094.5], [165.0, 7425.0], [163.0, 7000.0], [162.0, 7050.0], [169.0, 4446.5], [175.0, 3777.5], [174.0, 7712.0], [173.0, 8507.0], [172.0, 6979.0], [171.0, 7331.0], [170.0, 7269.0], [168.0, 8199.0], [180.0, 3206.6666666666665], [183.0, 6989.0], [182.0, 7321.0], [181.0, 7787.0], [179.0, 7719.5], [177.0, 7175.0], [176.0, 8081.0], [185.0, 3956.0], [191.0, 4137.0], [190.0, 3687.5], [189.0, 7170.0], [188.0, 7392.0], [187.0, 7346.0], [186.0, 7240.0], [184.0, 7742.0], [192.0, 3937.5], [195.0, 3718.0], [194.0, 4438.0], [193.0, 3831.0], [197.0, 4720.5], [199.0, 7317.0], [198.0, 8352.0], [196.0, 6978.0], [207.0, 6883.0], [206.0, 7801.0], [205.0, 6822.0], [204.0, 6854.0], [203.0, 7421.0], [202.0, 8205.0], [201.0, 7486.0], [200.0, 6840.0], [215.0, 8217.0], [214.0, 8068.0], [213.0, 6924.0], [212.0, 7178.0], [211.0, 8384.0], [210.0, 7155.0], [209.0, 7278.0], [208.0, 8018.0], [223.0, 6903.0], [222.0, 8094.0], [221.0, 7938.0], [220.0, 8819.0], [219.0, 6912.0], [218.0, 6991.0], [217.0, 7207.0], [216.0, 7242.0], [231.0, 7795.0], [230.0, 7312.0], [229.0, 8065.0], [228.0, 8361.0], [227.0, 7928.0], [225.0, 7091.0], [224.0, 8342.0], [239.0, 6953.0], [238.0, 8088.0], [237.0, 7796.0], [236.0, 8553.0], [235.0, 7103.0], [234.0, 6832.0], [233.0, 8337.0], [232.0, 7194.0], [247.0, 6737.0], [246.0, 7220.5], [244.0, 7697.0], [243.0, 7977.0], [242.0, 6979.0], [241.0, 8099.0], [240.0, 6786.0], [254.0, 6750.0], [253.0, 8036.0], [252.0, 7162.0], [251.0, 7611.5], [249.0, 7927.0], [248.0, 6742.0], [270.0, 8053.0], [271.0, 7889.0], [269.0, 6978.0], [268.0, 6951.0], [267.0, 7103.0], [266.0, 6686.0], [265.0, 8552.0], [264.0, 6746.0], [263.0, 8172.0], [257.0, 7430.0], [256.0, 7606.5], [259.0, 6733.0], [258.0, 8150.0], [262.0, 7002.0], [261.0, 7154.0], [260.0, 6824.0], [286.0, 7881.0], [287.0, 6594.0], [285.0, 7124.0], [284.0, 6790.5], [282.0, 8127.0], [281.0, 7689.0], [280.0, 8282.0], [279.0, 7265.0], [273.0, 8272.0], [272.0, 8290.0], [275.0, 7422.0], [274.0, 7970.0], [278.0, 7818.0], [277.0, 8056.0], [276.0, 6830.0], [301.0, 6747.0], [302.0, 8135.0], [300.0, 6833.0], [291.0, 8394.0], [290.0, 8338.0], [289.0, 7082.0], [288.0, 8053.0], [299.0, 7100.0], [298.0, 7764.0], [297.0, 8072.5], [295.0, 8028.0], [294.0, 8820.0], [293.0, 8032.0], [292.0, 7686.0], [318.0, 6515.0], [319.0, 7037.0], [317.0, 7463.0], [316.0, 7166.0], [315.0, 6847.0], [314.0, 8075.0], [313.0, 8188.0], [312.0, 8420.0], [311.0, 8077.0], [304.0, 7681.0], [307.0, 7953.0], [306.0, 7473.5], [310.0, 6733.0], [309.0, 7851.0], [308.0, 6684.0], [334.0, 7696.0], [335.0, 6689.0], [333.0, 7052.0], [332.0, 6650.0], [331.0, 6778.0], [330.0, 7153.0], [329.0, 7533.0], [328.0, 6886.0], [327.0, 8435.0], [320.0, 7355.0], [322.0, 7974.0], [321.0, 7831.0], [326.0, 6674.0], [324.0, 7134.0], [349.0, 7959.0], [351.0, 7175.0], [348.0, 6622.0], [339.0, 6791.0], [338.0, 8164.0], [337.0, 6830.0], [336.0, 7081.0], [347.0, 6404.0], [346.0, 7136.0], [345.0, 7734.0], [344.0, 6548.0], [343.0, 6938.0], [342.0, 6593.0], [341.0, 6670.0], [340.0, 7727.0], [366.0, 6867.0], [367.0, 7611.0], [365.0, 7699.0], [364.0, 7614.0], [363.0, 6797.0], [362.0, 6631.0], [361.0, 7986.0], [360.0, 7171.0], [359.0, 6949.0], [353.0, 7025.0], [352.0, 7060.0], [355.0, 6393.0], [354.0, 8173.0], [358.0, 8073.0], [357.0, 8386.0], [356.0, 7970.0], [382.0, 1174.3333333333333], [383.0, 6423.5], [381.0, 7926.0], [380.0, 7215.0], [379.0, 6913.0], [378.0, 8308.0], [377.0, 7955.0], [376.0, 6911.0], [375.0, 6844.0], [369.0, 6972.0], [368.0, 6637.0], [371.0, 7290.0], [370.0, 7851.0], [374.0, 7392.0], [373.0, 8095.0], [372.0, 7555.0], [386.0, 3428.6666666666665], [384.0, 4246.5], [388.0, 2348.4], [387.0, 2460.4], [396.0, 6826.0], [398.0, 8158.0], [397.0, 8096.0], [390.0, 2907.0], [391.0, 7691.0], [389.0, 3503.6666666666665], [385.0, 2363.2], [395.0, 3950.5], [394.0, 7076.0], [393.0, 6583.0], [392.0, 8127.0], [399.0, 4022.5], [413.0, 7695.0], [400.0, 4516.5], [402.0, 6618.5], [405.0, 3827.5], [404.0, 7651.0], [406.0, 7656.0], [407.0, 4611.0], [411.0, 4422.0], [415.0, 7187.0], [414.0, 7605.0], [412.0, 7389.0], [403.0, 7372.0], [410.0, 6567.0], [409.0, 7696.0], [408.0, 6938.0], [430.0, 3917.5], [421.0, 4288.0], [420.0, 7734.0], [422.0, 6633.0], [423.0, 3393.3333333333335], [424.0, 4365.5], [429.0, 3149.0], [428.0, 2966.0], [419.0, 6999.0], [418.0, 6395.0], [417.0, 6450.0], [416.0, 7049.0], [431.0, 6391.0], [427.0, 8053.0], [426.0, 6891.5], [446.0, 6801.0], [432.0, 2954.0], [433.0, 3960.0], [435.0, 8243.0], [434.0, 6894.0], [445.0, 6503.0], [444.0, 7656.0], [436.0, 3351.0], [437.0, 6328.0], [438.0, 3195.0], [439.0, 1204.0], [441.0, 4302.0], [443.0, 3319.0], [442.0, 7331.0], [447.0, 8364.0], [440.0, 7475.5], [462.0, 7579.0], [450.0, 4497.0], [455.0, 3032.666666666667], [449.0, 6938.0], [448.0, 7839.0], [457.0, 3037.0], [454.0, 4357.5], [453.0, 7040.0], [452.0, 8314.0], [459.0, 4387.0], [458.0, 7192.0], [460.0, 2970.0], [451.0, 8302.0], [463.0, 4253.5], [456.0, 7692.0], [461.0, 7478.0], [466.0, 4254.0], [464.0, 3251.333333333333], [465.0, 7849.0], [467.0, 2681.0], [470.0, 4491.5], [469.0, 6930.0], [468.0, 6371.0], [471.0, 6785.0], [475.0, 4147.5], [479.0, 7832.0], [478.0, 7495.5], [476.0, 7828.0], [474.0, 8368.0], [473.0, 7513.0], [495.0, 7142.0], [487.0, 4044.5], [484.0, 3842.0], [486.0, 8856.0], [485.0, 6556.0], [488.0, 3451.333333333333], [489.0, 6363.0], [494.0, 6515.0], [493.0, 6366.0], [492.0, 6181.0], [483.0, 7105.0], [482.0, 7805.0], [481.0, 7084.0], [480.0, 7750.0], [491.0, 7362.0], [490.0, 6692.0], [509.0, 4521.0], [505.0, 2488.8333333333335], [506.0, 2856.5], [504.0, 2973.75], [508.0, 3821.5], [499.0, 7746.0], [498.0, 6510.0], [497.0, 7409.0], [496.0, 7366.0], [507.0, 2936.5], [511.0, 6973.5], [503.0, 6616.0], [502.0, 7518.0], [501.0, 6529.0], [500.0, 6751.0], [514.0, 3876.0], [538.0, 6058.0], [512.0, 5845.0], [516.0, 4121.5], [518.0, 6376.0], [520.0, 1501.0], [522.0, 6314.0], [524.0, 6721.0], [526.0, 6974.0], [528.0, 3870.0], [536.0, 4516.5], [540.0, 7017.0], [542.0, 3961.5], [530.0, 1438.0], [532.0, 3270.666666666667], [534.0, 7501.0], [548.0, 4467.5], [556.0, 2387.5714285714284], [550.0, 8638.0], [568.0, 7042.0], [570.0, 7044.0], [572.0, 7349.0], [574.0, 2734.2], [546.0, 4223.0], [544.0, 8633.0], [552.0, 3751.0], [554.0, 4002.5], [558.0, 7085.0], [560.0, 3772.0], [562.0, 3310.0], [564.0, 6819.0], [580.0, 5823.0], [604.0, 4601.5], [578.0, 7030.0], [576.0, 7383.0], [600.0, 7229.0], [602.0, 7000.0], [582.0, 4711.5], [586.0, 4089.0], [584.0, 6441.0], [588.0, 6063.0], [590.0, 5985.0], [594.0, 3143.666666666667], [596.0, 5832.0], [598.0, 6812.0], [592.0, 6250.0], [606.0, 4561.5], [610.0, 3934.5], [608.0, 3994.0], [612.0, 4405.5], [616.0, 4583.0], [622.0, 6226.0], [620.0, 6280.0], [618.0, 6623.0], [626.0, 6863.0], [628.0, 6614.0], [630.0, 6717.0], [636.0, 6713.0], [632.0, 4222.5], [614.0, 6917.0], [634.0, 3525.666666666667], [642.0, 6122.0], [644.0, 3484.0], [646.0, 4703.0], [666.0, 6289.0], [664.0, 8097.0], [652.0, 6676.0], [650.0, 5955.0], [648.0, 6446.0], [640.0, 6872.0], [654.0, 6696.0], [658.0, 3751.0], [660.0, 7039.0], [662.0, 6748.0], [670.0, 3384.0], [668.0, 8283.0], [656.0, 5685.0], [678.0, 6346.0], [672.0, 3740.666666666667], [676.0, 7712.0], [674.0, 6088.0], [696.0, 7146.0], [698.0, 7711.0], [700.0, 5643.0], [702.0, 6582.0], [688.0, 6322.0], [690.0, 5409.0], [694.0, 6619.0], [692.0, 3813.3333333333335], [680.0, 3614.25], [684.0, 3108.0], [682.0, 3615.5], [686.0, 3534.75], [706.0, 7646.0], [728.0, 4707.0], [704.0, 5059.0], [710.0, 5710.0], [708.0, 8247.0], [714.0, 4445.5], [712.0, 6754.0], [716.0, 6971.0], [718.0, 6875.0], [724.0, 6891.0], [722.0, 3315.0], [726.0, 6962.0], [732.0, 4103.333333333333], [734.0, 3472.333333333333], [720.0, 5908.0], [730.0, 3897.0], [740.0, 4720.5], [738.0, 4532.5], [736.0, 7080.0], [748.0, 3715.5], [750.0, 2971.25], [742.0, 8002.0], [760.0, 6153.0], [762.0, 6030.0], [764.0, 4620.0], [766.0, 3795.0], [752.0, 4442.0], [754.0, 4323.5], [758.0, 5994.0], [756.0, 6357.0], [744.0, 3650.0], [746.0, 4762.0], [774.0, 6646.0], [796.0, 5768.0], [768.0, 2007.3000000000002], [770.0, 6379.0], [772.0, 6345.0], [792.0, 6006.0], [794.0, 6421.0], [798.0, 5728.0], [778.0, 5790.0], [776.0, 7142.0], [784.0, 3594.666666666667], [782.0, 3139.6666666666665], [780.0, 6139.0], [786.0, 2892.333333333333], [788.0, 2809.5], [790.0, 6103.0], [806.0, 6604.0], [824.0, 3766.0], [802.0, 3290.2], [800.0, 5808.0], [804.0, 3025.5], [808.0, 3412.0], [826.0, 3907.333333333333], [828.0, 4019.5], [830.0, 3244.0], [816.0, 4023.5], [818.0, 3084.4285714285716], [820.0, 2464.2307692307695], [822.0, 3198.6], [812.0, 3006.75], [810.0, 5675.5], [814.0, 2811.8571428571427], [836.0, 3332.75], [832.0, 3279.25], [846.0, 3627.0], [834.0, 6966.0], [838.0, 3225.0], [840.0, 4398.0], [848.0, 3479.0], [862.0, 3578.4], [858.0, 3399.25], [860.0, 3056.4444444444443], [856.0, 4188.5], [850.0, 3224.75], [852.0, 3195.4285714285716], [854.0, 3016.6], [842.0, 4566.5], [844.0, 3617.0], [870.0, 4506.5], [868.0, 3975.8], [864.0, 2886.0], [866.0, 4059.5], [880.0, 4412.5], [884.0, 5887.0], [882.0, 5979.0], [890.0, 6959.0], [892.0, 3933.3333333333335], [894.0, 3223.8], [888.0, 3861.0], [878.0, 5198.0], [876.0, 5467.0], [874.0, 5777.0], [872.0, 6035.0], [886.0, 3721.6666666666665], [920.0, 4829.0], [908.0, 3621.0], [898.0, 3368.5], [896.0, 5886.0], [918.0, 3467.75], [924.0, 4665.5], [926.0, 3996.5], [912.0, 5970.0], [914.0, 5886.0], [916.0, 5930.0], [922.0, 3822.3333333333335], [902.0, 5235.666666666667], [900.0, 5701.0], [904.0, 6202.0], [906.0, 3961.0], [910.0, 5889.5], [934.0, 3806.0], [930.0, 3762.333333333333], [928.0, 6452.0], [932.0, 3669.166666666667], [946.0, 4237.333333333333], [944.0, 6238.0], [956.0, 6166.0], [958.0, 5575.0], [954.0, 3495.8], [952.0, 3587.4], [950.0, 3888.25], [948.0, 3523.8], [936.0, 3042.5], [938.0, 4747.0], [940.0, 5743.0], [942.0, 5684.0], [964.0, 3862.0], [986.0, 5032.0], [976.0, 4231.0], [962.0, 5700.0], [966.0, 6205.0], [984.0, 5360.0], [990.0, 6065.0], [988.0, 4183.25], [968.0, 3795.0], [970.0, 6125.0], [972.0, 3608.0], [960.0, 5330.0], [974.0, 5979.0], [978.0, 3733.5], [980.0, 3926.6666666666665], [982.0, 5499.0], [992.0, 4101.5], [998.0, 3495.0], [996.0, 5178.0], [994.0, 5143.0], [1002.0, 5014.0], [1000.0, 5902.0], [1004.0, 5064.5], [1006.0, 4679.0], [1010.0, 3648.666666666667], [1012.0, 5306.0], [1014.0, 5307.0], [1008.0, 4219.0], [1016.0, 5591.0], [1018.0, 5881.0], [1020.0, 5078.0], [1022.0, 4784.0], [1036.0, 5062.5], [1028.0, 3982.0], [1024.0, 6115.0], [1032.0, 5043.0], [1052.0, 5469.0], [1048.0, 5980.0], [1072.0, 6456.0], [1056.0, 4275.0], [1084.0, 3538.5555555555557], [1080.0, 3141.0], [1076.0, 5740.0], [1060.0, 3747.0], [1068.0, 4159.5], [1064.0, 4056.5], [1040.0, 6063.0], [1044.0, 5932.0], [1088.0, 3850.25], [1092.0, 4240.5], [1104.0, 4052.5], [1108.0, 3973.5], [1112.0, 4177.666666666667], [1116.0, 3837.5], [1100.0, 4031.3333333333335], [1136.0, 4061.0], [1140.0, 4718.0], [1144.0, 5948.0], [1148.0, 3921.25], [1120.0, 4217.333333333333], [1124.0, 5273.0], [1132.0, 5134.0], [1128.0, 3576.8], [1096.0, 4133.0], [1152.0, 4782.0], [1156.0, 4633.0], [1176.0, 4264.666666666667], [1168.0, 4587.5], [1172.0, 5260.0], [1180.0, 4324.0], [1160.0, 3854.0], [1164.0, 4701.5], [1184.0, 3666.0], [1188.0, 5398.0], [1212.0, 3444.6666666666665], [1208.0, 5776.0], [1204.0, 5047.0], [1200.0, 4509.5], [1192.0, 4214.666666666667], [1196.0, 4349.5], [1272.0, 5052.0], [1248.0, 5267.0], [1252.0, 5191.0], [1256.0, 5499.0], [1276.0, 5208.0], [1268.0, 5852.0], [1264.0, 4249.0], [1216.0, 5093.0], [1220.0, 5330.0], [1224.0, 5124.0], [1228.0, 6210.0], [1244.0, 4584.0], [1240.0, 5260.0], [1236.0, 4533.0], [1232.0, 5634.0], [1260.0, 5571.0], [1340.0, 5375.0], [1316.0, 4410.0], [1320.0, 5464.0], [1324.0, 4440.0], [1312.0, 5722.0], [1336.0, 4105.0], [1332.0, 4722.0], [1328.0, 5754.0], [1280.0, 5529.0], [1284.0, 4893.0], [1288.0, 5079.0], [1292.0, 5786.0], [1308.0, 5373.0], [1304.0, 4912.0], [1300.0, 5002.0], [1400.0, 5282.0], [1396.0, 5284.0], [1404.0, 4465.0], [1376.0, 5366.0], [1380.0, 4640.0], [1384.0, 4920.0], [1388.0, 4769.0], [1392.0, 4489.0], [1344.0, 5032.0], [1348.0, 4787.0], [1352.0, 4596.0], [1356.0, 5702.0], [1372.0, 5144.0], [1368.0, 4730.0], [1364.0, 4685.0], [1464.0, 4700.5], [1460.0, 4777.75], [1452.0, 4493.0], [1448.0, 4452.0], [1444.0, 4480.6], [1440.0, 4295.714285714286], [1468.0, 3987.0], [1456.0, 4476.0], [1420.0, 4214.0], [1416.0, 4681.0], [1412.0, 5349.0], [1408.0, 4573.0], [1436.0, 4734.0], [1432.0, 5219.0], [1424.0, 4900.0], [1480.0, 4239.0], [1484.0, 4252.166666666666], [1472.0, 4680.0], [1500.0, 4377.0], [1492.0, 4580.0], [1496.0, 4795.0], [1488.0, 4628.0], [1476.0, 4295.0], [1520.0, 4453.5], [1524.0, 4117.0], [1528.0, 4634.0], [1532.0, 5368.0], [1504.0, 4722.0], [1508.0, 4554.0], [1512.0, 4237.0], [1516.0, 4020.0], [1540.0, 4461.0], [1536.0, 4653.8], [1564.0, 4313.0], [1560.0, 4244.285714285715], [1556.0, 4620.0], [1544.0, 4506.0], [1568.0, 4423.333333333333], [1596.0, 4724.0], [1592.0, 4751.5], [1588.0, 4416.5], [1584.0, 4131.666666666667], [1572.0, 4232.0], [1576.0, 4161.5], [1548.0, 4615.0], [1552.0, 4684.0], [1029.0, 5848.0], [1025.0, 5909.0], [1033.0, 5627.0], [1045.0, 2928.0], [1049.0, 6383.0], [1053.0, 5402.0], [1085.0, 3474.4], [1081.0, 3933.8], [1077.0, 4255.0], [1073.0, 3380.6], [1037.0, 5210.0], [1061.0, 4052.5], [1065.0, 4449.5], [1069.0, 3941.6], [1057.0, 3815.0], [1041.0, 4235.5], [1093.0, 5241.0], [1101.0, 2832.0], [1105.0, 3594.6666666666665], [1113.0, 3478.8], [1117.0, 3885.8], [1109.0, 5282.0], [1089.0, 3384.1666666666665], [1137.0, 3595.0], [1141.0, 4165.0], [1145.0, 4656.5], [1121.0, 5706.0], [1149.0, 5938.0], [1125.0, 3995.0], [1129.0, 3912.8], [1133.0, 5524.0], [1097.0, 4297.333333333333], [1157.0, 4363.5], [1181.0, 4347.0], [1153.0, 3632.75], [1177.0, 3805.8], [1173.0, 4009.3333333333335], [1169.0, 3733.0], [1165.0, 4707.0], [1161.0, 6174.0], [1185.0, 5542.0], [1213.0, 4021.0], [1209.0, 4781.0], [1205.0, 5369.0], [1201.0, 3626.0], [1193.0, 3918.8333333333335], [1197.0, 4684.0], [1189.0, 5886.0], [1273.0, 5054.0], [1249.0, 5492.0], [1253.0, 6167.0], [1257.0, 4960.0], [1277.0, 5547.0], [1269.0, 4831.0], [1265.0, 5034.0], [1217.0, 4655.0], [1221.0, 5760.0], [1225.0, 5566.0], [1229.0, 4340.0], [1245.0, 4620.0], [1241.0, 4882.0], [1237.0, 5626.0], [1233.0, 4847.0], [1261.0, 5637.0], [1337.0, 4350.0], [1341.0, 4709.0], [1317.0, 4074.0], [1313.0, 5821.0], [1321.0, 5185.0], [1325.0, 5165.0], [1333.0, 4763.0], [1329.0, 5615.0], [1281.0, 5608.0], [1285.0, 4909.0], [1289.0, 5372.0], [1293.0, 4914.0], [1309.0, 5341.0], [1305.0, 5389.0], [1301.0, 4915.0], [1297.0, 5193.0], [1401.0, 5772.0], [1405.0, 4404.0], [1377.0, 5253.0], [1381.0, 5208.0], [1385.0, 5798.0], [1389.0, 5933.0], [1397.0, 4698.0], [1393.0, 4778.0], [1345.0, 5109.0], [1349.0, 4903.0], [1353.0, 4584.0], [1357.0, 5331.0], [1373.0, 5299.0], [1369.0, 5067.0], [1365.0, 4892.0], [1361.0, 4972.5], [1441.0, 4011.4285714285716], [1469.0, 4980.0], [1453.0, 4408.333333333333], [1449.0, 4454.8], [1445.0, 4434.0], [1465.0, 4411.0], [1461.0, 4277.0], [1421.0, 4609.0], [1417.0, 5140.0], [1413.0, 4674.0], [1409.0, 4433.0], [1437.0, 5283.0], [1433.0, 5058.0], [1429.0, 5206.0], [1425.0, 4763.0], [1457.0, 4518.0], [1473.0, 4538.666666666667], [1477.0, 4740.0], [1501.0, 4878.0], [1493.0, 6262.0], [1497.0, 4117.5], [1489.0, 4543.666666666667], [1481.0, 4507.875], [1521.0, 4026.0], [1525.0, 4072.0], [1529.0, 4835.0], [1533.0, 4296.0], [1509.0, 6144.0], [1513.0, 4116.0], [1517.0, 4403.0], [1505.0, 4797.5], [1485.0, 4471.2], [1537.0, 4468.0], [1565.0, 4891.333333333333], [1561.0, 4467.666666666667], [1557.0, 4202.0], [1541.0, 4268.0], [1545.0, 4290.0], [1549.0, 4861.0], [1597.0, 4409.0], [1593.0, 4957.0], [1589.0, 4809.666666666667], [1585.0, 4578.5], [1569.0, 3966.5], [1573.0, 3852.0], [1581.0, 4348.333333333333], [1577.0, 4275.25], [1553.0, 4400.0], [1601.0, 4594.5], [515.0, 7675.0], [513.0, 3225.666666666667], [517.0, 7251.0], [519.0, 4529.5], [521.0, 4109.25], [523.0, 4182.5], [525.0, 6191.0], [527.0, 6835.0], [529.0, 7192.0], [543.0, 6563.0], [537.0, 6477.0], [539.0, 6383.0], [541.0, 5750.0], [531.0, 7028.5], [533.0, 3441.333333333333], [535.0, 7041.0], [551.0, 5868.0], [569.0, 6371.0], [549.0, 7420.0], [571.0, 6728.0], [573.0, 3593.666666666667], [575.0, 4097.5], [547.0, 3760.5], [545.0, 6291.0], [553.0, 6508.0], [555.0, 2722.5], [557.0, 4343.5], [559.0, 3793.5], [561.0, 6114.0], [563.0, 4078.5], [567.0, 6242.5], [565.0, 6978.0], [579.0, 6206.0], [581.0, 3555.333333333333], [577.0, 5986.0], [583.0, 3341.0], [601.0, 6948.0], [603.0, 7382.0], [585.0, 7329.0], [587.0, 5961.0], [589.0, 6431.0], [591.0, 5714.0], [593.0, 3362.333333333333], [595.0, 6896.0], [597.0, 6333.0], [599.0, 7884.0], [607.0, 4294.5], [605.0, 7329.0], [609.0, 6666.0], [611.0, 3583.666666666667], [617.0, 3975.5], [623.0, 4225.0], [621.0, 7145.0], [619.0, 7373.0], [627.0, 3901.5], [625.0, 6381.0], [629.0, 5712.0], [631.0, 5892.0], [637.0, 3423.0], [635.0, 5473.0], [639.0, 6569.5], [615.0, 6869.0], [613.0, 7083.0], [633.0, 5880.0], [641.0, 6409.0], [667.0, 3738.0], [645.0, 5832.0], [647.0, 6133.0], [653.0, 4340.0], [651.0, 6903.0], [649.0, 5928.0], [655.0, 3487.0], [643.0, 6195.0], [659.0, 4082.0], [661.0, 3417.0], [663.0, 7067.0], [669.0, 3580.5], [671.0, 3070.25], [657.0, 5816.0], [697.0, 3917.0], [677.0, 3947.0], [675.0, 6960.0], [673.0, 6840.0], [699.0, 3803.0], [689.0, 6529.0], [691.0, 7214.0], [701.0, 7753.0], [693.0, 3056.25], [695.0, 4814.5], [683.0, 3019.25], [685.0, 2985.25], [681.0, 3613.0], [687.0, 7143.0], [705.0, 6707.0], [711.0, 4027.0], [709.0, 7050.0], [707.0, 7508.0], [713.0, 6982.0], [715.0, 6860.0], [717.0, 6739.0], [719.0, 5461.0], [723.0, 2992.2], [725.0, 3517.0], [727.0, 4595.5], [731.0, 3459.666666666667], [733.0, 2779.5], [735.0, 2342.1111111111113], [721.0, 7630.0], [729.0, 5358.0], [739.0, 3486.0], [747.0, 4250.0], [737.0, 3232.333333333333], [751.0, 4259.5], [749.0, 3324.333333333333], [743.0, 2946.666666666667], [741.0, 6522.0], [761.0, 6374.0], [763.0, 6443.0], [765.0, 5980.0], [767.0, 5946.0], [753.0, 6625.0], [755.0, 3204.0], [759.0, 6847.0], [757.0, 5953.0], [745.0, 3974.0], [775.0, 7185.0], [769.0, 3866.0], [771.0, 6276.0], [773.0, 7217.0], [793.0, 3359.333333333333], [797.0, 4405.0], [795.0, 5707.0], [799.0, 3921.0], [779.0, 3965.5], [777.0, 6233.0], [783.0, 4288.0], [781.0, 2915.0], [785.0, 6016.0], [787.0, 3437.5], [789.0, 3104.0], [791.0, 6372.0], [805.0, 2934.75], [803.0, 2744.0], [815.0, 3521.25], [801.0, 5767.0], [807.0, 4283.0], [825.0, 3543.0], [827.0, 3273.5], [829.0, 4281.5], [831.0, 3397.333333333333], [817.0, 3082.0], [823.0, 3438.25], [821.0, 2631.5454545454545], [819.0, 2785.875], [811.0, 3987.0], [813.0, 3257.666666666667], [837.0, 4298.5], [839.0, 3538.333333333333], [833.0, 3612.0], [847.0, 4784.0], [835.0, 6134.0], [841.0, 6962.0], [863.0, 3060.428571428571], [859.0, 5826.0], [861.0, 3726.0], [857.0, 3447.25], [851.0, 3601.666666666667], [853.0, 2798.076923076923], [855.0, 3343.2], [849.0, 5016.5], [845.0, 3261.5], [843.0, 3454.666666666667], [895.0, 4642.0], [889.0, 4516.0], [865.0, 3097.0], [869.0, 4706.5], [885.0, 5904.0], [883.0, 5892.0], [881.0, 5285.0], [891.0, 3101.0], [893.0, 3287.75], [871.0, 5910.0], [879.0, 3801.3333333333335], [877.0, 6344.0], [875.0, 5600.0], [873.0, 6000.0], [887.0, 4257.333333333333], [921.0, 4230.333333333333], [903.0, 4138.333333333333], [899.0, 3502.75], [897.0, 5887.0], [919.0, 2422.0], [923.0, 3560.6666666666665], [925.0, 5635.0], [927.0, 4622.5], [913.0, 5385.0], [915.0, 5372.0], [917.0, 6010.0], [905.0, 4016.6666666666665], [907.0, 5162.0], [909.0, 3268.5], [911.0, 5925.0], [955.0, 4611.0], [929.0, 4235.5], [931.0, 3851.333333333333], [933.0, 3390.6], [945.0, 3863.0], [957.0, 6053.0], [959.0, 3854.0], [953.0, 3123.0], [935.0, 5923.0], [947.0, 4605.5], [949.0, 3963.6], [951.0, 3396.5], [937.0, 5478.5], [939.0, 4194.5], [941.0, 3741.5], [943.0, 3894.6666666666665], [967.0, 5723.0], [961.0, 4275.75], [963.0, 5609.0], [965.0, 5499.0], [985.0, 6424.0], [987.0, 5538.0], [989.0, 3497.75], [991.0, 3988.8333333333335], [969.0, 5473.0], [971.0, 5463.0], [973.0, 3443.0], [975.0, 5366.0], [977.0, 4338.333333333333], [979.0, 4707.5], [983.0, 5312.0], [981.0, 5366.0], [993.0, 4110.0], [1019.0, 5827.0], [997.0, 5810.0], [995.0, 5844.0], [999.0, 4453.5], [1003.0, 3823.5], [1001.0, 6036.0], [1005.0, 4054.5], [1007.0, 3637.6], [1011.0, 5941.0], [1013.0, 4869.5], [1015.0, 6120.0], [1009.0, 3586.666666666667], [1017.0, 4801.0], [1021.0, 5960.0], [1023.0, 3910.6666666666665], [1034.0, 4058.6666666666665], [1082.0, 3773.6666666666665], [1026.0, 5395.0], [1030.0, 5445.0], [1054.0, 4862.0], [1046.0, 4125.75], [1050.0, 4303.0], [1038.0, 4883.0], [1086.0, 3899.0], [1078.0, 4353.333333333333], [1074.0, 3903.5], [1058.0, 4099.0], [1062.0, 3920.5], [1070.0, 3165.8749999999995], [1066.0, 4905.0], [1042.0, 3537.0], [1118.0, 3803.4], [1106.0, 4752.0], [1110.0, 4009.3333333333335], [1114.0, 3897.25], [1090.0, 3696.5], [1094.0, 3829.0], [1098.0, 4083.0], [1102.0, 4882.333333333333], [1138.0, 4256.8], [1142.0, 3858.2], [1146.0, 5082.0], [1150.0, 4089.0], [1122.0, 4262.333333333333], [1134.0, 3753.6666666666665], [1130.0, 4154.333333333333], [1126.0, 4945.0], [1154.0, 4228.333333333333], [1202.0, 4412.5], [1178.0, 4599.5], [1170.0, 5197.0], [1174.0, 5257.0], [1182.0, 4968.0], [1158.0, 4505.0], [1162.0, 5175.0], [1186.0, 5487.0], [1190.0, 5409.0], [1214.0, 4191.2], [1210.0, 4588.0], [1206.0, 5434.0], [1166.0, 4833.0], [1194.0, 3740.2], [1198.0, 4691.0], [1274.0, 4803.0], [1278.0, 5746.0], [1250.0, 5041.0], [1254.0, 4788.0], [1258.0, 5714.0], [1270.0, 5303.0], [1266.0, 5292.0], [1246.0, 4945.0], [1218.0, 5656.0], [1222.0, 5339.0], [1226.0, 5811.0], [1230.0, 5323.0], [1242.0, 4653.0], [1238.0, 5712.0], [1234.0, 5164.0], [1262.0, 5329.0], [1342.0, 4901.0], [1318.0, 3898.0], [1314.0, 5091.0], [1322.0, 4960.0], [1326.0, 4918.0], [1338.0, 5357.0], [1334.0, 4900.0], [1330.0, 5212.0], [1310.0, 6051.0], [1282.0, 5357.0], [1286.0, 5925.0], [1290.0, 5175.0], [1294.0, 5330.0], [1306.0, 5739.0], [1302.0, 5382.0], [1298.0, 5319.0], [1406.0, 4729.0], [1378.0, 4589.0], [1382.0, 4970.0], [1386.0, 4705.0], [1390.0, 5108.0], [1402.0, 5441.0], [1398.0, 4575.0], [1394.0, 6105.0], [1346.0, 4605.0], [1350.0, 4257.0], [1354.0, 5054.0], [1358.0, 4827.0], [1374.0, 4691.0], [1370.0, 5039.0], [1366.0, 4768.0], [1362.0, 4692.0], [1470.0, 4605.0], [1446.0, 4420.0], [1450.0, 4567.2], [1442.0, 4247.9], [1466.0, 5017.0], [1462.0, 4933.0], [1422.0, 5053.0], [1418.0, 5382.0], [1414.0, 4993.0], [1410.0, 3586.0], [1438.0, 4159.0], [1434.0, 4778.0], [1430.0, 5119.0], [1426.0, 5905.0], [1454.0, 4033.0], [1458.0, 4561.333333333333], [1474.0, 4705.25], [1502.0, 4567.333333333333], [1498.0, 4308.0], [1494.0, 4823.0], [1490.0, 3943.5], [1478.0, 4687.0], [1482.0, 4304.0], [1486.0, 4373.833333333334], [1522.0, 4370.5], [1526.0, 4957.0], [1530.0, 4477.0], [1534.0, 4348.333333333333], [1506.0, 4934.0], [1510.0, 4535.0], [1514.0, 4947.5], [1518.0, 4255.0], [1542.0, 5150.0], [1566.0, 4993.5], [1562.0, 4523.0], [1558.0, 4933.0], [1538.0, 4532.0], [1598.0, 4111.0], [1590.0, 4450.0], [1550.0, 4259.5], [1586.0, 4815.5], [1570.0, 4588.5], [1574.0, 4328.0], [1578.0, 4557.2], [1582.0, 4469.666666666667], [1554.0, 4101.333333333333], [1602.0, 4820.25], [1031.0, 4800.5], [1035.0, 3647.0], [1027.0, 6196.0], [1047.0, 5534.0], [1051.0, 5743.0], [1055.0, 3438.25], [1083.0, 3406.0], [1079.0, 3919.6666666666665], [1039.0, 5009.0], [1075.0, 5513.0], [1067.0, 6060.0], [1071.0, 3937.5], [1063.0, 4324.0], [1059.0, 5774.0], [1087.0, 5043.0], [1043.0, 3504.0], [1091.0, 4076.0], [1107.0, 5290.0], [1115.0, 3474.0], [1119.0, 2923.0], [1111.0, 4695.666666666667], [1095.0, 5029.0], [1103.0, 4755.0], [1139.0, 4254.0], [1143.0, 4090.5], [1151.0, 3587.0], [1123.0, 4958.0], [1147.0, 5852.0], [1131.0, 3721.25], [1135.0, 3570.2], [1127.0, 4066.5], [1099.0, 4471.0], [1159.0, 3720.166666666667], [1183.0, 5591.0], [1175.0, 4065.0], [1179.0, 5342.0], [1171.0, 4034.5], [1155.0, 3708.5], [1167.0, 4338.0], [1163.0, 6218.0], [1215.0, 3938.5], [1187.0, 6064.0], [1211.0, 4132.666666666667], [1207.0, 5505.0], [1203.0, 5848.0], [1195.0, 3818.75], [1199.0, 4308.5], [1191.0, 4351.0], [1275.0, 5055.0], [1279.0, 5355.0], [1251.0, 5547.0], [1255.0, 5043.0], [1259.0, 5758.0], [1271.0, 5776.0], [1267.0, 4951.0], [1247.0, 5351.0], [1219.0, 4836.0], [1223.0, 5857.0], [1227.0, 4503.0], [1231.0, 5097.0], [1243.0, 5077.0], [1239.0, 4578.0], [1235.0, 4950.0], [1263.0, 5712.0], [1339.0, 4495.0], [1343.0, 6280.0], [1315.0, 5132.0], [1319.0, 5096.0], [1323.0, 4119.0], [1327.0, 4775.0], [1335.0, 5464.0], [1331.0, 4831.0], [1311.0, 5216.0], [1283.0, 5216.0], [1287.0, 5236.0], [1291.0, 5451.0], [1295.0, 5155.0], [1307.0, 5674.0], [1303.0, 4981.0], [1299.0, 4925.0], [1403.0, 3883.0], [1407.0, 3857.0], [1379.0, 4805.0], [1383.0, 5204.0], [1387.0, 4686.0], [1391.0, 4948.0], [1399.0, 5025.0], [1395.0, 3775.0], [1375.0, 4450.0], [1347.0, 4498.0], [1351.0, 3930.0], [1355.0, 5106.0], [1359.0, 4578.0], [1371.0, 4128.0], [1367.0, 4952.0], [1363.0, 4714.0], [1471.0, 5288.0], [1451.0, 3977.0], [1447.0, 4326.25], [1443.0, 4383.5], [1467.0, 4973.0], [1463.0, 4683.5], [1423.0, 4285.0], [1419.0, 4427.0], [1415.0, 4678.0], [1411.0, 4711.0], [1439.0, 4240.4], [1435.0, 5106.0], [1431.0, 3347.0], [1427.0, 5027.0], [1455.0, 4188.833333333333], [1459.0, 4230.0], [1475.0, 4988.0], [1499.0, 4260.0], [1503.0, 4593.0], [1491.0, 5452.0], [1495.0, 4875.0], [1479.0, 4160.0], [1483.0, 4518.75], [1487.0, 4422.25], [1523.0, 5242.0], [1527.0, 4837.0], [1531.0, 4360.0], [1535.0, 4579.0], [1507.0, 4968.0], [1511.0, 4496.0], [1515.0, 4582.0], [1519.0, 4480.75], [1539.0, 4178.0], [1543.0, 4306.0], [1567.0, 4613.5], [1563.0, 4438.0], [1559.0, 4636.0], [1555.0, 4143.0], [1547.0, 4480.333333333333], [1595.0, 4225.5], [1599.0, 4537.0], [1591.0, 5086.0], [1587.0, 4540.0], [1551.0, 3990.0], [1571.0, 4263.0], [1575.0, 4612.0], [1579.0, 4684.0], [1583.0, 4359.8], [1603.0, 5166.0], [1.0, 7094.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[852.0123333333329, 4565.527333333337]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1603.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12600.0, "minX": 1.54960794E12, "maxY": 21045.766666666666, "series": [{"data": [[1.54960794E12, 21045.766666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960794E12, 12600.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960794E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 4565.527333333337, "minX": 1.54960794E12, "maxY": 4565.527333333337, "series": [{"data": [[1.54960794E12, 4565.527333333337]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960794E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 4565.519666666654, "minX": 1.54960794E12, "maxY": 4565.519666666654, "series": [{"data": [[1.54960794E12, 4565.519666666654]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960794E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 105.37200000000009, "minX": 1.54960794E12, "maxY": 105.37200000000009, "series": [{"data": [[1.54960794E12, 105.37200000000009]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960794E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 186.0, "minX": 1.54960794E12, "maxY": 8958.0, "series": [{"data": [[1.54960794E12, 8958.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960794E12, 186.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960794E12, 7366.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960794E12, 8434.98]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960794E12, 7926.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960794E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4716.0, "minX": 50.0, "maxY": 4716.0, "series": [{"data": [[50.0, 4716.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4716.0, "minX": 50.0, "maxY": 4716.0, "series": [{"data": [[50.0, 4716.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960794E12, "maxY": 50.0, "series": [{"data": [[1.54960794E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960794E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960794E12, "maxY": 50.0, "series": [{"data": [[1.54960794E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960794E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960794E12, "maxY": 50.0, "series": [{"data": [[1.54960794E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960794E12, "title": "Transactions Per Second"}},
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
