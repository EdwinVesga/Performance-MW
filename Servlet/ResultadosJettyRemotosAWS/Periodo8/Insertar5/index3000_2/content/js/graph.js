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
        data: {"result": {"minY": 342.0, "minX": 0.0, "maxY": 9631.0, "series": [{"data": [[0.0, 342.0], [0.1, 561.0], [0.2, 793.0], [0.3, 915.0], [0.4, 949.0], [0.5, 1002.0], [0.6, 1029.0], [0.7, 1070.0], [0.8, 1082.0], [0.9, 1100.0], [1.0, 1112.0], [1.1, 1118.0], [1.2, 1157.0], [1.3, 1168.0], [1.4, 1175.0], [1.5, 1191.0], [1.6, 1215.0], [1.7, 1228.0], [1.8, 1243.0], [1.9, 1250.0], [2.0, 1264.0], [2.1, 1276.0], [2.2, 1294.0], [2.3, 1300.0], [2.4, 1313.0], [2.5, 1319.0], [2.6, 1364.0], [2.7, 1366.0], [2.8, 1391.0], [2.9, 1402.0], [3.0, 1412.0], [3.1, 1432.0], [3.2, 1438.0], [3.3, 1446.0], [3.4, 1461.0], [3.5, 1482.0], [3.6, 1489.0], [3.7, 1500.0], [3.8, 1503.0], [3.9, 1508.0], [4.0, 1526.0], [4.1, 1533.0], [4.2, 1538.0], [4.3, 1545.0], [4.4, 1557.0], [4.5, 1559.0], [4.6, 1590.0], [4.7, 1598.0], [4.8, 1610.0], [4.9, 1612.0], [5.0, 1628.0], [5.1, 1652.0], [5.2, 1674.0], [5.3, 1685.0], [5.4, 1688.0], [5.5, 1704.0], [5.6, 1719.0], [5.7, 1731.0], [5.8, 1734.0], [5.9, 1756.0], [6.0, 1766.0], [6.1, 1772.0], [6.2, 1781.0], [6.3, 1792.0], [6.4, 1816.0], [6.5, 1829.0], [6.6, 1844.0], [6.7, 1852.0], [6.8, 1856.0], [6.9, 1858.0], [7.0, 1865.0], [7.1, 1867.0], [7.2, 1869.0], [7.3, 1875.0], [7.4, 1883.0], [7.5, 1892.0], [7.6, 1894.0], [7.7, 1908.0], [7.8, 1912.0], [7.9, 1916.0], [8.0, 1938.0], [8.1, 1958.0], [8.2, 1961.0], [8.3, 1971.0], [8.4, 1975.0], [8.5, 1987.0], [8.6, 1992.0], [8.7, 1999.0], [8.8, 2001.0], [8.9, 2004.0], [9.0, 2011.0], [9.1, 2023.0], [9.2, 2028.0], [9.3, 2035.0], [9.4, 2046.0], [9.5, 2050.0], [9.6, 2058.0], [9.7, 2067.0], [9.8, 2076.0], [9.9, 2089.0], [10.0, 2094.0], [10.1, 2097.0], [10.2, 2100.0], [10.3, 2109.0], [10.4, 2120.0], [10.5, 2123.0], [10.6, 2130.0], [10.7, 2135.0], [10.8, 2141.0], [10.9, 2151.0], [11.0, 2160.0], [11.1, 2162.0], [11.2, 2178.0], [11.3, 2180.0], [11.4, 2186.0], [11.5, 2191.0], [11.6, 2210.0], [11.7, 2223.0], [11.8, 2225.0], [11.9, 2230.0], [12.0, 2237.0], [12.1, 2249.0], [12.2, 2253.0], [12.3, 2264.0], [12.4, 2268.0], [12.5, 2271.0], [12.6, 2277.0], [12.7, 2282.0], [12.8, 2289.0], [12.9, 2294.0], [13.0, 2300.0], [13.1, 2303.0], [13.2, 2306.0], [13.3, 2308.0], [13.4, 2311.0], [13.5, 2314.0], [13.6, 2326.0], [13.7, 2328.0], [13.8, 2341.0], [13.9, 2347.0], [14.0, 2349.0], [14.1, 2350.0], [14.2, 2366.0], [14.3, 2372.0], [14.4, 2378.0], [14.5, 2384.0], [14.6, 2387.0], [14.7, 2391.0], [14.8, 2395.0], [14.9, 2398.0], [15.0, 2405.0], [15.1, 2412.0], [15.2, 2417.0], [15.3, 2420.0], [15.4, 2439.0], [15.5, 2444.0], [15.6, 2459.0], [15.7, 2462.0], [15.8, 2469.0], [15.9, 2481.0], [16.0, 2485.0], [16.1, 2486.0], [16.2, 2491.0], [16.3, 2499.0], [16.4, 2508.0], [16.5, 2514.0], [16.6, 2524.0], [16.7, 2536.0], [16.8, 2560.0], [16.9, 2565.0], [17.0, 2571.0], [17.1, 2573.0], [17.2, 2577.0], [17.3, 2581.0], [17.4, 2583.0], [17.5, 2586.0], [17.6, 2589.0], [17.7, 2592.0], [17.8, 2594.0], [17.9, 2599.0], [18.0, 2600.0], [18.1, 2603.0], [18.2, 2607.0], [18.3, 2620.0], [18.4, 2627.0], [18.5, 2651.0], [18.6, 2656.0], [18.7, 2659.0], [18.8, 2663.0], [18.9, 2667.0], [19.0, 2676.0], [19.1, 2678.0], [19.2, 2679.0], [19.3, 2694.0], [19.4, 2698.0], [19.5, 2704.0], [19.6, 2711.0], [19.7, 2723.0], [19.8, 2733.0], [19.9, 2744.0], [20.0, 2758.0], [20.1, 2767.0], [20.2, 2777.0], [20.3, 2784.0], [20.4, 2789.0], [20.5, 2801.0], [20.6, 2805.0], [20.7, 2816.0], [20.8, 2819.0], [20.9, 2828.0], [21.0, 2834.0], [21.1, 2839.0], [21.2, 2844.0], [21.3, 2850.0], [21.4, 2854.0], [21.5, 2855.0], [21.6, 2859.0], [21.7, 2859.0], [21.8, 2865.0], [21.9, 2878.0], [22.0, 2884.0], [22.1, 2894.0], [22.2, 2903.0], [22.3, 2913.0], [22.4, 2919.0], [22.5, 2928.0], [22.6, 2937.0], [22.7, 2956.0], [22.8, 2963.0], [22.9, 2971.0], [23.0, 2978.0], [23.1, 2993.0], [23.2, 2995.0], [23.3, 3014.0], [23.4, 3023.0], [23.5, 3038.0], [23.6, 3047.0], [23.7, 3065.0], [23.8, 3071.0], [23.9, 3078.0], [24.0, 3083.0], [24.1, 3088.0], [24.2, 3096.0], [24.3, 3106.0], [24.4, 3117.0], [24.5, 3124.0], [24.6, 3131.0], [24.7, 3133.0], [24.8, 3136.0], [24.9, 3143.0], [25.0, 3152.0], [25.1, 3155.0], [25.2, 3158.0], [25.3, 3166.0], [25.4, 3172.0], [25.5, 3177.0], [25.6, 3188.0], [25.7, 3197.0], [25.8, 3205.0], [25.9, 3208.0], [26.0, 3214.0], [26.1, 3221.0], [26.2, 3227.0], [26.3, 3230.0], [26.4, 3242.0], [26.5, 3248.0], [26.6, 3257.0], [26.7, 3260.0], [26.8, 3266.0], [26.9, 3270.0], [27.0, 3282.0], [27.1, 3289.0], [27.2, 3303.0], [27.3, 3320.0], [27.4, 3326.0], [27.5, 3334.0], [27.6, 3342.0], [27.7, 3347.0], [27.8, 3352.0], [27.9, 3358.0], [28.0, 3363.0], [28.1, 3364.0], [28.2, 3365.0], [28.3, 3374.0], [28.4, 3379.0], [28.5, 3382.0], [28.6, 3395.0], [28.7, 3410.0], [28.8, 3416.0], [28.9, 3428.0], [29.0, 3436.0], [29.1, 3440.0], [29.2, 3446.0], [29.3, 3458.0], [29.4, 3463.0], [29.5, 3469.0], [29.6, 3496.0], [29.7, 3504.0], [29.8, 3512.0], [29.9, 3521.0], [30.0, 3524.0], [30.1, 3531.0], [30.2, 3538.0], [30.3, 3546.0], [30.4, 3550.0], [30.5, 3553.0], [30.6, 3567.0], [30.7, 3576.0], [30.8, 3586.0], [30.9, 3597.0], [31.0, 3610.0], [31.1, 3618.0], [31.2, 3623.0], [31.3, 3623.0], [31.4, 3629.0], [31.5, 3640.0], [31.6, 3652.0], [31.7, 3660.0], [31.8, 3665.0], [31.9, 3667.0], [32.0, 3674.0], [32.1, 3679.0], [32.2, 3687.0], [32.3, 3695.0], [32.4, 3703.0], [32.5, 3717.0], [32.6, 3720.0], [32.7, 3734.0], [32.8, 3741.0], [32.9, 3753.0], [33.0, 3777.0], [33.1, 3784.0], [33.2, 3790.0], [33.3, 3797.0], [33.4, 3804.0], [33.5, 3815.0], [33.6, 3823.0], [33.7, 3831.0], [33.8, 3841.0], [33.9, 3852.0], [34.0, 3856.0], [34.1, 3860.0], [34.2, 3874.0], [34.3, 3877.0], [34.4, 3884.0], [34.5, 3895.0], [34.6, 3901.0], [34.7, 3907.0], [34.8, 3924.0], [34.9, 3930.0], [35.0, 3935.0], [35.1, 3936.0], [35.2, 3942.0], [35.3, 3962.0], [35.4, 3974.0], [35.5, 3979.0], [35.6, 3987.0], [35.7, 3998.0], [35.8, 4004.0], [35.9, 4010.0], [36.0, 4017.0], [36.1, 4023.0], [36.2, 4030.0], [36.3, 4048.0], [36.4, 4050.0], [36.5, 4058.0], [36.6, 4075.0], [36.7, 4081.0], [36.8, 4086.0], [36.9, 4090.0], [37.0, 4097.0], [37.1, 4100.0], [37.2, 4109.0], [37.3, 4116.0], [37.4, 4120.0], [37.5, 4133.0], [37.6, 4154.0], [37.7, 4157.0], [37.8, 4163.0], [37.9, 4166.0], [38.0, 4169.0], [38.1, 4174.0], [38.2, 4174.0], [38.3, 4189.0], [38.4, 4198.0], [38.5, 4206.0], [38.6, 4222.0], [38.7, 4227.0], [38.8, 4232.0], [38.9, 4243.0], [39.0, 4248.0], [39.1, 4256.0], [39.2, 4258.0], [39.3, 4264.0], [39.4, 4268.0], [39.5, 4271.0], [39.6, 4275.0], [39.7, 4291.0], [39.8, 4296.0], [39.9, 4300.0], [40.0, 4307.0], [40.1, 4314.0], [40.2, 4316.0], [40.3, 4326.0], [40.4, 4336.0], [40.5, 4345.0], [40.6, 4349.0], [40.7, 4351.0], [40.8, 4356.0], [40.9, 4368.0], [41.0, 4371.0], [41.1, 4374.0], [41.2, 4384.0], [41.3, 4391.0], [41.4, 4399.0], [41.5, 4400.0], [41.6, 4404.0], [41.7, 4406.0], [41.8, 4412.0], [41.9, 4422.0], [42.0, 4429.0], [42.1, 4434.0], [42.2, 4441.0], [42.3, 4444.0], [42.4, 4449.0], [42.5, 4453.0], [42.6, 4461.0], [42.7, 4470.0], [42.8, 4473.0], [42.9, 4480.0], [43.0, 4483.0], [43.1, 4491.0], [43.2, 4500.0], [43.3, 4503.0], [43.4, 4504.0], [43.5, 4518.0], [43.6, 4519.0], [43.7, 4525.0], [43.8, 4530.0], [43.9, 4541.0], [44.0, 4545.0], [44.1, 4556.0], [44.2, 4566.0], [44.3, 4571.0], [44.4, 4579.0], [44.5, 4580.0], [44.6, 4583.0], [44.7, 4599.0], [44.8, 4602.0], [44.9, 4612.0], [45.0, 4621.0], [45.1, 4624.0], [45.2, 4631.0], [45.3, 4639.0], [45.4, 4644.0], [45.5, 4649.0], [45.6, 4657.0], [45.7, 4662.0], [45.8, 4666.0], [45.9, 4671.0], [46.0, 4677.0], [46.1, 4692.0], [46.2, 4696.0], [46.3, 4700.0], [46.4, 4705.0], [46.5, 4711.0], [46.6, 4715.0], [46.7, 4720.0], [46.8, 4721.0], [46.9, 4730.0], [47.0, 4733.0], [47.1, 4737.0], [47.2, 4741.0], [47.3, 4744.0], [47.4, 4748.0], [47.5, 4754.0], [47.6, 4757.0], [47.7, 4763.0], [47.8, 4770.0], [47.9, 4773.0], [48.0, 4776.0], [48.1, 4776.0], [48.2, 4780.0], [48.3, 4795.0], [48.4, 4798.0], [48.5, 4801.0], [48.6, 4805.0], [48.7, 4809.0], [48.8, 4812.0], [48.9, 4815.0], [49.0, 4822.0], [49.1, 4834.0], [49.2, 4835.0], [49.3, 4844.0], [49.4, 4847.0], [49.5, 4854.0], [49.6, 4856.0], [49.7, 4867.0], [49.8, 4870.0], [49.9, 4873.0], [50.0, 4878.0], [50.1, 4885.0], [50.2, 4893.0], [50.3, 4896.0], [50.4, 4901.0], [50.5, 4918.0], [50.6, 4930.0], [50.7, 4941.0], [50.8, 4949.0], [50.9, 4950.0], [51.0, 4956.0], [51.1, 4961.0], [51.2, 4967.0], [51.3, 4974.0], [51.4, 4979.0], [51.5, 4984.0], [51.6, 4989.0], [51.7, 4994.0], [51.8, 5000.0], [51.9, 5001.0], [52.0, 5004.0], [52.1, 5020.0], [52.2, 5023.0], [52.3, 5032.0], [52.4, 5036.0], [52.5, 5039.0], [52.6, 5043.0], [52.7, 5049.0], [52.8, 5053.0], [52.9, 5059.0], [53.0, 5061.0], [53.1, 5063.0], [53.2, 5073.0], [53.3, 5076.0], [53.4, 5082.0], [53.5, 5089.0], [53.6, 5094.0], [53.7, 5101.0], [53.8, 5105.0], [53.9, 5116.0], [54.0, 5125.0], [54.1, 5126.0], [54.2, 5136.0], [54.3, 5141.0], [54.4, 5154.0], [54.5, 5162.0], [54.6, 5170.0], [54.7, 5176.0], [54.8, 5178.0], [54.9, 5181.0], [55.0, 5185.0], [55.1, 5191.0], [55.2, 5196.0], [55.3, 5198.0], [55.4, 5205.0], [55.5, 5213.0], [55.6, 5219.0], [55.7, 5223.0], [55.8, 5226.0], [55.9, 5227.0], [56.0, 5235.0], [56.1, 5238.0], [56.2, 5242.0], [56.3, 5261.0], [56.4, 5268.0], [56.5, 5269.0], [56.6, 5277.0], [56.7, 5282.0], [56.8, 5290.0], [56.9, 5301.0], [57.0, 5305.0], [57.1, 5311.0], [57.2, 5328.0], [57.3, 5332.0], [57.4, 5336.0], [57.5, 5339.0], [57.6, 5343.0], [57.7, 5353.0], [57.8, 5361.0], [57.9, 5368.0], [58.0, 5375.0], [58.1, 5386.0], [58.2, 5393.0], [58.3, 5401.0], [58.4, 5406.0], [58.5, 5408.0], [58.6, 5421.0], [58.7, 5433.0], [58.8, 5455.0], [58.9, 5458.0], [59.0, 5463.0], [59.1, 5468.0], [59.2, 5475.0], [59.3, 5491.0], [59.4, 5494.0], [59.5, 5503.0], [59.6, 5527.0], [59.7, 5530.0], [59.8, 5538.0], [59.9, 5542.0], [60.0, 5557.0], [60.1, 5561.0], [60.2, 5572.0], [60.3, 5579.0], [60.4, 5581.0], [60.5, 5594.0], [60.6, 5600.0], [60.7, 5611.0], [60.8, 5615.0], [60.9, 5620.0], [61.0, 5629.0], [61.1, 5642.0], [61.2, 5652.0], [61.3, 5661.0], [61.4, 5673.0], [61.5, 5686.0], [61.6, 5693.0], [61.7, 5698.0], [61.8, 5705.0], [61.9, 5714.0], [62.0, 5716.0], [62.1, 5734.0], [62.2, 5746.0], [62.3, 5759.0], [62.4, 5763.0], [62.5, 5785.0], [62.6, 5788.0], [62.7, 5807.0], [62.8, 5816.0], [62.9, 5825.0], [63.0, 5832.0], [63.1, 5840.0], [63.2, 5847.0], [63.3, 5849.0], [63.4, 5857.0], [63.5, 5863.0], [63.6, 5869.0], [63.7, 5882.0], [63.8, 5890.0], [63.9, 5897.0], [64.0, 5903.0], [64.1, 5909.0], [64.2, 5914.0], [64.3, 5924.0], [64.4, 5926.0], [64.5, 5942.0], [64.6, 5949.0], [64.7, 5959.0], [64.8, 5969.0], [64.9, 5979.0], [65.0, 5991.0], [65.1, 6000.0], [65.2, 6019.0], [65.3, 6027.0], [65.4, 6030.0], [65.5, 6051.0], [65.6, 6059.0], [65.7, 6066.0], [65.8, 6071.0], [65.9, 6078.0], [66.0, 6087.0], [66.1, 6096.0], [66.2, 6107.0], [66.3, 6113.0], [66.4, 6119.0], [66.5, 6134.0], [66.6, 6147.0], [66.7, 6153.0], [66.8, 6157.0], [66.9, 6158.0], [67.0, 6165.0], [67.1, 6178.0], [67.2, 6184.0], [67.3, 6193.0], [67.4, 6201.0], [67.5, 6207.0], [67.6, 6215.0], [67.7, 6221.0], [67.8, 6244.0], [67.9, 6254.0], [68.0, 6263.0], [68.1, 6273.0], [68.2, 6277.0], [68.3, 6289.0], [68.4, 6298.0], [68.5, 6303.0], [68.6, 6310.0], [68.7, 6314.0], [68.8, 6316.0], [68.9, 6332.0], [69.0, 6346.0], [69.1, 6356.0], [69.2, 6357.0], [69.3, 6368.0], [69.4, 6380.0], [69.5, 6406.0], [69.6, 6415.0], [69.7, 6425.0], [69.8, 6443.0], [69.9, 6475.0], [70.0, 6488.0], [70.1, 6495.0], [70.2, 6509.0], [70.3, 6518.0], [70.4, 6526.0], [70.5, 6542.0], [70.6, 6550.0], [70.7, 6564.0], [70.8, 6570.0], [70.9, 6583.0], [71.0, 6594.0], [71.1, 6600.0], [71.2, 6609.0], [71.3, 6616.0], [71.4, 6624.0], [71.5, 6631.0], [71.6, 6642.0], [71.7, 6647.0], [71.8, 6653.0], [71.9, 6671.0], [72.0, 6688.0], [72.1, 6701.0], [72.2, 6712.0], [72.3, 6720.0], [72.4, 6741.0], [72.5, 6751.0], [72.6, 6764.0], [72.7, 6775.0], [72.8, 6777.0], [72.9, 6783.0], [73.0, 6787.0], [73.1, 6793.0], [73.2, 6809.0], [73.3, 6823.0], [73.4, 6826.0], [73.5, 6838.0], [73.6, 6839.0], [73.7, 6855.0], [73.8, 6863.0], [73.9, 6872.0], [74.0, 6876.0], [74.1, 6881.0], [74.2, 6890.0], [74.3, 6897.0], [74.4, 6905.0], [74.5, 6916.0], [74.6, 6920.0], [74.7, 6925.0], [74.8, 6933.0], [74.9, 6937.0], [75.0, 6938.0], [75.1, 6947.0], [75.2, 6960.0], [75.3, 6970.0], [75.4, 6975.0], [75.5, 6978.0], [75.6, 6987.0], [75.7, 6992.0], [75.8, 7000.0], [75.9, 7002.0], [76.0, 7012.0], [76.1, 7017.0], [76.2, 7023.0], [76.3, 7030.0], [76.4, 7031.0], [76.5, 7049.0], [76.6, 7055.0], [76.7, 7060.0], [76.8, 7071.0], [76.9, 7077.0], [77.0, 7097.0], [77.1, 7103.0], [77.2, 7114.0], [77.3, 7120.0], [77.4, 7127.0], [77.5, 7134.0], [77.6, 7139.0], [77.7, 7148.0], [77.8, 7152.0], [77.9, 7163.0], [78.0, 7178.0], [78.1, 7184.0], [78.2, 7188.0], [78.3, 7197.0], [78.4, 7208.0], [78.5, 7217.0], [78.6, 7219.0], [78.7, 7222.0], [78.8, 7224.0], [78.9, 7231.0], [79.0, 7241.0], [79.1, 7257.0], [79.2, 7264.0], [79.3, 7268.0], [79.4, 7273.0], [79.5, 7287.0], [79.6, 7294.0], [79.7, 7305.0], [79.8, 7312.0], [79.9, 7316.0], [80.0, 7321.0], [80.1, 7327.0], [80.2, 7330.0], [80.3, 7339.0], [80.4, 7351.0], [80.5, 7353.0], [80.6, 7364.0], [80.7, 7371.0], [80.8, 7380.0], [80.9, 7384.0], [81.0, 7387.0], [81.1, 7392.0], [81.2, 7397.0], [81.3, 7402.0], [81.4, 7407.0], [81.5, 7408.0], [81.6, 7420.0], [81.7, 7425.0], [81.8, 7430.0], [81.9, 7435.0], [82.0, 7438.0], [82.1, 7440.0], [82.2, 7442.0], [82.3, 7446.0], [82.4, 7448.0], [82.5, 7451.0], [82.6, 7454.0], [82.7, 7464.0], [82.8, 7467.0], [82.9, 7475.0], [83.0, 7477.0], [83.1, 7485.0], [83.2, 7496.0], [83.3, 7500.0], [83.4, 7505.0], [83.5, 7513.0], [83.6, 7520.0], [83.7, 7526.0], [83.8, 7532.0], [83.9, 7536.0], [84.0, 7537.0], [84.1, 7542.0], [84.2, 7546.0], [84.3, 7547.0], [84.4, 7549.0], [84.5, 7554.0], [84.6, 7558.0], [84.7, 7559.0], [84.8, 7560.0], [84.9, 7561.0], [85.0, 7574.0], [85.1, 7582.0], [85.2, 7584.0], [85.3, 7589.0], [85.4, 7601.0], [85.5, 7604.0], [85.6, 7605.0], [85.7, 7611.0], [85.8, 7613.0], [85.9, 7620.0], [86.0, 7625.0], [86.1, 7635.0], [86.2, 7640.0], [86.3, 7653.0], [86.4, 7654.0], [86.5, 7663.0], [86.6, 7670.0], [86.7, 7679.0], [86.8, 7682.0], [86.9, 7688.0], [87.0, 7691.0], [87.1, 7692.0], [87.2, 7700.0], [87.3, 7705.0], [87.4, 7709.0], [87.5, 7714.0], [87.6, 7721.0], [87.7, 7725.0], [87.8, 7730.0], [87.9, 7734.0], [88.0, 7737.0], [88.1, 7741.0], [88.2, 7745.0], [88.3, 7752.0], [88.4, 7756.0], [88.5, 7762.0], [88.6, 7771.0], [88.7, 7777.0], [88.8, 7780.0], [88.9, 7783.0], [89.0, 7786.0], [89.1, 7798.0], [89.2, 7807.0], [89.3, 7811.0], [89.4, 7816.0], [89.5, 7821.0], [89.6, 7828.0], [89.7, 7834.0], [89.8, 7839.0], [89.9, 7843.0], [90.0, 7844.0], [90.1, 7846.0], [90.2, 7850.0], [90.3, 7859.0], [90.4, 7864.0], [90.5, 7870.0], [90.6, 7879.0], [90.7, 7889.0], [90.8, 7894.0], [90.9, 7904.0], [91.0, 7905.0], [91.1, 7909.0], [91.2, 7920.0], [91.3, 7927.0], [91.4, 7937.0], [91.5, 7950.0], [91.6, 7953.0], [91.7, 7954.0], [91.8, 7959.0], [91.9, 7960.0], [92.0, 7971.0], [92.1, 7977.0], [92.2, 7985.0], [92.3, 7996.0], [92.4, 8002.0], [92.5, 8011.0], [92.6, 8018.0], [92.7, 8023.0], [92.8, 8031.0], [92.9, 8034.0], [93.0, 8034.0], [93.1, 8044.0], [93.2, 8049.0], [93.3, 8056.0], [93.4, 8062.0], [93.5, 8067.0], [93.6, 8069.0], [93.7, 8075.0], [93.8, 8079.0], [93.9, 8082.0], [94.0, 8085.0], [94.1, 8099.0], [94.2, 8105.0], [94.3, 8115.0], [94.4, 8130.0], [94.5, 8140.0], [94.6, 8142.0], [94.7, 8158.0], [94.8, 8165.0], [94.9, 8178.0], [95.0, 8195.0], [95.1, 8207.0], [95.2, 8213.0], [95.3, 8227.0], [95.4, 8233.0], [95.5, 8268.0], [95.6, 8270.0], [95.7, 8293.0], [95.8, 8304.0], [95.9, 8308.0], [96.0, 8328.0], [96.1, 8342.0], [96.2, 8365.0], [96.3, 8398.0], [96.4, 8410.0], [96.5, 8427.0], [96.6, 8441.0], [96.7, 8461.0], [96.8, 8490.0], [96.9, 8516.0], [97.0, 8546.0], [97.1, 8560.0], [97.2, 8577.0], [97.3, 8593.0], [97.4, 8611.0], [97.5, 8623.0], [97.6, 8632.0], [97.7, 8645.0], [97.8, 8669.0], [97.9, 8682.0], [98.0, 8695.0], [98.1, 8719.0], [98.2, 8760.0], [98.3, 8762.0], [98.4, 8800.0], [98.5, 8825.0], [98.6, 8875.0], [98.7, 8903.0], [98.8, 8945.0], [98.9, 8991.0], [99.0, 9023.0], [99.1, 9040.0], [99.2, 9064.0], [99.3, 9085.0], [99.4, 9106.0], [99.5, 9210.0], [99.6, 9252.0], [99.7, 9346.0], [99.8, 9357.0], [99.9, 9422.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 64.0, "series": [{"data": [[600.0, 2.0], [700.0, 1.0], [800.0, 2.0], [900.0, 6.0], [1000.0, 12.0], [1100.0, 19.0], [1200.0, 22.0], [1300.0, 19.0], [1400.0, 24.0], [1500.0, 31.0], [1600.0, 22.0], [1700.0, 26.0], [1800.0, 40.0], [1900.0, 32.0], [2000.0, 44.0], [2100.0, 41.0], [2200.0, 43.0], [2300.0, 58.0], [2400.0, 42.0], [2500.0, 47.0], [2600.0, 46.0], [2700.0, 30.0], [2800.0, 52.0], [2900.0, 31.0], [3000.0, 30.0], [3100.0, 45.0], [3200.0, 43.0], [3300.0, 44.0], [3400.0, 30.0], [3500.0, 39.0], [3600.0, 42.0], [3700.0, 30.0], [3800.0, 38.0], [3900.0, 35.0], [4000.0, 40.0], [4100.0, 40.0], [4300.0, 46.0], [4200.0, 44.0], [4600.0, 47.0], [4400.0, 53.0], [4500.0, 46.0], [4700.0, 64.0], [4800.0, 57.0], [4900.0, 42.0], [5100.0, 52.0], [5000.0, 58.0], [5200.0, 46.0], [5300.0, 42.0], [5400.0, 35.0], [5500.0, 34.0], [5600.0, 34.0], [5700.0, 28.0], [5800.0, 38.0], [5900.0, 35.0], [6000.0, 32.0], [6100.0, 36.0], [6300.0, 31.0], [6200.0, 32.0], [6500.0, 28.0], [6400.0, 21.0], [6600.0, 30.0], [6700.0, 32.0], [6800.0, 36.0], [6900.0, 43.0], [7100.0, 39.0], [7000.0, 37.0], [7400.0, 61.0], [7200.0, 40.0], [7300.0, 48.0], [7500.0, 63.0], [7600.0, 54.0], [7700.0, 59.0], [7800.0, 51.0], [7900.0, 46.0], [8000.0, 52.0], [8100.0, 27.0], [8600.0, 21.0], [8700.0, 10.0], [8400.0, 16.0], [8500.0, 15.0], [8200.0, 22.0], [8300.0, 17.0], [9000.0, 14.0], [8800.0, 9.0], [8900.0, 7.0], [9200.0, 7.0], [9100.0, 2.0], [9400.0, 2.0], [9300.0, 5.0], [9600.0, 1.0], [9500.0, 1.0], [300.0, 1.0], [400.0, 1.0], [500.0, 2.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 9600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 2.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2888.0, "series": [{"data": [[1.0, 110.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 2.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2888.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 924.7689999999985, "minX": 1.54960842E12, "maxY": 924.7689999999985, "series": [{"data": [[1.54960842E12, 924.7689999999985]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1813.0, "minX": 1.0, "maxY": 9631.0, "series": [{"data": [[3.0, 7950.5], [5.0, 8570.0], [6.0, 7653.0], [8.0, 7945.5], [9.0, 8192.0], [10.0, 7893.0], [11.0, 8046.0], [12.0, 8165.0], [13.0, 7839.0], [14.0, 7741.0], [15.0, 8061.0], [16.0, 7905.0], [18.0, 7842.5], [19.0, 7754.0], [20.0, 7841.0], [21.0, 8018.0], [22.0, 7525.0], [23.0, 8142.0], [24.0, 7475.0], [25.0, 8166.0], [27.0, 8101.0], [28.0, 8078.0], [29.0, 7685.0], [30.0, 7497.0], [33.0, 7598.0], [32.0, 7955.0], [35.0, 7845.0], [34.0, 7440.0], [37.0, 7579.5], [38.0, 8117.0], [40.0, 7706.5], [43.0, 8328.0], [42.0, 8010.5], [44.0, 8107.0], [47.0, 7841.0], [46.0, 7735.0], [49.0, 8081.0], [48.0, 7952.5], [51.0, 7740.0], [50.0, 7870.0], [53.0, 8328.0], [52.0, 7481.0], [54.0, 7686.0], [57.0, 8207.0], [56.0, 7816.5], [59.0, 7503.0], [58.0, 7959.0], [61.0, 8410.0], [60.0, 7977.0], [62.0, 7761.0], [66.0, 7499.0], [64.0, 7533.5], [71.0, 8203.0], [70.0, 7958.0], [69.0, 9350.0], [68.0, 7855.0], [75.0, 7920.0], [74.0, 7582.0], [73.0, 8260.0], [72.0, 8140.0], [79.0, 7680.5], [77.0, 7756.0], [76.0, 7420.0], [83.0, 7985.0], [82.0, 7777.0], [81.0, 9355.0], [80.0, 8027.0], [87.0, 8158.0], [86.0, 7719.0], [85.0, 7384.0], [91.0, 7484.0], [90.0, 9357.0], [89.0, 8442.0], [88.0, 7778.0], [95.0, 8297.0], [94.0, 7382.0], [93.0, 7625.0], [92.0, 7734.0], [98.0, 7729.0], [96.0, 7700.0], [103.0, 7718.0], [101.0, 7589.0], [100.0, 7449.5], [107.0, 7611.0], [106.0, 7730.0], [105.0, 8224.0], [104.0, 7547.0], [111.0, 7917.5], [109.0, 7864.0], [108.0, 7446.0], [115.0, 7948.0], [114.0, 8005.0], [113.0, 8084.0], [112.0, 8398.0], [119.0, 7679.0], [118.0, 9372.0], [117.0, 7798.0], [116.0, 7859.0], [123.0, 8153.0], [122.0, 7882.0], [120.0, 7460.0], [126.0, 7489.5], [124.0, 8025.0], [135.0, 7485.0], [134.0, 7905.5], [132.0, 7452.0], [131.0, 8288.0], [130.0, 7963.0], [128.0, 7968.0], [143.0, 7605.0], [142.0, 7451.0], [141.0, 7562.0], [140.0, 7811.0], [139.0, 7385.0], [138.0, 7738.0], [137.0, 7816.0], [136.0, 7439.0], [151.0, 8082.0], [150.0, 8321.0], [149.0, 7850.0], [148.0, 7805.0], [147.0, 8216.0], [146.0, 7305.0], [145.0, 7330.0], [144.0, 8033.0], [159.0, 7982.0], [158.0, 7596.0], [157.0, 7759.0], [156.0, 7629.0], [154.0, 7815.0], [152.0, 7985.0], [167.0, 8004.0], [166.0, 9044.0], [165.0, 7537.0], [164.0, 7785.0], [163.0, 7720.0], [162.0, 8034.0], [161.0, 7834.0], [175.0, 7526.0], [174.0, 7826.0], [173.0, 8102.0], [172.0, 9210.0], [171.0, 7441.0], [170.0, 7450.0], [169.0, 7963.0], [168.0, 7953.0], [183.0, 7317.0], [182.0, 7844.0], [181.0, 7921.0], [180.0, 7702.0], [179.0, 8002.0], [178.0, 7352.0], [177.0, 7971.0], [176.0, 7659.0], [191.0, 7617.0], [190.0, 7844.0], [189.0, 7552.0], [188.0, 8233.0], [187.0, 7561.0], [186.0, 8012.0], [185.0, 7750.0], [184.0, 7911.0], [199.0, 9237.0], [198.0, 8034.0], [197.0, 8227.0], [196.0, 9213.0], [195.0, 7413.0], [194.0, 7397.0], [193.0, 7545.0], [192.0, 7787.0], [207.0, 7765.0], [206.0, 7828.0], [205.0, 8082.0], [204.0, 7692.0], [203.0, 7379.0], [202.0, 7252.0], [201.0, 7469.0], [200.0, 8206.0], [215.0, 8308.0], [214.0, 7486.0], [213.0, 7526.0], [212.0, 7322.0], [211.0, 7832.0], [210.0, 9252.0], [209.0, 7972.0], [208.0, 7582.0], [223.0, 7950.0], [222.0, 7870.0], [221.0, 7387.0], [220.0, 7786.0], [219.0, 8304.0], [218.0, 9126.0], [217.0, 8140.0], [216.0, 7937.0], [231.0, 7603.0], [230.0, 7938.0], [229.0, 9106.0], [228.0, 7953.0], [227.0, 7719.0], [226.0, 7611.0], [225.0, 7697.0], [224.0, 7184.0], [239.0, 7742.0], [238.0, 7689.0], [237.0, 7951.0], [236.0, 7357.0], [235.0, 7364.0], [234.0, 7548.0], [233.0, 7408.0], [232.0, 7578.0], [247.0, 9035.0], [246.0, 7561.0], [245.0, 7807.0], [244.0, 7279.0], [243.0, 7613.0], [242.0, 8074.0], [241.0, 8117.0], [240.0, 7134.0], [255.0, 8062.0], [254.0, 7737.0], [253.0, 7435.0], [252.0, 8080.0], [251.0, 9284.0], [250.0, 8032.0], [249.0, 7560.0], [248.0, 7119.0], [270.0, 7127.0], [271.0, 7519.0], [269.0, 7903.0], [268.0, 7624.0], [267.0, 9346.0], [266.0, 7560.0], [265.0, 7437.0], [264.0, 7122.0], [263.0, 7500.0], [257.0, 9631.0], [256.0, 9099.0], [259.0, 7321.0], [258.0, 7446.0], [262.0, 7672.0], [261.0, 9205.0], [260.0, 7194.0], [286.0, 7432.0], [285.0, 4572.0], [287.0, 7932.0], [284.0, 7851.0], [283.0, 8050.0], [282.0, 7845.0], [281.0, 9085.0], [280.0, 8945.0], [279.0, 7889.0], [273.0, 7547.0], [272.0, 7785.0], [275.0, 7150.0], [274.0, 7653.0], [278.0, 7618.0], [277.0, 7827.0], [276.0, 7006.0], [302.0, 7142.0], [303.0, 7670.0], [301.0, 7714.0], [300.0, 7351.0], [299.0, 8602.0], [298.0, 9067.0], [297.0, 7724.0], [296.0, 7371.0], [295.0, 7103.0], [289.0, 7010.0], [288.0, 7725.0], [291.0, 8968.0], [290.0, 7163.0], [294.0, 7871.0], [293.0, 7161.0], [292.0, 8523.0], [318.0, 7843.0], [305.0, 4244.5], [310.0, 3873.5], [309.0, 6905.0], [308.0, 8903.0], [311.0, 6914.0], [304.0, 7881.0], [319.0, 8990.0], [317.0, 7030.0], [316.0, 6938.0], [307.0, 7959.0], [306.0, 7380.0], [315.0, 7465.0], [314.0, 7836.0], [313.0, 7908.0], [312.0, 8172.0], [334.0, 4990.0], [321.0, 3682.3333333333335], [327.0, 4433.5], [320.0, 7458.0], [326.0, 9084.0], [325.0, 7465.0], [324.0, 7752.0], [335.0, 4425.0], [333.0, 8885.0], [332.0, 7503.0], [323.0, 7655.0], [322.0, 7017.0], [331.0, 8890.0], [330.0, 8012.0], [328.0, 7149.0], [350.0, 4241.0], [337.0, 4406.5], [336.0, 4149.0], [343.0, 7782.0], [342.0, 7473.0], [341.0, 7223.0], [340.0, 6890.0], [338.0, 4111.5], [339.0, 8924.0], [351.0, 3747.0], [345.0, 7052.0], [344.0, 7811.0], [349.0, 9040.0], [348.0, 7557.0], [347.0, 7015.0], [346.0, 7834.0], [366.0, 4414.0], [362.0, 4991.0], [353.0, 4465.5], [352.0, 8086.0], [355.0, 9295.0], [354.0, 7959.0], [359.0, 7513.0], [358.0, 7725.0], [357.0, 7129.0], [356.0, 8762.0], [363.0, 4326.5], [367.0, 7077.0], [365.0, 8645.0], [364.0, 7775.0], [361.0, 7588.0], [360.0, 7725.0], [383.0, 8560.0], [368.0, 4265.0], [376.0, 2155.6], [375.0, 2870.0], [374.0, 8825.0], [373.0, 7821.0], [372.0, 6867.0], [377.0, 4145.0], [379.0, 5870.0], [382.0, 7747.0], [381.0, 8717.0], [380.0, 7528.0], [371.0, 8649.0], [370.0, 7574.0], [369.0, 7542.0], [397.0, 3789.6666666666665], [393.0, 4386.0], [384.0, 4944.0], [391.0, 7402.0], [390.0, 8801.0], [389.0, 6935.0], [388.0, 9064.0], [394.0, 2903.0], [398.0, 4081.5], [399.0, 5018.5], [396.0, 8823.0], [387.0, 8619.0], [386.0, 7604.0], [385.0, 6780.0], [395.0, 6683.0], [392.0, 8023.0], [407.0, 2932.8], [401.0, 5102.5], [400.0, 8623.0], [403.0, 8176.0], [404.0, 5056.5], [405.0, 4764.0], [406.0, 3024.333333333333], [408.0, 3509.6666666666665], [412.0, 4857.5], [411.0, 5135.5], [410.0, 6898.0], [409.0, 7688.0], [413.0, 4425.0], [415.0, 7221.0], [414.0, 7381.0], [431.0, 8079.0], [420.0, 4198.5], [422.0, 8689.0], [421.0, 7288.0], [426.0, 4657.5], [430.0, 8490.0], [429.0, 7429.0], [428.0, 8441.0], [419.0, 7424.0], [418.0, 8707.0], [416.0, 6594.0], [423.0, 7559.0], [427.0, 8745.0], [425.0, 8760.0], [424.0, 7623.0], [446.0, 6886.0], [432.0, 5094.5], [434.0, 4741.0], [433.0, 7209.0], [445.0, 7934.0], [444.0, 8561.0], [437.0, 3748.0], [436.0, 7668.5], [440.0, 3216.25], [438.0, 4062.5], [439.0, 8406.0], [442.0, 4892.0], [441.0, 7238.0], [443.0, 3592.0], [447.0, 7257.0], [462.0, 4207.0], [458.0, 3971.0], [460.0, 4454.0], [463.0, 7262.0], [461.0, 8546.0], [459.0, 8360.0], [457.0, 6354.0], [456.0, 7241.0], [455.0, 7953.0], [449.0, 8760.0], [448.0, 8415.0], [451.0, 8875.0], [450.0, 6921.0], [454.0, 7407.0], [453.0, 8571.0], [452.0, 8492.0], [478.0, 4666.5], [465.0, 4608.5], [464.0, 8420.0], [467.0, 7471.5], [471.0, 7551.0], [470.0, 7443.0], [469.0, 7332.0], [468.0, 7264.0], [473.0, 3999.3333333333335], [477.0, 4394.0], [476.0, 3361.666666666667], [475.0, 5073.0], [479.0, 8213.0], [474.0, 7261.0], [472.0, 8427.0], [492.0, 4750.5], [480.0, 4731.5], [483.0, 2549.25], [482.0, 7445.0], [481.0, 7357.0], [487.0, 3832.3333333333335], [486.0, 3768.0], [485.0, 7269.0], [484.0, 7152.0], [491.0, 4269.0], [490.0, 5136.5], [493.0, 4891.0], [495.0, 8630.0], [489.0, 8850.0], [488.0, 7023.0], [494.0, 7185.0], [510.0, 7268.0], [504.0, 5064.0], [505.0, 2708.4], [508.0, 5262.0], [511.0, 7515.0], [509.0, 8365.0], [507.0, 6495.0], [506.0, 8268.0], [503.0, 8661.0], [497.0, 7441.0], [496.0, 7635.0], [499.0, 8228.0], [498.0, 8269.0], [502.0, 7224.0], [501.0, 7120.0], [500.0, 6511.0], [512.0, 8342.0], [516.0, 3925.666666666667], [520.0, 4196.5], [522.0, 8577.0], [524.0, 7843.0], [514.0, 6975.0], [526.0, 7206.0], [534.0, 2842.25], [532.0, 8034.0], [530.0, 8069.0], [528.0, 6707.0], [538.0, 4074.0], [536.0, 8302.0], [518.0, 7242.0], [540.0, 7000.0], [542.0, 7743.0], [550.0, 4994.5], [570.0, 8034.0], [544.0, 4566.0], [546.0, 3887.0], [548.0, 7217.0], [568.0, 7058.0], [572.0, 7994.0], [574.0, 4161.5], [560.0, 3751.0], [566.0, 4627.5], [562.0, 7071.0], [552.0, 4157.5], [554.0, 8463.0], [556.0, 4597.0], [558.0, 5143.0], [582.0, 7889.0], [604.0, 2670.6666666666665], [578.0, 2822.8], [576.0, 3682.0], [580.0, 8101.0], [600.0, 7240.0], [602.0, 2724.5], [592.0, 6775.0], [606.0, 6693.0], [586.0, 6786.0], [584.0, 6944.0], [588.0, 8069.0], [590.0, 3421.0], [596.0, 3697.0], [594.0, 8270.0], [598.0, 4723.5], [610.0, 3143.2], [612.0, 4967.0], [608.0, 6624.0], [614.0, 4208.0], [618.0, 6631.0], [616.0, 6634.0], [620.0, 7062.0], [622.0, 7605.0], [624.0, 4630.5], [638.0, 3795.3333333333335], [636.0, 6659.0], [634.0, 7754.0], [632.0, 4423.5], [628.0, 5096.0], [630.0, 4724.0], [626.0, 7068.0], [642.0, 3761.0], [644.0, 1813.0], [640.0, 4437.5], [654.0, 4135.0], [646.0, 4480.0], [650.0, 3676.0], [648.0, 5007.5], [652.0, 4181.0], [656.0, 3870.0], [670.0, 3723.0], [666.0, 4495.5], [668.0, 3027.3333333333335], [664.0, 3733.666666666667], [658.0, 3390.2], [660.0, 7920.0], [662.0, 4672.0], [676.0, 4198.666666666667], [672.0, 2767.1111111111113], [686.0, 4594.0], [674.0, 4714.0], [678.0, 3612.666666666667], [688.0, 3851.0], [690.0, 4056.5], [700.0, 2347.0], [702.0, 3391.4], [696.0, 4076.0], [698.0, 7692.0], [694.0, 4010.333333333333], [692.0, 4199.5], [682.0, 3272.5], [680.0, 5557.333333333333], [684.0, 3916.333333333333], [710.0, 2819.333333333333], [716.0, 3648.2], [708.0, 3075.0], [706.0, 3849.666666666667], [704.0, 3511.666666666667], [732.0, 4738.0], [730.0, 6594.0], [728.0, 6406.0], [734.0, 6760.0], [712.0, 2539.444444444445], [714.0, 3524.666666666667], [718.0, 2875.5], [724.0, 6707.0], [722.0, 3781.666666666667], [720.0, 3868.666666666667], [762.0, 6624.0], [736.0, 4949.5], [750.0, 6601.0], [748.0, 6165.0], [746.0, 6285.0], [744.0, 7412.0], [758.0, 4818.0], [752.0, 6134.0], [754.0, 7366.5], [756.0, 6273.0], [764.0, 8632.0], [760.0, 6276.0], [742.0, 6125.0], [740.0, 6574.0], [738.0, 6084.0], [770.0, 6073.0], [792.0, 6526.0], [798.0, 6178.0], [794.0, 4506.0], [768.0, 4769.0], [772.0, 5942.0], [774.0, 9422.0], [782.0, 7219.0], [780.0, 6550.0], [778.0, 6541.0], [776.0, 7193.0], [784.0, 6030.0], [788.0, 6526.0], [790.0, 7209.0], [796.0, 6274.0], [814.0, 2840.0], [826.0, 5696.5], [808.0, 4479.5], [810.0, 6071.0], [812.0, 6476.0], [816.0, 5306.5], [830.0, 7158.0], [828.0, 3800.0], [824.0, 7030.0], [806.0, 7327.0], [804.0, 7100.0], [802.0, 7071.0], [800.0, 6519.0], [818.0, 3645.333333333333], [822.0, 2805.142857142857], [820.0, 2851.8333333333335], [836.0, 3729.5], [838.0, 2677.1428571428573], [832.0, 4101.333333333333], [846.0, 4488.25], [844.0, 5029.5], [834.0, 3289.5], [856.0, 7471.5], [858.0, 6138.0], [848.0, 7089.0], [862.0, 4542.666666666666], [860.0, 7734.0], [854.0, 6314.0], [852.0, 3581.25], [850.0, 4059.5], [840.0, 4951.333333333333], [864.0, 4404.5], [870.0, 3361.8], [878.0, 4620.0], [874.0, 3439.666666666667], [876.0, 4599.166666666667], [866.0, 7916.0], [868.0, 3920.0], [872.0, 3650.0], [888.0, 3458.0], [890.0, 7954.0], [892.0, 6251.0], [894.0, 3875.5], [880.0, 3516.666666666667], [882.0, 4436.0], [884.0, 3834.25], [886.0, 4840.5], [900.0, 4798.666666666667], [898.0, 6620.0], [896.0, 4024.0], [910.0, 3966.25], [902.0, 6059.0], [912.0, 4664.5], [926.0, 4444.0], [924.0, 4782.0], [920.0, 2346.0], [922.0, 3756.6666666666665], [914.0, 5327.0], [918.0, 5673.0], [904.0, 3597.0], [906.0, 4690.0], [908.0, 3509.333333333333], [932.0, 4014.3333333333335], [934.0, 5015.5], [940.0, 5289.5], [930.0, 5223.0], [928.0, 7030.0], [942.0, 5002.5], [952.0, 3971.0], [958.0, 4417.0], [956.0, 3423.25], [954.0, 8011.0], [944.0, 3324.25], [946.0, 3108.833333333333], [948.0, 3786.0], [950.0, 7182.0], [936.0, 3702.0], [938.0, 3798.25], [964.0, 5087.5], [960.0, 4041.333333333333], [974.0, 4979.0], [962.0, 6407.0], [966.0, 4640.666666666667], [984.0, 7424.0], [990.0, 3258.0], [976.0, 6356.0], [988.0, 5178.0], [986.0, 4893.0], [978.0, 5046.0], [980.0, 7711.0], [982.0, 4339.0], [972.0, 2964.857142857143], [970.0, 3755.833333333333], [968.0, 6488.0], [996.0, 3791.3333333333335], [1000.0, 4135.0], [998.0, 5115.5], [1016.0, 3943.3333333333335], [1022.0, 4759.5], [1020.0, 4637.333333333333], [1018.0, 4383.0], [1002.0, 3996.666666666667], [1006.0, 4827.5], [1004.0, 4811.0], [992.0, 5061.0], [994.0, 6202.0], [1010.0, 7012.0], [1012.0, 3258.0], [1014.0, 3607.333333333333], [1008.0, 3260.6666666666665], [1032.0, 7536.0], [1036.0, 2784.0], [1028.0, 3356.5], [1024.0, 4501.0], [1052.0, 6028.0], [1044.0, 6489.0], [1072.0, 4037.25], [1076.0, 7294.0], [1080.0, 4486.0], [1084.0, 3730.5], [1056.0, 3448.3333333333335], [1060.0, 4484.5], [1064.0, 4140.333333333333], [1068.0, 3497.3333333333335], [1096.0, 4853.5], [1088.0, 4011.2], [1092.0, 5218.0], [1116.0, 3700.25], [1108.0, 3738.0], [1112.0, 5705.0], [1100.0, 7018.0], [1140.0, 4488.5], [1148.0, 5391.0], [1144.0, 4478.0], [1136.0, 5411.0], [1120.0, 3602.0], [1124.0, 5935.5], [1128.0, 6342.0], [1132.0, 5595.0], [1104.0, 6327.0], [1152.0, 3121.909090909091], [1208.0, 4974.0], [1180.0, 5354.0], [1176.0, 5276.0], [1172.0, 6158.0], [1168.0, 6211.0], [1156.0, 3739.75], [1160.0, 3607.0], [1164.0, 3843.5], [1184.0, 5643.0], [1188.0, 5863.0], [1192.0, 5198.0], [1196.0, 5053.0], [1212.0, 5990.0], [1204.0, 5039.0], [1200.0, 5943.0], [1272.0, 5847.0], [1248.0, 5302.0], [1252.0, 5714.0], [1256.0, 5403.0], [1276.0, 5099.0], [1268.0, 6257.0], [1264.0, 5847.0], [1216.0, 4951.0], [1220.0, 5563.0], [1224.0, 5911.0], [1228.0, 4815.0], [1244.0, 4949.0], [1240.0, 5758.0], [1236.0, 5104.0], [1232.0, 5413.0], [1260.0, 5491.0], [1336.0, 5192.0], [1340.0, 5331.0], [1312.0, 5399.0], [1316.0, 5594.0], [1320.0, 4885.0], [1324.0, 4702.0], [1332.0, 4891.0], [1328.0, 4869.0], [1292.0, 5282.0], [1288.0, 4692.0], [1284.0, 5388.0], [1280.0, 5064.0], [1308.0, 5406.0], [1300.0, 6225.0], [1296.0, 5686.0], [1392.0, 4506.2], [1352.0, 5473.0], [1376.0, 4300.6], [1384.0, 3661.5], [1396.0, 4920.0], [1356.0, 5572.0], [1348.0, 4735.0], [1344.0, 5288.0], [1372.0, 4204.166666666667], [1368.0, 4384.0], [1364.0, 4697.0], [1360.0, 5776.0], [1388.0, 3684.0], [1380.0, 4068.0], [1400.0, 4938.0], [1404.0, 3942.0], [1408.0, 4360.5], [1412.0, 4167.0], [1432.0, 4195.0], [1436.0, 4403.5], [1428.0, 4032.5], [1424.0, 4120.0], [1416.0, 5075.0], [1420.0, 5695.0], [1456.0, 4268.0], [1460.0, 3877.0], [1464.0, 5537.0], [1468.0, 4800.5], [1440.0, 4077.5], [1448.0, 4770.0], [1452.0, 3860.0], [1472.0, 4798.333333333333], [1496.0, 4128.333333333333], [1492.0, 3665.0], [1500.0, 4707.666666666667], [1488.0, 4228.2], [1476.0, 3823.0], [1480.0, 4592.666666666667], [1484.0, 4548.5], [1520.0, 3504.0], [1528.0, 4850.5], [1532.0, 3964.0], [1504.0, 5267.0], [1508.0, 5179.0], [1512.0, 5855.0], [1516.0, 4883.0], [1544.0, 4400.0], [1536.0, 5199.0], [1540.0, 3660.0], [1564.0, 4396.0], [1560.0, 4502.6], [1548.0, 4413.0], [1584.0, 4219.333333333333], [1588.0, 5421.0], [1596.0, 4461.0], [1568.0, 4721.0], [1592.0, 5498.0], [1572.0, 5638.0], [1580.0, 4770.666666666667], [1576.0, 5444.0], [1556.0, 4270.6], [1552.0, 4371.0], [1604.0, 4135.0], [1600.0, 4749.0], [1628.0, 4133.0], [1624.0, 5340.0], [1620.0, 4780.0], [1616.0, 4986.0], [1608.0, 5407.0], [1612.0, 4862.0], [1648.0, 4533.0], [1632.0, 4521.5], [1636.0, 4810.25], [1640.0, 4990.333333333333], [1033.0, 4199.5], [1037.0, 4448.666666666667], [1029.0, 3475.833333333333], [1025.0, 4740.0], [1041.0, 6523.0], [1049.0, 6030.0], [1053.0, 6653.0], [1085.0, 3744.0], [1073.0, 3681.0], [1081.0, 6969.0], [1077.0, 7475.0], [1057.0, 4396.5], [1061.0, 4497.5], [1069.0, 4814.5], [1101.0, 4173.0], [1137.0, 3485.0], [1089.0, 3637.0], [1117.0, 4013.25], [1113.0, 3987.25], [1109.0, 3391.3333333333335], [1097.0, 6368.0], [1141.0, 5202.0], [1149.0, 3828.0], [1145.0, 4675.0], [1125.0, 6215.0], [1121.0, 5406.0], [1129.0, 6297.0], [1133.0, 6465.0], [1105.0, 5905.0], [1157.0, 2497.0], [1153.0, 3550.7142857142853], [1181.0, 5739.0], [1177.0, 5639.0], [1173.0, 5689.0], [1169.0, 5924.0], [1165.0, 3928.0], [1161.0, 5742.0], [1201.0, 5206.0], [1205.0, 5036.0], [1185.0, 5180.0], [1189.0, 5984.0], [1193.0, 6099.0], [1197.0, 5695.0], [1213.0, 5049.0], [1273.0, 5714.0], [1249.0, 5196.0], [1253.0, 4714.0], [1257.0, 5223.0], [1277.0, 4720.0], [1269.0, 5191.0], [1265.0, 4652.0], [1217.0, 5912.0], [1221.0, 5238.0], [1225.0, 4850.0], [1229.0, 5924.0], [1245.0, 5861.0], [1241.0, 5538.0], [1237.0, 5909.0], [1233.0, 5897.0], [1261.0, 5088.0], [1337.0, 6157.0], [1341.0, 4480.0], [1313.0, 5139.0], [1317.0, 5803.0], [1321.0, 4518.0], [1325.0, 4810.0], [1333.0, 4949.0], [1281.0, 5475.0], [1285.0, 4822.0], [1289.0, 4662.0], [1293.0, 5136.0], [1309.0, 5330.0], [1305.0, 5270.5], [1301.0, 5494.0], [1297.0, 4669.0], [1345.0, 5428.0], [1353.0, 5346.0], [1357.0, 5471.0], [1349.0, 4802.0], [1373.0, 4149.142857142857], [1369.0, 4294.0], [1365.0, 5620.0], [1361.0, 5460.0], [1389.0, 3942.777777777778], [1393.0, 4142.333333333333], [1385.0, 4578.4], [1381.0, 3744.0], [1377.0, 3882.714285714286], [1397.0, 5023.0], [1401.0, 5629.0], [1405.0, 4568.8], [1417.0, 6356.0], [1409.0, 4172.857142857142], [1437.0, 4421.0], [1433.0, 4776.0], [1429.0, 4677.333333333333], [1425.0, 4437.0], [1421.0, 4433.0], [1413.0, 4022.8], [1457.0, 3896.3333333333335], [1465.0, 4533.5], [1469.0, 4075.0], [1441.0, 3748.0], [1445.0, 5198.5], [1449.0, 4566.0], [1453.0, 5530.0], [1473.0, 4329.0], [1501.0, 3531.0], [1493.0, 5020.0], [1489.0, 4566.0], [1477.0, 4877.5], [1481.0, 4315.0], [1485.0, 4602.0], [1521.0, 4644.0], [1525.0, 5035.0], [1533.0, 4094.5], [1505.0, 4840.0], [1529.0, 4542.0], [1509.0, 5262.0], [1513.0, 4904.0], [1517.0, 4677.0], [1549.0, 4634.0], [1545.0, 4631.0], [1537.0, 5004.0], [1541.0, 4398.0], [1565.0, 5006.5], [1561.0, 4053.6666666666665], [1585.0, 4459.0], [1589.0, 4462.833333333334], [1597.0, 4449.333333333333], [1593.0, 4483.0], [1569.0, 4906.0], [1573.0, 5618.0], [1581.0, 4302.0], [1577.0, 4895.5], [1553.0, 4423.0], [1557.0, 4227.8], [1601.0, 4097.0], [1605.0, 4750.5], [1629.0, 4911.0], [1621.0, 4961.0], [1625.0, 4528.0], [1617.0, 4566.625], [1613.0, 4526.666666666667], [1649.0, 5081.2], [1633.0, 5338.0], [1641.0, 4463.0], [1645.0, 5157.5], [1637.0, 4761.0], [527.0, 7395.0], [539.0, 8208.0], [543.0, 6970.0], [521.0, 6206.0], [523.0, 7221.0], [525.0, 8549.0], [513.0, 8178.0], [515.0, 7222.0], [535.0, 3306.0], [533.0, 3967.333333333333], [531.0, 7280.0], [529.0, 6221.0], [537.0, 8065.0], [519.0, 7097.0], [517.0, 7028.0], [541.0, 8137.0], [551.0, 8178.0], [545.0, 3521.3333333333335], [547.0, 4853.5], [549.0, 7547.0], [569.0, 7927.0], [571.0, 6791.0], [573.0, 7002.0], [575.0, 8105.0], [565.0, 7800.5], [563.0, 6871.0], [561.0, 6992.0], [567.0, 6926.0], [553.0, 6960.0], [557.0, 4889.5], [555.0, 6975.0], [559.0, 7000.0], [581.0, 7879.0], [577.0, 7520.0], [583.0, 5169.5], [579.0, 7810.0], [601.0, 8077.0], [603.0, 2498.666666666667], [605.0, 2823.2], [607.0, 4140.5], [587.0, 4864.5], [585.0, 6876.0], [589.0, 7846.0], [591.0, 4624.5], [593.0, 3018.5], [595.0, 7300.0], [597.0, 7222.0], [599.0, 3377.333333333333], [611.0, 4718.0], [633.0, 3444.0], [609.0, 3605.6666666666665], [613.0, 4653.0], [619.0, 3418.333333333333], [617.0, 6823.0], [621.0, 7388.0], [623.0, 7960.0], [637.0, 7899.0], [635.0, 7691.0], [639.0, 4474.5], [615.0, 6937.0], [625.0, 4760.5], [629.0, 7264.0], [631.0, 5056.0], [627.0, 4407.0], [643.0, 7297.0], [665.0, 4434.5], [641.0, 3497.333333333333], [655.0, 7782.0], [653.0, 4413.0], [645.0, 4690.0], [649.0, 4378.0], [651.0, 4643.0], [657.0, 3429.0], [671.0, 4173.0], [669.0, 3464.0], [667.0, 3181.2857142857147], [647.0, 4928.5], [659.0, 3522.0], [661.0, 4507.0], [663.0, 4849.5], [677.0, 3363.0], [679.0, 2457.5], [673.0, 3231.8], [687.0, 3404.75], [675.0, 3382.666666666667], [689.0, 3803.0], [703.0, 4535.5], [701.0, 3865.75], [697.0, 3844.333333333333], [699.0, 3617.5], [691.0, 3744.0], [693.0, 3509.666666666667], [695.0, 3619.0], [681.0, 3974.666666666667], [683.0, 3803.666666666667], [685.0, 3216.6], [711.0, 4808.0], [709.0, 3571.666666666667], [707.0, 4710.5], [705.0, 3247.25], [731.0, 6459.0], [729.0, 7680.0], [733.0, 7477.0], [735.0, 4750.0], [713.0, 3344.25], [715.0, 3210.4], [717.0, 3861.0], [719.0, 3534.0], [721.0, 4372.0], [723.0, 4612.0], [727.0, 6612.0], [725.0, 6346.0], [765.0, 4207.5], [763.0, 6652.0], [751.0, 6720.0], [749.0, 6509.0], [747.0, 7343.0], [745.0, 6751.0], [759.0, 6361.0], [767.0, 6391.5], [755.0, 6616.0], [757.0, 7001.0], [761.0, 6313.0], [743.0, 7306.0], [741.0, 6441.0], [739.0, 7313.0], [737.0, 6148.0], [771.0, 8991.0], [769.0, 6586.0], [773.0, 7384.0], [775.0, 5889.0], [783.0, 6600.0], [781.0, 7425.0], [779.0, 6183.0], [777.0, 6301.0], [799.0, 5890.0], [787.0, 6247.5], [785.0, 8451.0], [789.0, 6277.0], [791.0, 6334.0], [797.0, 7049.0], [795.0, 7044.0], [793.0, 6345.0], [815.0, 3011.5], [809.0, 7090.0], [811.0, 6164.0], [813.0, 4197.5], [817.0, 3204.6666666666665], [831.0, 4200.0], [827.0, 7273.0], [829.0, 4503.5], [825.0, 5570.5], [805.0, 6220.0], [803.0, 6301.0], [801.0, 6027.0], [819.0, 3226.0], [821.0, 2773.5], [823.0, 3915.666666666667], [835.0, 6425.0], [833.0, 3718.333333333333], [847.0, 2162.0], [843.0, 6765.0], [845.0, 2416.0], [837.0, 3289.1666666666665], [839.0, 2876.0], [857.0, 7139.0], [849.0, 3902.0], [863.0, 4121.5], [861.0, 5832.0], [859.0, 4004.0], [851.0, 4496.5], [853.0, 4554.0], [841.0, 3163.0], [867.0, 3544.0], [865.0, 5533.0], [879.0, 5815.5], [877.0, 3468.0], [871.0, 3469.4], [889.0, 5001.0], [891.0, 5785.0], [895.0, 7148.0], [893.0, 4377.5], [881.0, 3928.0], [883.0, 6066.0], [887.0, 4350.5], [885.0, 4238.5], [869.0, 3815.25], [873.0, 5297.0], [901.0, 4223.5], [903.0, 4439.0], [911.0, 4358.666666666667], [909.0, 4372.0], [899.0, 3642.8], [925.0, 5126.0], [927.0, 3926.5], [923.0, 4168.0], [921.0, 6445.5], [913.0, 2598.3333333333335], [917.0, 5868.0], [915.0, 7329.0], [919.0, 6741.0], [905.0, 6897.0], [907.0, 4972.5], [933.0, 4856.333333333333], [931.0, 4134.0], [929.0, 5162.0], [941.0, 8067.0], [943.0, 4978.0], [935.0, 5226.0], [957.0, 3257.1111111111113], [959.0, 7103.0], [955.0, 5966.0], [953.0, 6820.0], [945.0, 3713.3333333333335], [947.0, 3642.0], [951.0, 5044.5], [949.0, 7014.0], [937.0, 4883.5], [939.0, 4465.0], [965.0, 2698.0], [985.0, 3435.6666666666665], [961.0, 3715.0], [975.0, 6096.0], [973.0, 5105.0], [963.0, 6544.0], [967.0, 5734.0], [991.0, 4533.333333333333], [989.0, 3101.8], [987.0, 5882.0], [977.0, 3744.5], [979.0, 3487.6666666666665], [981.0, 6147.0], [983.0, 4090.5], [971.0, 3742.5], [969.0, 5139.5], [999.0, 6087.0], [997.0, 3939.0], [995.0, 5490.5], [1001.0, 7073.0], [1019.0, 4122.0], [1023.0, 4178.5], [1021.0, 4785.5], [1017.0, 5653.0], [1005.0, 7584.0], [1003.0, 7663.0], [1007.0, 6049.0], [993.0, 7846.0], [1009.0, 3247.3333333333335], [1011.0, 4855.0], [1013.0, 5612.0], [1015.0, 4644.0], [1030.0, 3735.3333333333335], [1034.0, 4775.0], [1050.0, 4077.0], [1054.0, 3627.4285714285716], [1026.0, 4582.0], [1042.0, 4587.0], [1046.0, 6969.5], [1038.0, 4714.0], [1074.0, 3922.3333333333335], [1078.0, 3415.0], [1082.0, 6878.0], [1086.0, 3910.4], [1058.0, 6085.0], [1062.0, 5821.0], [1066.0, 4989.0], [1070.0, 4125.333333333333], [1098.0, 6332.0], [1102.0, 4062.0], [1118.0, 3143.0], [1090.0, 6415.0], [1114.0, 4012.6666666666665], [1110.0, 4464.25], [1094.0, 4614.25], [1142.0, 4031.0], [1150.0, 3457.727272727273], [1146.0, 4701.5], [1138.0, 5727.0], [1134.0, 3488.0], [1126.0, 3558.0], [1122.0, 6164.0], [1130.0, 4370.0], [1106.0, 4035.666666666667], [1158.0, 5172.666666666667], [1182.0, 6263.0], [1178.0, 5528.0], [1174.0, 5171.0], [1170.0, 6431.0], [1154.0, 3706.3333333333335], [1214.0, 6701.0], [1186.0, 5361.0], [1190.0, 4188.0], [1194.0, 6856.0], [1198.0, 6201.0], [1210.0, 5671.5], [1206.0, 5468.0], [1202.0, 5356.0], [1166.0, 6217.0], [1274.0, 5080.0], [1278.0, 5475.0], [1250.0, 5034.0], [1254.0, 5600.0], [1258.0, 5353.0], [1270.0, 4896.0], [1266.0, 5548.0], [1246.0, 4919.0], [1218.0, 6112.0], [1222.0, 5343.0], [1230.0, 4967.0], [1242.0, 5610.0], [1238.0, 5386.0], [1234.0, 5558.0], [1262.0, 5226.0], [1342.0, 5122.0], [1314.0, 5301.0], [1318.0, 5597.0], [1322.0, 5763.0], [1326.0, 4795.0], [1334.0, 5227.0], [1330.0, 4601.0], [1294.0, 4867.0], [1290.0, 4812.0], [1286.0, 5901.0], [1282.0, 4809.0], [1310.0, 5585.0], [1306.0, 5274.0], [1302.0, 4882.0], [1298.0, 4572.0], [1346.0, 4711.0], [1374.0, 4494.4], [1358.0, 4921.0], [1354.0, 4473.0], [1350.0, 5076.0], [1370.0, 4802.5], [1366.0, 5001.0], [1362.0, 6015.0], [1390.0, 4073.5], [1394.0, 3989.25], [1386.0, 4031.2], [1382.0, 4422.8], [1378.0, 4158.2], [1398.0, 3864.75], [1402.0, 5145.0], [1406.0, 4200.0], [1410.0, 4372.0], [1430.0, 4336.0], [1434.0, 5669.0], [1426.0, 3931.3333333333335], [1418.0, 5622.0], [1414.0, 5023.0], [1422.0, 4501.0], [1458.0, 4813.0], [1462.0, 4341.0], [1466.0, 4005.0], [1470.0, 4828.0], [1442.0, 5298.5], [1446.0, 4052.0], [1450.0, 4441.0], [1454.0, 4054.0], [1478.0, 4634.0], [1482.0, 4163.6], [1502.0, 5703.0], [1494.0, 6021.0], [1498.0, 5003.0], [1490.0, 4073.0], [1474.0, 3720.0], [1486.0, 4702.5], [1522.0, 4868.0], [1526.0, 5001.0], [1530.0, 4361.6], [1506.0, 4789.0], [1534.0, 4716.0], [1510.0, 4426.5], [1514.0, 5583.0], [1518.0, 4513.0], [1546.0, 4612.0], [1542.0, 4632.0], [1538.0, 5755.0], [1566.0, 4590.0], [1562.0, 5165.0], [1558.0, 4322.857142857143], [1550.0, 4740.0], [1598.0, 4668.25], [1594.0, 4666.333333333333], [1590.0, 4907.0], [1586.0, 4569.333333333333], [1570.0, 4064.6666666666665], [1574.0, 5057.0], [1582.0, 4407.75], [1578.0, 4582.5], [1602.0, 4666.0], [1606.0, 4768.5], [1630.0, 4591.111111111111], [1622.0, 4835.5], [1626.0, 4671.666666666667], [1618.0, 4644.0], [1610.0, 4875.0], [1614.0, 4509.75], [1650.0, 5261.0], [1634.0, 5162.0], [1638.0, 4684.333333333333], [1642.0, 4712.0], [1646.0, 4778.0], [1035.0, 4873.0], [1039.0, 5869.0], [1027.0, 3376.0], [1055.0, 4448.0], [1047.0, 4491.666666666667], [1043.0, 4283.0], [1051.0, 5340.0], [1031.0, 4039.0], [1083.0, 4128.0], [1087.0, 3569.833333333333], [1079.0, 4297.0], [1075.0, 6408.0], [1059.0, 4068.0], [1063.0, 4688.5], [1067.0, 6382.0], [1071.0, 3633.5], [1095.0, 4484.0], [1119.0, 3847.25], [1091.0, 5178.0], [1115.0, 4755.0], [1111.0, 4998.0], [1099.0, 6188.0], [1103.0, 5605.0], [1139.0, 4150.333333333333], [1147.0, 4540.5], [1151.0, 3699.5], [1143.0, 5063.0], [1127.0, 3925.0], [1131.0, 6051.0], [1135.0, 4476.333333333333], [1107.0, 3617.5714285714284], [1159.0, 3702.285714285714], [1207.0, 5992.0], [1155.0, 3867.8], [1183.0, 6497.0], [1179.0, 5268.0], [1175.0, 5527.0], [1171.0, 5216.0], [1163.0, 5353.5], [1167.0, 6326.0], [1203.0, 5182.0], [1215.0, 5384.0], [1187.0, 6875.0], [1191.0, 5269.0], [1195.0, 5043.0], [1199.0, 4015.0], [1211.0, 5167.0], [1275.0, 4747.0], [1279.0, 5123.0], [1251.0, 5959.0], [1255.0, 5205.0], [1259.0, 4708.0], [1271.0, 5343.0], [1267.0, 5716.0], [1247.0, 5581.0], [1223.0, 5465.0], [1227.0, 5275.5], [1231.0, 5551.0], [1243.0, 5479.0], [1239.0, 5455.0], [1235.0, 5832.0], [1263.0, 5222.0], [1339.0, 4842.5], [1343.0, 5000.0], [1315.0, 5827.0], [1319.0, 5334.0], [1323.0, 6347.0], [1327.0, 4700.0], [1335.0, 5028.0], [1331.0, 5686.0], [1311.0, 5714.0], [1283.0, 5062.0], [1287.0, 5463.0], [1291.0, 5053.0], [1295.0, 4941.0], [1307.0, 5861.0], [1303.0, 5094.0], [1299.0, 4950.0], [1347.0, 5333.0], [1375.0, 4184.5], [1359.0, 5235.0], [1355.0, 5561.0], [1351.0, 5534.0], [1371.0, 3562.333333333333], [1367.0, 4772.0], [1363.0, 6061.0], [1391.0, 3636.0], [1395.0, 4186.75], [1387.0, 3846.8888888888887], [1383.0, 4533.142857142858], [1379.0, 4328.5], [1399.0, 5510.0], [1403.0, 4483.0], [1407.0, 4766.5], [1411.0, 5760.0], [1439.0, 5253.333333333333], [1431.0, 4419.0], [1435.0, 4737.0], [1427.0, 4506.5], [1415.0, 4747.0], [1419.0, 4973.0], [1423.0, 4180.0], [1459.0, 5299.5], [1463.0, 3636.0], [1467.0, 3999.0], [1471.0, 4599.666666666667], [1443.0, 4189.0], [1447.0, 5324.0], [1451.0, 4116.0], [1455.0, 3934.8], [1479.0, 4221.5], [1491.0, 4908.0], [1499.0, 5302.0], [1475.0, 5036.0], [1483.0, 3949.3333333333335], [1487.0, 4641.5], [1523.0, 4450.333333333333], [1531.0, 4510.0], [1535.0, 4333.666666666667], [1527.0, 4943.5], [1507.0, 4472.0], [1511.0, 4357.0], [1515.0, 4378.5], [1519.0, 3687.0], [1547.0, 5144.0], [1543.0, 4261.75], [1567.0, 4637.0], [1539.0, 4488.0], [1563.0, 4295.5], [1559.0, 4683.4], [1551.0, 4466.5], [1587.0, 4072.75], [1591.0, 5118.0], [1595.0, 4398.8], [1599.0, 4680.5], [1571.0, 4582.0], [1575.0, 4531.0], [1579.0, 4774.5], [1583.0, 4444.0], [1555.0, 3961.0], [1603.0, 4728.0], [1627.0, 4753.0], [1631.0, 4807.400000000001], [1623.0, 4801.0], [1619.0, 5001.0], [1607.0, 4200.25], [1611.0, 4468.5], [1615.0, 4604.428571428572], [1639.0, 4733.0], [1643.0, 5268.0], [1647.0, 4798.4], [1635.0, 4503.0], [1.0, 7531.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[924.7689999999985, 4972.483999999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1650.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12600.0, "minX": 1.54960842E12, "maxY": 21048.183333333334, "series": [{"data": [[1.54960842E12, 21048.183333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960842E12, 12600.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 4972.483999999999, "minX": 1.54960842E12, "maxY": 4972.483999999999, "series": [{"data": [[1.54960842E12, 4972.483999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960842E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 4972.478, "minX": 1.54960842E12, "maxY": 4972.478, "series": [{"data": [[1.54960842E12, 4972.478]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960842E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 81.90966666666668, "minX": 1.54960842E12, "maxY": 81.90966666666668, "series": [{"data": [[1.54960842E12, 81.90966666666668]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960842E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 342.0, "minX": 1.54960842E12, "maxY": 9631.0, "series": [{"data": [[1.54960842E12, 9631.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960842E12, 342.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960842E12, 7844.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960842E12, 9022.99]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960842E12, 8194.849999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4880.0, "minX": 50.0, "maxY": 4880.0, "series": [{"data": [[50.0, 4880.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4880.0, "minX": 50.0, "maxY": 4880.0, "series": [{"data": [[50.0, 4880.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960842E12, "maxY": 50.0, "series": [{"data": [[1.54960842E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960842E12, "maxY": 50.0, "series": [{"data": [[1.54960842E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960842E12, "maxY": 50.0, "series": [{"data": [[1.54960842E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960842E12, "title": "Transactions Per Second"}},
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
