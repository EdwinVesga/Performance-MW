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
        data: {"result": {"minY": 195.0, "minX": 0.0, "maxY": 11115.0, "series": [{"data": [[0.0, 195.0], [0.1, 230.0], [0.2, 269.0], [0.3, 282.0], [0.4, 309.0], [0.5, 321.0], [0.6, 339.0], [0.7, 348.0], [0.8, 349.0], [0.9, 362.0], [1.0, 367.0], [1.1, 381.0], [1.2, 387.0], [1.3, 390.0], [1.4, 399.0], [1.5, 412.0], [1.6, 449.0], [1.7, 461.0], [1.8, 475.0], [1.9, 486.0], [2.0, 503.0], [2.1, 509.0], [2.2, 517.0], [2.3, 540.0], [2.4, 563.0], [2.5, 590.0], [2.6, 635.0], [2.7, 656.0], [2.8, 700.0], [2.9, 784.0], [3.0, 1013.0], [3.1, 1034.0], [3.2, 1053.0], [3.3, 1070.0], [3.4, 1082.0], [3.5, 1105.0], [3.6, 1115.0], [3.7, 1135.0], [3.8, 1150.0], [3.9, 1156.0], [4.0, 1167.0], [4.1, 1175.0], [4.2, 1189.0], [4.3, 1200.0], [4.4, 1228.0], [4.5, 1246.0], [4.6, 1253.0], [4.7, 1263.0], [4.8, 1277.0], [4.9, 1302.0], [5.0, 1332.0], [5.1, 1361.0], [5.2, 1380.0], [5.3, 1395.0], [5.4, 1411.0], [5.5, 1425.0], [5.6, 1442.0], [5.7, 1462.0], [5.8, 1478.0], [5.9, 1508.0], [6.0, 1517.0], [6.1, 1556.0], [6.2, 1565.0], [6.3, 1570.0], [6.4, 1594.0], [6.5, 1614.0], [6.6, 1634.0], [6.7, 1660.0], [6.8, 1681.0], [6.9, 1685.0], [7.0, 1690.0], [7.1, 1700.0], [7.2, 1723.0], [7.3, 1739.0], [7.4, 1744.0], [7.5, 1766.0], [7.6, 1786.0], [7.7, 1800.0], [7.8, 1808.0], [7.9, 1818.0], [8.0, 1821.0], [8.1, 1827.0], [8.2, 1836.0], [8.3, 1851.0], [8.4, 1862.0], [8.5, 1874.0], [8.6, 1881.0], [8.7, 1889.0], [8.8, 1897.0], [8.9, 1905.0], [9.0, 1912.0], [9.1, 1917.0], [9.2, 1928.0], [9.3, 1944.0], [9.4, 1949.0], [9.5, 1956.0], [9.6, 1973.0], [9.7, 1980.0], [9.8, 1990.0], [9.9, 2001.0], [10.0, 2006.0], [10.1, 2011.0], [10.2, 2013.0], [10.3, 2018.0], [10.4, 2022.0], [10.5, 2035.0], [10.6, 2039.0], [10.7, 2055.0], [10.8, 2058.0], [10.9, 2060.0], [11.0, 2065.0], [11.1, 2070.0], [11.2, 2073.0], [11.3, 2084.0], [11.4, 2091.0], [11.5, 2092.0], [11.6, 2101.0], [11.7, 2105.0], [11.8, 2117.0], [11.9, 2122.0], [12.0, 2133.0], [12.1, 2143.0], [12.2, 2147.0], [12.3, 2157.0], [12.4, 2164.0], [12.5, 2171.0], [12.6, 2174.0], [12.7, 2190.0], [12.8, 2199.0], [12.9, 2209.0], [13.0, 2226.0], [13.1, 2232.0], [13.2, 2241.0], [13.3, 2251.0], [13.4, 2265.0], [13.5, 2272.0], [13.6, 2280.0], [13.7, 2287.0], [13.8, 2294.0], [13.9, 2300.0], [14.0, 2302.0], [14.1, 2316.0], [14.2, 2320.0], [14.3, 2334.0], [14.4, 2347.0], [14.5, 2353.0], [14.6, 2359.0], [14.7, 2374.0], [14.8, 2381.0], [14.9, 2401.0], [15.0, 2408.0], [15.1, 2412.0], [15.2, 2430.0], [15.3, 2446.0], [15.4, 2456.0], [15.5, 2476.0], [15.6, 2501.0], [15.7, 2513.0], [15.8, 2529.0], [15.9, 2541.0], [16.0, 2546.0], [16.1, 2559.0], [16.2, 2565.0], [16.3, 2574.0], [16.4, 2580.0], [16.5, 2592.0], [16.6, 2606.0], [16.7, 2622.0], [16.8, 2633.0], [16.9, 2638.0], [17.0, 2640.0], [17.1, 2649.0], [17.2, 2653.0], [17.3, 2666.0], [17.4, 2668.0], [17.5, 2674.0], [17.6, 2679.0], [17.7, 2699.0], [17.8, 2702.0], [17.9, 2708.0], [18.0, 2716.0], [18.1, 2722.0], [18.2, 2727.0], [18.3, 2735.0], [18.4, 2741.0], [18.5, 2747.0], [18.6, 2758.0], [18.7, 2764.0], [18.8, 2768.0], [18.9, 2773.0], [19.0, 2779.0], [19.1, 2790.0], [19.2, 2799.0], [19.3, 2803.0], [19.4, 2813.0], [19.5, 2817.0], [19.6, 2832.0], [19.7, 2837.0], [19.8, 2840.0], [19.9, 2842.0], [20.0, 2849.0], [20.1, 2853.0], [20.2, 2855.0], [20.3, 2859.0], [20.4, 2865.0], [20.5, 2874.0], [20.6, 2890.0], [20.7, 2897.0], [20.8, 2902.0], [20.9, 2905.0], [21.0, 2916.0], [21.1, 2937.0], [21.2, 2949.0], [21.3, 2958.0], [21.4, 2965.0], [21.5, 2971.0], [21.6, 2977.0], [21.7, 2981.0], [21.8, 2986.0], [21.9, 2993.0], [22.0, 2999.0], [22.1, 3004.0], [22.2, 3006.0], [22.3, 3014.0], [22.4, 3018.0], [22.5, 3023.0], [22.6, 3031.0], [22.7, 3044.0], [22.8, 3061.0], [22.9, 3068.0], [23.0, 3076.0], [23.1, 3087.0], [23.2, 3093.0], [23.3, 3102.0], [23.4, 3112.0], [23.5, 3128.0], [23.6, 3136.0], [23.7, 3146.0], [23.8, 3160.0], [23.9, 3167.0], [24.0, 3168.0], [24.1, 3181.0], [24.2, 3187.0], [24.3, 3203.0], [24.4, 3213.0], [24.5, 3221.0], [24.6, 3234.0], [24.7, 3238.0], [24.8, 3260.0], [24.9, 3272.0], [25.0, 3281.0], [25.1, 3287.0], [25.2, 3305.0], [25.3, 3308.0], [25.4, 3319.0], [25.5, 3323.0], [25.6, 3329.0], [25.7, 3343.0], [25.8, 3356.0], [25.9, 3361.0], [26.0, 3372.0], [26.1, 3381.0], [26.2, 3386.0], [26.3, 3395.0], [26.4, 3413.0], [26.5, 3420.0], [26.6, 3421.0], [26.7, 3438.0], [26.8, 3449.0], [26.9, 3456.0], [27.0, 3469.0], [27.1, 3474.0], [27.2, 3481.0], [27.3, 3493.0], [27.4, 3499.0], [27.5, 3517.0], [27.6, 3537.0], [27.7, 3562.0], [27.8, 3578.0], [27.9, 3607.0], [28.0, 3609.0], [28.1, 3611.0], [28.2, 3619.0], [28.3, 3634.0], [28.4, 3655.0], [28.5, 3661.0], [28.6, 3665.0], [28.7, 3677.0], [28.8, 3692.0], [28.9, 3710.0], [29.0, 3734.0], [29.1, 3758.0], [29.2, 3764.0], [29.3, 3769.0], [29.4, 3782.0], [29.5, 3795.0], [29.6, 3804.0], [29.7, 3824.0], [29.8, 3851.0], [29.9, 3857.0], [30.0, 3868.0], [30.1, 3874.0], [30.2, 3885.0], [30.3, 3897.0], [30.4, 3915.0], [30.5, 3924.0], [30.6, 3945.0], [30.7, 3952.0], [30.8, 3956.0], [30.9, 3967.0], [31.0, 3989.0], [31.1, 3998.0], [31.2, 4021.0], [31.3, 4033.0], [31.4, 4060.0], [31.5, 4066.0], [31.6, 4073.0], [31.7, 4075.0], [31.8, 4081.0], [31.9, 4091.0], [32.0, 4108.0], [32.1, 4114.0], [32.2, 4120.0], [32.3, 4129.0], [32.4, 4146.0], [32.5, 4158.0], [32.6, 4164.0], [32.7, 4170.0], [32.8, 4185.0], [32.9, 4189.0], [33.0, 4200.0], [33.1, 4207.0], [33.2, 4215.0], [33.3, 4218.0], [33.4, 4223.0], [33.5, 4231.0], [33.6, 4236.0], [33.7, 4243.0], [33.8, 4248.0], [33.9, 4265.0], [34.0, 4270.0], [34.1, 4274.0], [34.2, 4278.0], [34.3, 4284.0], [34.4, 4290.0], [34.5, 4302.0], [34.6, 4315.0], [34.7, 4330.0], [34.8, 4335.0], [34.9, 4336.0], [35.0, 4344.0], [35.1, 4358.0], [35.2, 4368.0], [35.3, 4371.0], [35.4, 4379.0], [35.5, 4384.0], [35.6, 4391.0], [35.7, 4404.0], [35.8, 4423.0], [35.9, 4425.0], [36.0, 4438.0], [36.1, 4446.0], [36.2, 4473.0], [36.3, 4488.0], [36.4, 4491.0], [36.5, 4502.0], [36.6, 4510.0], [36.7, 4532.0], [36.8, 4542.0], [36.9, 4557.0], [37.0, 4580.0], [37.1, 4604.0], [37.2, 4612.0], [37.3, 4630.0], [37.4, 4642.0], [37.5, 4664.0], [37.6, 4672.0], [37.7, 4676.0], [37.8, 4685.0], [37.9, 4694.0], [38.0, 4700.0], [38.1, 4706.0], [38.2, 4718.0], [38.3, 4727.0], [38.4, 4733.0], [38.5, 4746.0], [38.6, 4766.0], [38.7, 4775.0], [38.8, 4795.0], [38.9, 4805.0], [39.0, 4814.0], [39.1, 4823.0], [39.2, 4835.0], [39.3, 4840.0], [39.4, 4843.0], [39.5, 4847.0], [39.6, 4857.0], [39.7, 4867.0], [39.8, 4875.0], [39.9, 4886.0], [40.0, 4895.0], [40.1, 4913.0], [40.2, 4915.0], [40.3, 4926.0], [40.4, 4929.0], [40.5, 4936.0], [40.6, 4941.0], [40.7, 4952.0], [40.8, 4965.0], [40.9, 4977.0], [41.0, 4983.0], [41.1, 4985.0], [41.2, 4989.0], [41.3, 4997.0], [41.4, 5002.0], [41.5, 5009.0], [41.6, 5015.0], [41.7, 5027.0], [41.8, 5035.0], [41.9, 5041.0], [42.0, 5046.0], [42.1, 5055.0], [42.2, 5062.0], [42.3, 5067.0], [42.4, 5077.0], [42.5, 5082.0], [42.6, 5085.0], [42.7, 5094.0], [42.8, 5104.0], [42.9, 5107.0], [43.0, 5108.0], [43.1, 5112.0], [43.2, 5119.0], [43.3, 5123.0], [43.4, 5128.0], [43.5, 5130.0], [43.6, 5144.0], [43.7, 5156.0], [43.8, 5163.0], [43.9, 5167.0], [44.0, 5178.0], [44.1, 5183.0], [44.2, 5192.0], [44.3, 5206.0], [44.4, 5214.0], [44.5, 5215.0], [44.6, 5230.0], [44.7, 5243.0], [44.8, 5247.0], [44.9, 5253.0], [45.0, 5260.0], [45.1, 5266.0], [45.2, 5270.0], [45.3, 5279.0], [45.4, 5282.0], [45.5, 5295.0], [45.6, 5306.0], [45.7, 5314.0], [45.8, 5324.0], [45.9, 5337.0], [46.0, 5341.0], [46.1, 5349.0], [46.2, 5363.0], [46.3, 5368.0], [46.4, 5376.0], [46.5, 5386.0], [46.6, 5399.0], [46.7, 5413.0], [46.8, 5420.0], [46.9, 5429.0], [47.0, 5441.0], [47.1, 5447.0], [47.2, 5459.0], [47.3, 5479.0], [47.4, 5482.0], [47.5, 5490.0], [47.6, 5499.0], [47.7, 5517.0], [47.8, 5519.0], [47.9, 5526.0], [48.0, 5531.0], [48.1, 5537.0], [48.2, 5547.0], [48.3, 5556.0], [48.4, 5576.0], [48.5, 5580.0], [48.6, 5591.0], [48.7, 5602.0], [48.8, 5608.0], [48.9, 5618.0], [49.0, 5622.0], [49.1, 5628.0], [49.2, 5636.0], [49.3, 5643.0], [49.4, 5652.0], [49.5, 5663.0], [49.6, 5673.0], [49.7, 5682.0], [49.8, 5683.0], [49.9, 5689.0], [50.0, 5695.0], [50.1, 5702.0], [50.2, 5715.0], [50.3, 5720.0], [50.4, 5728.0], [50.5, 5739.0], [50.6, 5750.0], [50.7, 5758.0], [50.8, 5778.0], [50.9, 5796.0], [51.0, 5804.0], [51.1, 5817.0], [51.2, 5828.0], [51.3, 5832.0], [51.4, 5840.0], [51.5, 5850.0], [51.6, 5861.0], [51.7, 5879.0], [51.8, 5892.0], [51.9, 5901.0], [52.0, 5913.0], [52.1, 5926.0], [52.2, 5944.0], [52.3, 5954.0], [52.4, 5964.0], [52.5, 5972.0], [52.6, 5979.0], [52.7, 5984.0], [52.8, 6002.0], [52.9, 6016.0], [53.0, 6041.0], [53.1, 6049.0], [53.2, 6076.0], [53.3, 6084.0], [53.4, 6099.0], [53.5, 6111.0], [53.6, 6125.0], [53.7, 6134.0], [53.8, 6152.0], [53.9, 6158.0], [54.0, 6175.0], [54.1, 6186.0], [54.2, 6197.0], [54.3, 6228.0], [54.4, 6245.0], [54.5, 6249.0], [54.6, 6251.0], [54.7, 6256.0], [54.8, 6271.0], [54.9, 6275.0], [55.0, 6279.0], [55.1, 6281.0], [55.2, 6288.0], [55.3, 6296.0], [55.4, 6303.0], [55.5, 6307.0], [55.6, 6322.0], [55.7, 6331.0], [55.8, 6333.0], [55.9, 6345.0], [56.0, 6354.0], [56.1, 6358.0], [56.2, 6364.0], [56.3, 6368.0], [56.4, 6378.0], [56.5, 6388.0], [56.6, 6399.0], [56.7, 6406.0], [56.8, 6407.0], [56.9, 6413.0], [57.0, 6427.0], [57.1, 6428.0], [57.2, 6434.0], [57.3, 6435.0], [57.4, 6443.0], [57.5, 6454.0], [57.6, 6468.0], [57.7, 6475.0], [57.8, 6480.0], [57.9, 6484.0], [58.0, 6493.0], [58.1, 6499.0], [58.2, 6504.0], [58.3, 6506.0], [58.4, 6516.0], [58.5, 6525.0], [58.6, 6531.0], [58.7, 6539.0], [58.8, 6549.0], [58.9, 6559.0], [59.0, 6562.0], [59.1, 6584.0], [59.2, 6586.0], [59.3, 6592.0], [59.4, 6601.0], [59.5, 6603.0], [59.6, 6608.0], [59.7, 6612.0], [59.8, 6617.0], [59.9, 6622.0], [60.0, 6629.0], [60.1, 6630.0], [60.2, 6637.0], [60.3, 6655.0], [60.4, 6668.0], [60.5, 6671.0], [60.6, 6688.0], [60.7, 6712.0], [60.8, 6723.0], [60.9, 6732.0], [61.0, 6741.0], [61.1, 6755.0], [61.2, 6757.0], [61.3, 6763.0], [61.4, 6773.0], [61.5, 6781.0], [61.6, 6795.0], [61.7, 6805.0], [61.8, 6809.0], [61.9, 6816.0], [62.0, 6823.0], [62.1, 6827.0], [62.2, 6830.0], [62.3, 6833.0], [62.4, 6837.0], [62.5, 6849.0], [62.6, 6855.0], [62.7, 6859.0], [62.8, 6869.0], [62.9, 6877.0], [63.0, 6885.0], [63.1, 6894.0], [63.2, 6900.0], [63.3, 6919.0], [63.4, 6935.0], [63.5, 6942.0], [63.6, 6962.0], [63.7, 6972.0], [63.8, 6977.0], [63.9, 6992.0], [64.0, 7002.0], [64.1, 7008.0], [64.2, 7011.0], [64.3, 7022.0], [64.4, 7029.0], [64.5, 7041.0], [64.6, 7047.0], [64.7, 7056.0], [64.8, 7066.0], [64.9, 7075.0], [65.0, 7078.0], [65.1, 7084.0], [65.2, 7098.0], [65.3, 7113.0], [65.4, 7123.0], [65.5, 7132.0], [65.6, 7142.0], [65.7, 7155.0], [65.8, 7157.0], [65.9, 7166.0], [66.0, 7176.0], [66.1, 7179.0], [66.2, 7185.0], [66.3, 7195.0], [66.4, 7200.0], [66.5, 7207.0], [66.6, 7209.0], [66.7, 7217.0], [66.8, 7226.0], [66.9, 7234.0], [67.0, 7237.0], [67.1, 7246.0], [67.2, 7251.0], [67.3, 7252.0], [67.4, 7257.0], [67.5, 7271.0], [67.6, 7275.0], [67.7, 7281.0], [67.8, 7289.0], [67.9, 7295.0], [68.0, 7301.0], [68.1, 7308.0], [68.2, 7312.0], [68.3, 7316.0], [68.4, 7317.0], [68.5, 7324.0], [68.6, 7327.0], [68.7, 7332.0], [68.8, 7337.0], [68.9, 7343.0], [69.0, 7358.0], [69.1, 7361.0], [69.2, 7364.0], [69.3, 7366.0], [69.4, 7376.0], [69.5, 7400.0], [69.6, 7402.0], [69.7, 7415.0], [69.8, 7427.0], [69.9, 7437.0], [70.0, 7440.0], [70.1, 7445.0], [70.2, 7450.0], [70.3, 7453.0], [70.4, 7456.0], [70.5, 7467.0], [70.6, 7469.0], [70.7, 7477.0], [70.8, 7484.0], [70.9, 7495.0], [71.0, 7504.0], [71.1, 7507.0], [71.2, 7511.0], [71.3, 7517.0], [71.4, 7519.0], [71.5, 7527.0], [71.6, 7539.0], [71.7, 7542.0], [71.8, 7548.0], [71.9, 7556.0], [72.0, 7573.0], [72.1, 7577.0], [72.2, 7581.0], [72.3, 7592.0], [72.4, 7618.0], [72.5, 7638.0], [72.6, 7645.0], [72.7, 7664.0], [72.8, 7683.0], [72.9, 7693.0], [73.0, 7710.0], [73.1, 7731.0], [73.2, 7765.0], [73.3, 7777.0], [73.4, 7787.0], [73.5, 7799.0], [73.6, 7809.0], [73.7, 7820.0], [73.8, 7824.0], [73.9, 7836.0], [74.0, 7865.0], [74.1, 7870.0], [74.2, 7884.0], [74.3, 7890.0], [74.4, 7908.0], [74.5, 7921.0], [74.6, 7936.0], [74.7, 7945.0], [74.8, 7966.0], [74.9, 7989.0], [75.0, 8004.0], [75.1, 8019.0], [75.2, 8030.0], [75.3, 8053.0], [75.4, 8074.0], [75.5, 8094.0], [75.6, 8100.0], [75.7, 8122.0], [75.8, 8140.0], [75.9, 8145.0], [76.0, 8161.0], [76.1, 8173.0], [76.2, 8187.0], [76.3, 8203.0], [76.4, 8214.0], [76.5, 8233.0], [76.6, 8237.0], [76.7, 8246.0], [76.8, 8263.0], [76.9, 8272.0], [77.0, 8295.0], [77.1, 8309.0], [77.2, 8327.0], [77.3, 8334.0], [77.4, 8348.0], [77.5, 8353.0], [77.6, 8366.0], [77.7, 8388.0], [77.8, 8393.0], [77.9, 8404.0], [78.0, 8407.0], [78.1, 8417.0], [78.2, 8419.0], [78.3, 8444.0], [78.4, 8456.0], [78.5, 8466.0], [78.6, 8489.0], [78.7, 8498.0], [78.8, 8512.0], [78.9, 8528.0], [79.0, 8538.0], [79.1, 8542.0], [79.2, 8546.0], [79.3, 8555.0], [79.4, 8569.0], [79.5, 8577.0], [79.6, 8583.0], [79.7, 8585.0], [79.8, 8588.0], [79.9, 8608.0], [80.0, 8620.0], [80.1, 8629.0], [80.2, 8652.0], [80.3, 8656.0], [80.4, 8663.0], [80.5, 8672.0], [80.6, 8687.0], [80.7, 8692.0], [80.8, 8702.0], [80.9, 8706.0], [81.0, 8713.0], [81.1, 8716.0], [81.2, 8723.0], [81.3, 8733.0], [81.4, 8739.0], [81.5, 8745.0], [81.6, 8757.0], [81.7, 8763.0], [81.8, 8768.0], [81.9, 8776.0], [82.0, 8785.0], [82.1, 8791.0], [82.2, 8797.0], [82.3, 8808.0], [82.4, 8815.0], [82.5, 8828.0], [82.6, 8836.0], [82.7, 8843.0], [82.8, 8845.0], [82.9, 8851.0], [83.0, 8864.0], [83.1, 8875.0], [83.2, 8881.0], [83.3, 8893.0], [83.4, 8911.0], [83.5, 8920.0], [83.6, 8931.0], [83.7, 8936.0], [83.8, 8940.0], [83.9, 8943.0], [84.0, 8956.0], [84.1, 8961.0], [84.2, 8967.0], [84.3, 8970.0], [84.4, 8976.0], [84.5, 8984.0], [84.6, 8994.0], [84.7, 9005.0], [84.8, 9018.0], [84.9, 9032.0], [85.0, 9036.0], [85.1, 9037.0], [85.2, 9040.0], [85.3, 9044.0], [85.4, 9052.0], [85.5, 9063.0], [85.6, 9067.0], [85.7, 9075.0], [85.8, 9087.0], [85.9, 9097.0], [86.0, 9104.0], [86.1, 9110.0], [86.2, 9115.0], [86.3, 9125.0], [86.4, 9127.0], [86.5, 9135.0], [86.6, 9149.0], [86.7, 9151.0], [86.8, 9158.0], [86.9, 9166.0], [87.0, 9173.0], [87.1, 9182.0], [87.2, 9187.0], [87.3, 9191.0], [87.4, 9193.0], [87.5, 9204.0], [87.6, 9206.0], [87.7, 9209.0], [87.8, 9211.0], [87.9, 9214.0], [88.0, 9216.0], [88.1, 9219.0], [88.2, 9225.0], [88.3, 9226.0], [88.4, 9228.0], [88.5, 9229.0], [88.6, 9234.0], [88.7, 9239.0], [88.8, 9246.0], [88.9, 9255.0], [89.0, 9257.0], [89.1, 9265.0], [89.2, 9274.0], [89.3, 9278.0], [89.4, 9283.0], [89.5, 9286.0], [89.6, 9294.0], [89.7, 9299.0], [89.8, 9306.0], [89.9, 9314.0], [90.0, 9318.0], [90.1, 9328.0], [90.2, 9337.0], [90.3, 9350.0], [90.4, 9354.0], [90.5, 9364.0], [90.6, 9367.0], [90.7, 9372.0], [90.8, 9377.0], [90.9, 9378.0], [91.0, 9384.0], [91.1, 9390.0], [91.2, 9395.0], [91.3, 9398.0], [91.4, 9402.0], [91.5, 9410.0], [91.6, 9415.0], [91.7, 9426.0], [91.8, 9428.0], [91.9, 9428.0], [92.0, 9437.0], [92.1, 9443.0], [92.2, 9448.0], [92.3, 9450.0], [92.4, 9452.0], [92.5, 9455.0], [92.6, 9466.0], [92.7, 9474.0], [92.8, 9486.0], [92.9, 9490.0], [93.0, 9494.0], [93.1, 9511.0], [93.2, 9518.0], [93.3, 9525.0], [93.4, 9529.0], [93.5, 9545.0], [93.6, 9549.0], [93.7, 9556.0], [93.8, 9564.0], [93.9, 9568.0], [94.0, 9573.0], [94.1, 9583.0], [94.2, 9590.0], [94.3, 9600.0], [94.4, 9603.0], [94.5, 9621.0], [94.6, 9630.0], [94.7, 9636.0], [94.8, 9639.0], [94.9, 9643.0], [95.0, 9646.0], [95.1, 9647.0], [95.2, 9655.0], [95.3, 9659.0], [95.4, 9663.0], [95.5, 9675.0], [95.6, 9678.0], [95.7, 9689.0], [95.8, 9690.0], [95.9, 9695.0], [96.0, 9703.0], [96.1, 9714.0], [96.2, 9723.0], [96.3, 9724.0], [96.4, 9731.0], [96.5, 9734.0], [96.6, 9744.0], [96.7, 9768.0], [96.8, 9776.0], [96.9, 9784.0], [97.0, 9788.0], [97.1, 9815.0], [97.2, 9829.0], [97.3, 9839.0], [97.4, 9853.0], [97.5, 9874.0], [97.6, 9900.0], [97.7, 9908.0], [97.8, 9918.0], [97.9, 9925.0], [98.0, 9951.0], [98.1, 9965.0], [98.2, 9980.0], [98.3, 10013.0], [98.4, 10038.0], [98.5, 10109.0], [98.6, 10124.0], [98.7, 10205.0], [98.8, 10234.0], [98.9, 10258.0], [99.0, 10310.0], [99.1, 10394.0], [99.2, 10420.0], [99.3, 10466.0], [99.4, 10503.0], [99.5, 10657.0], [99.6, 10748.0], [99.7, 10805.0], [99.8, 10841.0], [99.9, 10986.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 68.0, "series": [{"data": [[100.0, 1.0], [200.0, 10.0], [300.0, 31.0], [400.0, 17.0], [500.0, 16.0], [600.0, 9.0], [700.0, 4.0], [900.0, 1.0], [1000.0, 15.0], [1100.0, 25.0], [1200.0, 18.0], [1300.0, 14.0], [1400.0, 16.0], [1500.0, 17.0], [1600.0, 19.0], [1700.0, 18.0], [1800.0, 34.0], [1900.0, 32.0], [2000.0, 51.0], [2100.0, 37.0], [2200.0, 32.0], [2300.0, 30.0], [2400.0, 21.0], [2500.0, 28.0], [2600.0, 35.0], [2700.0, 46.0], [2800.0, 45.0], [2900.0, 38.0], [3000.0, 36.0], [3100.0, 32.0], [3200.0, 27.0], [3300.0, 34.0], [3400.0, 33.0], [3500.0, 14.0], [3600.0, 28.0], [3700.0, 21.0], [3800.0, 25.0], [3900.0, 24.0], [4000.0, 24.0], [4100.0, 31.0], [4200.0, 44.0], [4300.0, 36.0], [4400.0, 24.0], [4500.0, 19.0], [4600.0, 27.0], [4800.0, 37.0], [4700.0, 25.0], [5000.0, 42.0], [4900.0, 39.0], [5100.0, 44.0], [5200.0, 39.0], [5300.0, 33.0], [5400.0, 30.0], [5500.0, 32.0], [5600.0, 43.0], [5800.0, 26.0], [5700.0, 27.0], [6100.0, 24.0], [5900.0, 28.0], [6000.0, 19.0], [6300.0, 37.0], [6200.0, 35.0], [6500.0, 38.0], [6400.0, 45.0], [6600.0, 37.0], [6700.0, 32.0], [6900.0, 25.0], [6800.0, 44.0], [7000.0, 38.0], [7100.0, 33.0], [7200.0, 48.0], [7300.0, 46.0], [7400.0, 44.0], [7500.0, 42.0], [7600.0, 19.0], [7700.0, 16.0], [7800.0, 25.0], [7900.0, 18.0], [8000.0, 19.0], [8100.0, 20.0], [8300.0, 25.0], [8400.0, 27.0], [8200.0, 23.0], [8600.0, 27.0], [8700.0, 44.0], [8500.0, 34.0], [9200.0, 68.0], [8800.0, 32.0], [8900.0, 39.0], [9000.0, 39.0], [9100.0, 46.0], [9300.0, 48.0], [9400.0, 53.0], [9500.0, 36.0], [9700.0, 32.0], [9600.0, 50.0], [9800.0, 17.0], [9900.0, 19.0], [10000.0, 8.0], [10100.0, 6.0], [10200.0, 9.0], [10300.0, 4.0], [10400.0, 8.0], [10500.0, 2.0], [10600.0, 3.0], [10700.0, 4.0], [10800.0, 4.0], [10900.0, 3.0], [11100.0, 2.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 11100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 59.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2823.0, "series": [{"data": [[1.0, 118.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 59.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2823.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 837.9020217729387, "minX": 1.5495837E12, "maxY": 1082.8956300381806, "series": [{"data": [[1.5495837E12, 837.9020217729387], [1.54958376E12, 1082.8956300381806]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 359.25, "minX": 1.0, "maxY": 11110.0, "series": [{"data": [[3.0, 9845.5], [4.0, 9428.0], [5.0, 9662.0], [6.0, 9371.0], [7.0, 9731.0], [8.0, 9758.0], [10.0, 9648.5], [11.0, 10841.0], [13.0, 9707.0], [14.0, 9309.0], [15.0, 10073.5], [16.0, 9647.0], [17.0, 9900.0], [18.0, 9918.0], [19.0, 9566.0], [20.0, 9336.0], [21.0, 9689.0], [22.0, 9965.0], [23.0, 9466.0], [24.0, 9712.0], [25.0, 9373.0], [26.0, 9768.0], [27.0, 9482.0], [28.0, 9532.0], [29.0, 9379.0], [30.0, 9441.0], [31.0, 9652.0], [33.0, 9437.0], [32.0, 9450.0], [35.0, 9568.0], [34.0, 9415.0], [37.0, 9491.0], [36.0, 9470.0], [39.0, 9925.0], [38.0, 9655.0], [41.0, 9815.0], [40.0, 9659.0], [42.0, 9724.0], [45.0, 9293.0], [44.0, 9647.5], [47.0, 9549.0], [46.0, 9283.0], [49.0, 10404.0], [48.0, 9262.0], [51.0, 9678.0], [50.0, 9679.0], [52.0, 9564.0], [55.0, 9499.0], [54.0, 9531.0], [56.0, 9378.0], [59.0, 9416.0], [58.0, 9678.0], [61.0, 9602.0], [60.0, 9452.0], [63.0, 9492.5], [67.0, 9400.0], [66.0, 9980.0], [65.0, 9384.0], [64.0, 9301.0], [71.0, 9225.0], [70.0, 9703.0], [69.0, 9877.0], [68.0, 9690.0], [75.0, 9644.0], [74.0, 9663.0], [73.0, 9360.0], [79.0, 11110.0], [78.0, 9772.5], [76.0, 9298.0], [83.0, 9551.0], [82.0, 9545.0], [81.0, 9474.0], [80.0, 9290.0], [87.0, 9600.0], [86.0, 10138.0], [84.0, 9583.0], [90.0, 2577.5], [91.0, 4797.5], [89.0, 9280.5], [94.0, 4761.0], [95.0, 4928.0], [93.0, 9545.0], [92.0, 9225.0], [99.0, 6505.333333333333], [97.0, 9518.0], [96.0, 10013.0], [103.0, 9647.0], [102.0, 9428.0], [101.0, 9728.0], [100.0, 9379.0], [105.0, 2547.5], [106.0, 4819.5], [107.0, 3481.0], [104.0, 9531.0], [110.0, 359.25], [109.0, 1492.0], [108.0, 1871.6666666666665], [111.0, 9740.0], [112.0, 5086.0], [114.0, 3946.3333333333335], [115.0, 9714.0], [113.0, 10026.0], [119.0, 9783.0], [118.0, 10234.0], [117.0, 9950.0], [120.0, 2736.5], [123.0, 9392.0], [122.0, 9310.0], [121.0, 9255.0], [124.0, 4776.5], [127.0, 2013.1666666666665], [126.0, 4978.0], [125.0, 9594.0], [129.0, 486.0], [128.0, 4767.5], [131.0, 3563.0], [135.0, 9151.0], [134.0, 9337.0], [133.0, 9444.0], [132.0, 9574.0], [130.0, 9731.5], [142.0, 3457.6666666666665], [141.0, 2586.25], [140.0, 5057.5], [143.0, 9525.0], [139.0, 9244.0], [138.0, 10926.0], [137.0, 9237.0], [136.0, 9689.0], [145.0, 4908.0], [147.0, 1806.0], [148.0, 2775.75], [146.0, 4916.0], [151.0, 9398.0], [150.0, 9228.0], [149.0, 9453.0], [144.0, 10986.0], [152.0, 4982.5], [155.0, 3581.3333333333335], [154.0, 2810.25], [153.0, 4796.0], [159.0, 3479.3333333333335], [158.0, 1992.0], [157.0, 6477.0], [160.0, 3555.0], [166.0, 3533.0], [165.0, 2740.25], [167.0, 9229.0], [164.0, 10828.0], [163.0, 9273.0], [161.0, 9556.0], [168.0, 540.5], [175.0, 9354.0], [174.0, 9224.0], [172.0, 10796.0], [171.0, 9771.0], [170.0, 9690.0], [169.0, 9382.5], [183.0, 9285.0], [182.0, 9075.0], [181.0, 9166.0], [180.0, 9324.0], [179.0, 9776.0], [178.0, 10740.0], [177.0, 10631.0], [176.0, 10756.0], [191.0, 9388.0], [190.0, 9097.0], [189.0, 9354.0], [188.0, 9239.0], [187.0, 9316.0], [186.0, 9373.0], [185.0, 9428.0], [184.0, 9063.0], [199.0, 10230.0], [198.0, 9402.0], [197.0, 9426.0], [196.0, 9229.0], [194.0, 9173.0], [193.0, 9395.0], [192.0, 9671.0], [207.0, 9034.0], [206.0, 9040.0], [205.0, 10310.0], [204.0, 9222.0], [203.0, 9556.0], [202.0, 10466.0], [201.0, 9717.0], [200.0, 9584.0], [215.0, 9427.0], [214.0, 9086.0], [213.0, 9251.0], [211.0, 9159.0], [210.0, 9209.0], [209.0, 9198.0], [208.0, 9448.0], [223.0, 9193.0], [222.0, 8994.0], [221.0, 9450.0], [220.0, 9639.0], [219.0, 10503.0], [218.0, 9005.0], [217.0, 9032.0], [216.0, 9437.0], [230.0, 8936.0], [229.0, 10653.0], [228.0, 10239.0], [227.0, 9768.0], [226.0, 10814.0], [225.0, 9211.0], [224.0, 9037.0], [239.0, 10805.0], [238.0, 9621.0], [237.0, 9125.0], [236.0, 9205.0], [235.0, 10194.0], [234.0, 9585.0], [233.0, 9732.0], [232.0, 9388.5], [247.0, 9269.0], [246.0, 9390.0], [245.0, 9529.0], [244.0, 9209.0], [243.0, 9215.0], [242.0, 9214.0], [241.0, 9494.0], [240.0, 9072.0], [255.0, 8953.0], [254.0, 9263.0], [253.0, 9396.0], [252.0, 9788.0], [251.0, 9387.0], [250.0, 8952.0], [249.0, 9560.5], [268.0, 9677.0], [270.0, 9915.0], [271.0, 9495.0], [269.0, 9676.0], [267.0, 9037.5], [265.0, 9945.0], [263.0, 10113.0], [257.0, 9721.0], [256.0, 9231.0], [259.0, 9191.0], [258.0, 10123.0], [262.0, 9451.0], [261.0, 10441.0], [260.0, 9521.0], [286.0, 9104.0], [287.0, 9358.0], [285.0, 8973.0], [284.0, 8962.0], [283.0, 10657.0], [282.0, 8976.0], [281.0, 9156.0], [280.0, 9578.0], [279.0, 8812.0], [272.0, 10083.0], [274.0, 9448.0], [273.0, 9126.0], [278.0, 9143.0], [277.0, 9413.0], [276.0, 9405.0], [302.0, 10545.0], [303.0, 9255.0], [301.0, 9482.0], [300.0, 9246.0], [299.0, 8765.0], [298.0, 9067.0], [297.0, 9490.0], [296.0, 9036.0], [295.0, 9402.0], [289.0, 10394.0], [288.0, 9518.0], [291.0, 9174.0], [290.0, 8961.0], [294.0, 10205.0], [293.0, 9924.0], [292.0, 9954.0], [318.0, 9274.0], [319.0, 9328.0], [317.0, 8974.0], [316.0, 10495.0], [315.0, 9209.0], [314.0, 9441.0], [313.0, 9219.0], [312.0, 9117.0], [311.0, 8868.0], [304.0, 8931.0], [307.0, 9549.5], [305.0, 9056.0], [310.0, 9207.0], [309.0, 9428.0], [308.0, 8846.0], [333.0, 9737.0], [335.0, 8966.5], [332.0, 9784.0], [323.0, 8864.0], [322.0, 10418.0], [321.0, 8935.0], [320.0, 9646.0], [331.0, 9491.0], [330.0, 9275.0], [329.0, 9607.0], [328.0, 9724.0], [327.0, 9347.0], [326.0, 9517.0], [325.0, 9687.0], [324.0, 10014.0], [350.0, 10258.0], [351.0, 9831.0], [349.0, 9130.0], [348.0, 9170.0], [347.0, 9410.0], [346.0, 8943.0], [345.0, 8937.0], [344.0, 10109.0], [343.0, 8844.0], [337.0, 9120.0], [336.0, 9528.0], [339.0, 8757.0], [338.0, 9016.0], [342.0, 9688.0], [340.0, 10236.0], [366.0, 9590.0], [367.0, 9227.0], [365.0, 9853.0], [364.0, 9591.0], [363.0, 9018.0], [362.0, 9444.0], [361.0, 8817.0], [360.0, 9818.0], [359.0, 9836.0], [353.0, 9162.0], [352.0, 9511.0], [355.0, 10038.0], [354.0, 9643.0], [358.0, 9294.0], [357.0, 10388.0], [356.0, 9658.0], [382.0, 9839.0], [383.0, 9048.0], [381.0, 8893.0], [380.0, 8960.0], [379.0, 8990.0], [378.0, 10420.0], [377.0, 8723.0], [376.0, 8548.0], [375.0, 9372.0], [369.0, 9182.0], [368.0, 9345.0], [371.0, 9283.0], [370.0, 8544.0], [374.0, 9603.0], [373.0, 8540.0], [372.0, 8735.0], [398.0, 9080.0], [399.0, 8530.0], [397.0, 8911.0], [396.0, 8970.0], [395.0, 9100.0], [394.0, 9073.0], [393.0, 8520.0], [392.0, 9052.0], [391.0, 9354.0], [384.0, 9273.0], [387.0, 9377.5], [385.0, 10172.0], [390.0, 9545.0], [389.0, 9304.0], [388.0, 9003.0], [403.0, 4296.2], [409.0, 4792.5], [410.0, 3097.0], [411.0, 9192.0], [408.0, 4989.0], [415.0, 9739.0], [414.0, 9759.0], [412.0, 5063.5], [413.0, 5164.0], [407.0, 3448.0], [406.0, 5570.5], [405.0, 2673.8], [404.0, 2240.5], [402.0, 1179.0], [401.0, 4934.0], [400.0, 5169.5], [430.0, 5070.0], [424.0, 5377.0], [429.0, 3629.3333333333335], [431.0, 10124.0], [428.0, 8984.0], [427.0, 9573.0], [426.0, 9364.0], [425.0, 9624.0], [423.0, 9630.0], [417.0, 9403.0], [416.0, 9602.0], [419.0, 8985.0], [418.0, 9281.0], [422.0, 9112.0], [421.0, 9102.0], [420.0, 9928.0], [446.0, 10011.0], [432.0, 4861.5], [433.0, 5253.0], [435.0, 9043.0], [434.0, 8812.0], [437.0, 3733.3333333333335], [436.0, 9443.0], [438.0, 5322.0], [439.0, 8572.0], [447.0, 9570.0], [441.0, 9974.0], [440.0, 8717.0], [445.0, 8794.0], [444.0, 8870.0], [443.0, 8927.0], [442.0, 9000.0], [462.0, 9645.0], [450.0, 4937.0], [453.0, 4920.5], [452.0, 8815.0], [457.0, 3898.0], [455.0, 5157.0], [449.0, 9216.0], [448.0, 9667.0], [454.0, 9053.0], [459.0, 5427.5], [458.0, 9646.0], [463.0, 9214.0], [456.0, 9734.0], [461.0, 10321.0], [460.0, 8659.0], [451.0, 8768.0], [479.0, 9151.0], [465.0, 5066.5], [471.0, 9010.0], [464.0, 9948.0], [470.0, 8784.0], [469.0, 9306.0], [468.0, 9960.0], [472.0, 5728.0], [478.0, 8667.0], [477.0, 9811.0], [476.0, 9918.0], [467.0, 8913.0], [466.0, 8761.0], [475.0, 8836.0], [474.0, 8803.0], [473.0, 9092.0], [495.0, 4995.5], [492.0, 5147.0], [483.0, 9038.0], [482.0, 9404.0], [481.0, 8885.0], [480.0, 8970.0], [491.0, 4974.0], [494.0, 9870.0], [493.0, 8692.0], [490.0, 9744.0], [489.0, 9486.0], [488.0, 9607.0], [487.0, 9110.0], [486.0, 9350.0], [485.0, 9044.0], [484.0, 8767.0], [499.0, 5208.5], [497.0, 3753.3333333333335], [500.0, 5164.5], [502.0, 9106.0], [501.0, 8752.0], [498.0, 4857.5], [496.0, 5603.5], [503.0, 8980.0], [504.0, 4066.3333333333335], [505.0, 5021.0], [507.0, 9568.0], [506.0, 8934.0], [508.0, 5058.5], [509.0, 8830.0], [510.0, 4930.0], [511.0, 8512.0], [514.0, 8967.0], [516.0, 3984.0], [512.0, 9021.0], [526.0, 9489.0], [524.0, 9465.0], [520.0, 9365.0], [530.0, 5371.0], [528.0, 8583.0], [532.0, 9368.0], [534.0, 8773.0], [536.0, 4931.0], [518.0, 9346.0], [542.0, 8851.0], [540.0, 9106.5], [538.0, 8723.0], [546.0, 8933.5], [570.0, 8590.0], [574.0, 8797.0], [560.0, 5330.5], [544.0, 8532.0], [550.0, 9257.0], [558.0, 9314.0], [556.0, 9426.0], [554.0, 9128.0], [562.0, 8466.0], [564.0, 8366.0], [566.0, 8585.0], [568.0, 9173.0], [572.0, 8353.0], [578.0, 8733.0], [604.0, 8421.0], [588.0, 4931.0], [586.0, 8619.0], [584.0, 9021.0], [576.0, 8295.0], [580.0, 8840.0], [582.0, 8785.0], [590.0, 8417.0], [598.0, 5218.0], [606.0, 3820.6666666666665], [592.0, 8407.0], [594.0, 8276.0], [596.0, 8225.0], [602.0, 8625.0], [600.0, 8301.0], [610.0, 8876.0], [632.0, 8538.0], [616.0, 8418.0], [618.0, 8724.0], [608.0, 8456.0], [612.0, 8808.0], [614.0, 8169.0], [622.0, 8238.0], [628.0, 4774.0], [630.0, 4894.5], [634.0, 4968.0], [636.0, 5000.0], [626.0, 8300.0], [624.0, 8333.0], [638.0, 8309.0], [642.0, 8684.0], [644.0, 3294.5], [640.0, 8760.0], [654.0, 8702.0], [652.0, 8598.0], [650.0, 8197.0], [648.0, 8715.0], [646.0, 4966.5], [656.0, 8588.0], [662.0, 8587.0], [660.0, 7966.0], [666.0, 4864.5], [664.0, 8182.0], [668.0, 8608.0], [670.0, 8043.0], [676.0, 9044.0], [674.0, 5228.0], [678.0, 8941.0], [696.0, 8405.0], [686.0, 4918.5], [684.0, 8706.0], [682.0, 8001.0], [680.0, 8274.0], [672.0, 8498.0], [692.0, 4957.5], [690.0, 8348.0], [694.0, 3290.5], [702.0, 8929.0], [688.0, 8141.0], [700.0, 9148.0], [698.0, 8572.0], [706.0, 7809.0], [728.0, 4109.333333333334], [734.0, 7936.0], [714.0, 8074.0], [712.0, 8563.0], [704.0, 8083.0], [708.0, 8920.0], [710.0, 8183.0], [718.0, 8705.0], [726.0, 5405.25], [720.0, 8588.0], [724.0, 7884.0], [732.0, 8404.0], [730.0, 8770.0], [742.0, 8137.0], [738.0, 4789.0], [736.0, 8681.0], [740.0, 8079.0], [760.0, 8004.0], [762.0, 4961.0], [764.0, 5954.333333333333], [766.0, 5018.0], [744.0, 3916.3333333333335], [746.0, 4977.5], [748.0, 7486.0], [750.0, 7484.0], [752.0, 4652.0], [758.0, 4926.0], [754.0, 7289.0], [782.0, 4155.5], [772.0, 4577.0], [774.0, 7799.0], [792.0, 7767.0], [794.0, 6962.0], [796.0, 7765.0], [776.0, 4950.0], [778.0, 7155.0], [780.0, 7536.0], [768.0, 7316.0], [770.0, 7364.0], [784.0, 4665.5], [786.0, 7332.0], [788.0, 7314.0], [790.0, 7876.0], [798.0, 7415.0], [802.0, 4760.5], [800.0, 4284.5], [804.0, 7540.0], [806.0, 7284.0], [812.0, 7295.0], [810.0, 7443.0], [814.0, 7427.0], [816.0, 3327.666666666667], [830.0, 7824.0], [828.0, 7279.0], [826.0, 7179.0], [824.0, 7620.0], [818.0, 1774.0], [822.0, 4080.0], [820.0, 7188.0], [832.0, 3078.2], [846.0, 7898.0], [838.0, 4817.5], [836.0, 6876.0], [834.0, 7519.0], [856.0, 7122.0], [842.0, 7047.0], [840.0, 7157.0], [844.0, 4351.0], [854.0, 7465.0], [852.0, 7362.0], [850.0, 7577.0], [848.0, 7666.0], [858.0, 7574.0], [860.0, 7569.0], [862.0, 4023.666666666667], [870.0, 7456.0], [890.0, 7467.0], [864.0, 4820.0], [866.0, 5523.333333333333], [868.0, 7450.0], [888.0, 7731.0], [892.0, 6763.0], [894.0, 4468.5], [880.0, 6607.0], [874.0, 3760.5], [872.0, 6723.0], [876.0, 5316.0], [878.0, 7064.0], [882.0, 4648.5], [884.0, 4735.5], [886.0, 6977.0], [898.0, 7452.0], [896.0, 7513.0], [900.0, 7195.0], [902.0, 3586.0], [904.0, 3320.333333333333], [906.0, 4863.0], [908.0, 4845.0], [910.0, 6983.0], [912.0, 4110.5], [914.0, 2561.083333333333], [920.0, 3481.75], [922.0, 7405.0], [924.0, 4143.333333333333], [926.0, 3225.5], [916.0, 2447.85], [918.0, 4687.0], [930.0, 4796.0], [932.0, 4821.0], [934.0, 7065.0], [952.0, 7520.0], [954.0, 7453.0], [928.0, 3525.5], [942.0, 7727.0], [940.0, 7278.0], [938.0, 6941.0], [936.0, 6893.0], [958.0, 2193.25], [944.0, 7360.0], [946.0, 6898.0], [948.0, 6476.0], [950.0, 6827.0], [956.0, 7573.0], [962.0, 4762.5], [988.0, 7007.0], [974.0, 4703.0], [972.0, 6637.0], [970.0, 7008.0], [968.0, 7132.0], [960.0, 7084.0], [976.0, 7317.0], [978.0, 7456.0], [980.0, 6786.0], [990.0, 7056.0], [986.0, 7327.0], [984.0, 7226.0], [966.0, 7290.0], [964.0, 7295.0], [992.0, 6760.0], [1020.0, 6796.0], [1000.0, 2707.0], [1002.0, 6630.0], [1004.0, 4875.5], [994.0, 7445.0], [996.0, 7359.0], [998.0, 6741.0], [1006.0, 6655.0], [1016.0, 7209.0], [1008.0, 6829.0], [1010.0, 5310.0], [1012.0, 7029.0], [1014.0, 6287.0], [1022.0, 6799.0], [1018.0, 7413.0], [1036.0, 5489.5], [1032.0, 4475.5], [1048.0, 4731.0], [1028.0, 6935.0], [1024.0, 7141.0], [1052.0, 7327.0], [1080.0, 4126.0], [1072.0, 4980.0], [1076.0, 6637.0], [1060.0, 6653.0], [1056.0, 7691.0], [1084.0, 6388.0], [1064.0, 3491.333333333333], [1068.0, 6617.0], [1044.0, 4400.0], [1040.0, 7088.0], [1092.0, 4959.5], [1116.0, 4336.0], [1088.0, 4165.0], [1112.0, 4834.0], [1108.0, 4745.0], [1104.0, 4629.5], [1136.0, 3269.0], [1144.0, 8469.0], [1148.0, 4780.5], [1120.0, 3265.4], [1124.0, 3430.8], [1132.0, 6475.0], [1128.0, 2438.3333333333335], [1096.0, 6435.0], [1100.0, 6598.0], [1160.0, 7467.0], [1180.0, 6489.0], [1156.0, 4519.666666666667], [1152.0, 6602.0], [1164.0, 6776.0], [1196.0, 6069.333333333333], [1192.0, 4708.5], [1188.0, 3776.666666666667], [1184.0, 6307.0], [1212.0, 7011.0], [1208.0, 4369.5], [1200.0, 4350.0], [1204.0, 3888.0], [1168.0, 5325.5], [1176.0, 3184.2], [1172.0, 6271.0], [1228.0, 4158.0], [1224.0, 7334.0], [1264.0, 6247.0], [1268.0, 6275.0], [1240.0, 4348.0], [1216.0, 6781.0], [1220.0, 7392.0], [1244.0, 7252.0], [1272.0, 6251.0], [1276.0, 6835.0], [1256.0, 4265.0], [1260.0, 4440.0], [1252.0, 5331.0], [1248.0, 7234.0], [1232.0, 5272.5], [1236.0, 4095.666666666667], [1292.0, 3914.666666666667], [1328.0, 6498.0], [1280.0, 4951.5], [1304.0, 4178.6], [1308.0, 6016.0], [1288.0, 7034.0], [1284.0, 7008.0], [1312.0, 4286.0], [1332.0, 5295.0], [1340.0, 6288.0], [1336.0, 7338.0], [1316.0, 6864.0], [1320.0, 3984.666666666667], [1324.0, 6856.0], [1296.0, 4478.0], [1300.0, 5697.0], [1392.0, 5133.5], [1356.0, 3911.0], [1348.0, 6331.0], [1352.0, 7317.0], [1372.0, 3864.0], [1344.0, 5690.0], [1396.0, 4403.5], [1400.0, 5716.0], [1376.0, 6049.0], [1380.0, 4727.0], [1384.0, 4372.0], [1388.0, 4429.25], [1364.0, 4510.0], [1360.0, 5912.0], [1368.0, 6186.0], [1412.0, 5257.0], [1416.0, 4370.5], [1436.0, 5329.5], [1424.0, 5613.0], [1428.0, 5652.0], [1432.0, 6296.0], [1408.0, 6345.0], [1420.0, 5848.0], [1456.0, 5531.0], [1460.0, 6177.0], [1464.0, 5341.0], [1440.0, 3740.6666666666665], [1444.0, 6111.0], [1468.0, 5913.0], [1448.0, 4699.0], [1452.0, 5683.0], [1520.0, 5847.0], [1524.0, 4340.333333333333], [1476.0, 3742.25], [1472.0, 5653.0], [1484.0, 5108.0], [1480.0, 6034.0], [1528.0, 4401.666666666667], [1532.0, 5105.0], [1504.0, 5079.0], [1508.0, 5376.0], [1512.0, 4462.0], [1516.0, 4135.5], [1488.0, 4748.5], [1492.0, 3933.25], [1496.0, 5484.0], [1500.0, 5580.0], [1544.0, 3999.2], [1564.0, 4812.5], [1536.0, 3640.6666666666665], [1540.0, 6514.0], [1560.0, 4688.0], [1592.0, 5558.0], [1568.0, 5043.0], [1596.0, 5119.0], [1588.0, 3855.0], [1572.0, 4148.333333333333], [1576.0, 5400.0], [1580.0, 5082.5], [1548.0, 4851.0], [1584.0, 5000.0], [1552.0, 4893.0], [1556.0, 5085.5], [1604.0, 4730.0], [1648.0, 5206.0], [1600.0, 4788.0], [1628.0, 4970.0], [1624.0, 4311.0], [1620.0, 4587.5], [1616.0, 5395.0], [1608.0, 4181.0], [1612.0, 4450.0], [1652.0, 4382.0], [1656.0, 5831.0], [1632.0, 4700.0], [1636.0, 4983.0], [1660.0, 4795.0], [1640.0, 4149.0], [1644.0, 4253.0], [1676.0, 4937.5], [1664.0, 4938.5], [1688.0, 5109.0], [1692.0, 4852.0], [1668.0, 5827.0], [1680.0, 4455.75], [1704.0, 4557.0], [1700.0, 4886.0], [1696.0, 5130.0], [1716.0, 4946.0], [1720.0, 6134.0], [1724.0, 3697.0], [1712.0, 4412.0], [1708.0, 4243.333333333333], [1684.0, 4830.0], [1736.0, 4585.666666666667], [1740.0, 4266.0], [1732.0, 6137.5], [1748.0, 4742.0], [1752.0, 5815.0], [1756.0, 5417.0], [1744.0, 4478.0], [1776.0, 4159.0], [1780.0, 3781.0], [1784.0, 4664.0], [1788.0, 4744.0], [1760.0, 5046.666666666667], [1768.0, 4948.0], [1772.0, 4318.0], [1764.0, 4382.666666666667], [1800.0, 4446.0], [1804.0, 4491.0], [1792.0, 3863.0], [1820.0, 4404.0], [1796.0, 4446.0], [1840.0, 4368.0], [1844.0, 4917.5], [1848.0, 5515.0], [1852.0, 4875.0], [1824.0, 5138.0], [1828.0, 4410.0], [1832.0, 4334.0], [1836.0, 4060.0], [1812.0, 4118.25], [1808.0, 4302.0], [1816.0, 4424.0], [1912.0, 4662.0], [1908.0, 4452.333333333333], [1904.0, 4863.0], [1868.0, 4431.0], [1916.0, 4114.0], [1888.0, 3420.8], [1892.0, 4121.75], [1896.0, 4660.0], [1900.0, 5578.5], [1876.0, 4281.75], [1872.0, 4223.0], [1880.0, 4994.0], [1856.0, 4265.0], [1860.0, 5556.0], [1864.0, 4864.0], [1884.0, 4212.0], [1920.0, 4168.0], [1037.0, 7584.0], [1033.0, 7011.0], [1073.0, 7167.0], [1077.0, 6854.0], [1081.0, 6601.0], [1029.0, 4325.0], [1053.0, 4405.0], [1025.0, 6833.0], [1057.0, 3990.333333333333], [1085.0, 6602.0], [1065.0, 4723.5], [1069.0, 6621.0], [1061.0, 2013.0], [1045.0, 3504.25], [1041.0, 7113.0], [1049.0, 6630.0], [1089.0, 4284.0], [1117.0, 3689.0], [1113.0, 4038.0], [1105.0, 4693.5], [1109.0, 7160.0], [1093.0, 3395.0], [1097.0, 6669.0], [1141.0, 6571.5], [1137.0, 6750.0], [1101.0, 6472.0], [1145.0, 4188.0], [1149.0, 3146.0], [1121.0, 4179.0], [1125.0, 6586.0], [1133.0, 3898.0], [1129.0, 3820.6666666666665], [1161.0, 7581.0], [1153.0, 4676.0], [1157.0, 6153.0], [1181.0, 7511.0], [1177.0, 3704.5], [1165.0, 4381.5], [1201.0, 6773.0], [1193.0, 3470.4], [1197.0, 4861.5], [1189.0, 4849.5], [1185.0, 6158.0], [1213.0, 7211.0], [1209.0, 3962.75], [1205.0, 3639.3333333333335], [1169.0, 3579.333333333333], [1173.0, 6823.0], [1225.0, 3513.75], [1221.0, 5632.0], [1217.0, 6175.0], [1245.0, 7220.0], [1241.0, 3761.1666666666665], [1249.0, 4271.0], [1265.0, 6317.0], [1229.0, 6504.0], [1269.0, 6719.0], [1273.0, 3512.25], [1277.0, 6580.0], [1253.0, 3754.5], [1261.0, 7217.0], [1257.0, 6290.0], [1233.0, 4845.5], [1237.0, 4995.0], [1293.0, 4779.0], [1281.0, 7049.0], [1285.0, 6073.0], [1289.0, 5971.0], [1309.0, 4457.0], [1305.0, 3833.3333333333335], [1329.0, 6114.0], [1313.0, 2939.75], [1341.0, 6629.0], [1333.0, 6808.0], [1317.0, 5979.0], [1321.0, 6870.0], [1325.0, 6869.0], [1297.0, 4443.5], [1301.0, 6832.0], [1393.0, 4437.0], [1373.0, 4193.75], [1349.0, 6271.0], [1345.0, 7312.0], [1357.0, 5840.0], [1397.0, 5715.0], [1405.0, 5757.0], [1401.0, 4439.5], [1377.0, 4106.333333333333], [1381.0, 7364.0], [1385.0, 4850.666666666667], [1389.0, 6562.0], [1365.0, 4983.0], [1361.0, 6083.0], [1369.0, 6253.0], [1409.0, 5046.5], [1437.0, 4161.0], [1417.0, 5689.0], [1413.0, 6143.0], [1429.0, 4912.0], [1433.0, 4073.75], [1425.0, 4905.5], [1421.0, 4146.0], [1465.0, 4088.6666666666665], [1441.0, 6271.0], [1469.0, 5263.0], [1457.0, 4707.5], [1461.0, 4073.25], [1445.0, 4328.5], [1453.0, 6941.0], [1449.0, 5447.0], [1485.0, 3669.0], [1529.0, 4402.666666666667], [1477.0, 4262.0], [1493.0, 4178.5], [1489.0, 5665.0], [1497.0, 5282.0], [1481.0, 5268.0], [1521.0, 5206.0], [1533.0, 5002.0], [1525.0, 4085.5], [1513.0, 4015.0], [1517.0, 3744.25], [1505.0, 4067.5], [1509.0, 5073.0], [1473.0, 5374.0], [1501.0, 5339.0], [1589.0, 4104.0], [1545.0, 4941.0], [1541.0, 5425.0], [1537.0, 5574.0], [1565.0, 4812.0], [1561.0, 4428.5], [1569.0, 4416.0], [1597.0, 4106.5], [1593.0, 6100.0], [1585.0, 4257.5], [1549.0, 4835.0], [1573.0, 4709.0], [1577.0, 5592.0], [1581.0, 5282.0], [1553.0, 3823.6666666666665], [1557.0, 5061.0], [1605.0, 5230.0], [1613.0, 5558.5], [1625.0, 4566.333333333333], [1629.0, 6062.0], [1617.0, 3744.5], [1621.0, 5363.0], [1601.0, 5115.0], [1609.0, 4820.0], [1649.0, 5245.0], [1653.0, 4662.0], [1657.0, 5264.0], [1633.0, 4965.0], [1661.0, 5027.0], [1637.0, 4061.0], [1641.0, 4805.0], [1645.0, 5953.0], [1669.0, 4927.0], [1665.0, 5187.0], [1689.0, 4847.0], [1685.0, 4977.0], [1673.0, 5536.5], [1677.0, 5144.0], [1681.0, 4672.0], [1705.0, 4714.0], [1701.0, 5028.0], [1697.0, 5067.0], [1725.0, 4406.0], [1713.0, 4997.0], [1717.0, 4936.0], [1721.0, 4928.0], [1709.0, 4827.5], [1729.0, 5194.5], [1733.0, 4137.5], [1749.0, 4373.5], [1753.0, 4827.0], [1757.0, 4802.666666666667], [1745.0, 4497.0], [1737.0, 4097.5], [1741.0, 4840.0], [1781.0, 4688.0], [1789.0, 4353.666666666667], [1785.0, 4228.0], [1777.0, 5215.0], [1761.0, 4336.0], [1765.0, 3882.4], [1769.0, 4611.0], [1773.0, 4275.5], [1801.0, 4506.0], [1793.0, 4079.5], [1821.0, 5065.0], [1797.0, 5645.0], [1849.0, 6524.0], [1845.0, 4353.0], [1853.0, 5140.5], [1825.0, 4367.0], [1829.0, 4269.0], [1833.0, 4284.0], [1837.0, 4332.0], [1809.0, 6757.0], [1813.0, 4488.0], [1817.0, 4424.0], [1909.0, 5060.0], [1905.0, 4522.0], [1913.0, 3854.3333333333335], [1889.0, 4213.0], [1893.0, 4134.0], [1897.0, 5334.0], [1869.0, 4535.666666666667], [1873.0, 4247.0], [1877.0, 4526.5], [1881.0, 4351.333333333333], [1857.0, 4278.0], [1861.0, 5250.0], [1865.0, 4274.0], [1885.0, 4226.5], [1921.0, 4975.0], [513.0, 8845.0], [537.0, 4978.5], [527.0, 4894.0], [515.0, 8334.0], [525.0, 8569.0], [523.0, 9066.5], [521.0, 8579.0], [529.0, 9240.0], [531.0, 9182.0], [533.0, 9253.0], [535.0, 8626.0], [519.0, 8404.0], [543.0, 7945.0], [541.0, 9127.0], [547.0, 8743.0], [551.0, 5277.5], [559.0, 5223.0], [549.0, 8932.5], [557.0, 8785.0], [555.0, 8620.0], [553.0, 8636.5], [563.0, 5051.5], [561.0, 9066.0], [565.0, 8966.0], [567.0, 8860.0], [569.0, 5200.0], [571.0, 8551.0], [575.0, 8763.0], [573.0, 8652.0], [591.0, 8270.0], [587.0, 8419.0], [585.0, 8855.0], [589.0, 8465.0], [577.0, 9216.0], [579.0, 9158.0], [581.0, 8555.0], [583.0, 8416.0], [599.0, 9039.0], [607.0, 8458.0], [593.0, 8745.0], [595.0, 8941.0], [597.0, 8348.0], [605.0, 8616.0], [603.0, 8352.0], [601.0, 8407.0], [609.0, 8272.0], [637.0, 5203.0], [617.0, 5169.0], [621.0, 8497.0], [619.0, 8374.0], [623.0, 8122.0], [611.0, 8321.0], [613.0, 8379.0], [615.0, 8736.0], [633.0, 8418.0], [631.0, 5164.0], [629.0, 8958.0], [635.0, 8713.0], [639.0, 8405.0], [627.0, 8324.0], [625.0, 8061.0], [643.0, 5066.0], [647.0, 4918.0], [641.0, 8706.0], [655.0, 8672.0], [653.0, 8791.0], [651.0, 8689.0], [649.0, 7942.0], [645.0, 8251.0], [657.0, 4864.5], [659.0, 6300.666666666667], [663.0, 4877.5], [661.0, 8163.0], [665.0, 7937.0], [667.0, 8710.0], [669.0, 8053.0], [671.0, 8429.0], [677.0, 4907.5], [697.0, 4761.0], [675.0, 8656.0], [679.0, 8844.0], [685.0, 8393.0], [683.0, 7989.0], [681.0, 7870.0], [687.0, 8203.0], [673.0, 8709.0], [689.0, 4888.0], [691.0, 8214.0], [693.0, 7809.0], [695.0, 8444.0], [701.0, 8104.0], [699.0, 8153.0], [719.0, 8245.0], [715.0, 5241.0], [713.0, 8393.0], [717.0, 8641.5], [705.0, 8756.0], [707.0, 8026.0], [709.0, 8665.0], [711.0, 8497.0], [727.0, 8095.0], [725.0, 2055.0], [735.0, 8116.0], [721.0, 8140.0], [723.0, 8554.5], [733.0, 8016.0], [731.0, 8187.0], [729.0, 8969.0], [739.0, 5128.5], [737.0, 5292.0], [741.0, 8233.0], [743.0, 8019.0], [761.0, 7820.0], [765.0, 7568.0], [767.0, 7469.0], [747.0, 3078.5], [745.0, 8499.0], [749.0, 4607.0], [757.0, 7836.5], [755.0, 7699.0], [753.0, 7801.0], [759.0, 4994.0], [751.0, 5011.5], [769.0, 7257.0], [795.0, 7556.0], [775.0, 4438.5], [773.0, 7450.0], [793.0, 7427.0], [777.0, 7683.0], [781.0, 7787.0], [783.0, 3907.333333333333], [771.0, 8201.0], [785.0, 7527.0], [787.0, 7547.0], [789.0, 7225.0], [791.0, 7439.0], [797.0, 4911.0], [799.0, 7836.0], [801.0, 8090.0], [807.0, 4767.5], [805.0, 4907.0], [803.0, 7185.0], [813.0, 3825.333333333333], [811.0, 7640.0], [809.0, 7477.0], [815.0, 7006.0], [831.0, 4854.0], [829.0, 7976.0], [827.0, 7171.0], [825.0, 7401.0], [817.0, 3445.75], [819.0, 6398.333333333333], [821.0, 7638.0], [823.0, 7202.0], [833.0, 3320.25], [857.0, 4727.5], [847.0, 7320.0], [845.0, 7504.0], [837.0, 7592.0], [835.0, 7511.0], [839.0, 7156.0], [843.0, 4715.5], [841.0, 7507.0], [855.0, 3671.0], [853.0, 7477.0], [851.0, 7243.0], [849.0, 7343.0], [859.0, 1462.0], [861.0, 7373.0], [863.0, 4743.5], [889.0, 7519.0], [867.0, 7107.0], [869.0, 6934.0], [871.0, 7437.0], [891.0, 7782.0], [893.0, 7314.0], [895.0, 7452.0], [881.0, 6781.0], [873.0, 4799.0], [877.0, 7498.0], [879.0, 4380.5], [883.0, 4799.0], [887.0, 7542.0], [885.0, 7536.0], [899.0, 4401.0], [901.0, 4512.5], [897.0, 7693.0], [903.0, 4912.0], [905.0, 7273.0], [907.0, 7485.0], [909.0, 7479.0], [911.0, 3987.3333333333335], [913.0, 7358.0], [927.0, 7163.0], [915.0, 2893.416666666667], [921.0, 1476.0], [925.0, 2881.6363636363635], [923.0, 3278.0], [919.0, 3800.0], [917.0, 3704.333333333333], [931.0, 4685.5], [955.0, 4469.0], [929.0, 3582.0], [933.0, 8362.0], [935.0, 6702.0], [953.0, 7417.0], [943.0, 9299.0], [941.0, 7365.0], [939.0, 7330.0], [937.0, 7126.0], [959.0, 6938.0], [945.0, 7264.0], [947.0, 7029.0], [949.0, 7233.0], [951.0, 7234.0], [957.0, 7079.0], [975.0, 7504.0], [973.0, 7176.0], [971.0, 7309.0], [969.0, 6894.0], [961.0, 7325.0], [991.0, 8331.0], [977.0, 7301.0], [979.0, 7043.0], [983.0, 7154.5], [981.0, 6879.0], [989.0, 7252.0], [987.0, 7472.0], [985.0, 7066.0], [967.0, 6994.0], [965.0, 7507.0], [963.0, 6732.0], [1007.0, 7075.0], [1001.0, 7063.5], [1003.0, 4908.0], [1005.0, 6559.0], [993.0, 6326.0], [995.0, 7456.0], [997.0, 8210.0], [999.0, 7284.0], [1017.0, 6859.0], [1023.0, 7903.0], [1009.0, 6950.0], [1011.0, 6885.0], [1013.0, 6816.0], [1015.0, 7228.0], [1021.0, 7098.0], [1019.0, 6809.0], [1030.0, 7247.0], [1050.0, 4622.0], [1054.0, 4015.0], [1026.0, 7699.0], [1034.0, 6484.0], [1038.0, 7142.0], [1078.0, 3500.25], [1074.0, 6971.0], [1062.0, 3894.4], [1058.0, 6768.0], [1086.0, 6610.0], [1082.0, 6609.0], [1066.0, 4240.0], [1070.0, 4664.5], [1042.0, 7304.0], [1046.0, 7643.0], [1094.0, 3262.1666666666665], [1118.0, 3033.0], [1114.0, 3547.666666666667], [1110.0, 7002.0], [1106.0, 8451.0], [1090.0, 3986.666666666667], [1146.0, 6336.0], [1142.0, 7691.0], [1138.0, 6683.0], [1150.0, 4017.5], [1122.0, 4805.0], [1130.0, 3579.75], [1134.0, 4176.5], [1126.0, 6704.0], [1098.0, 3694.5], [1102.0, 7682.0], [1206.0, 4468.5], [1190.0, 3730.5], [1178.0, 4268.0], [1154.0, 6688.0], [1158.0, 6256.0], [1162.0, 6434.0], [1166.0, 6586.0], [1182.0, 4339.5], [1198.0, 3640.666666666667], [1194.0, 4375.5], [1186.0, 6894.0], [1214.0, 6354.0], [1210.0, 4773.5], [1202.0, 6448.0], [1170.0, 4855.0], [1174.0, 6251.0], [1226.0, 6251.0], [1222.0, 4954.5], [1270.0, 3609.666666666667], [1230.0, 6608.0], [1266.0, 6168.0], [1246.0, 7199.0], [1218.0, 6837.0], [1242.0, 6268.0], [1274.0, 3865.5], [1254.0, 4761.0], [1258.0, 5747.5], [1262.0, 7156.0], [1250.0, 6661.0], [1278.0, 6901.0], [1234.0, 3415.0], [1238.0, 6733.0], [1294.0, 4768.0], [1330.0, 7464.0], [1306.0, 4281.333333333333], [1310.0, 5682.0], [1290.0, 5312.0], [1286.0, 7710.0], [1282.0, 6047.0], [1342.0, 4632.5], [1338.0, 5984.0], [1314.0, 5079.0], [1318.0, 4543.5], [1322.0, 4973.5], [1326.0, 5972.0], [1298.0, 6443.0], [1302.0, 6126.0], [1358.0, 4259.0], [1350.0, 4117.5], [1354.0, 6039.0], [1346.0, 3750.0], [1374.0, 3852.333333333333], [1394.0, 6505.0], [1398.0, 4407.5], [1402.0, 3809.75], [1406.0, 6303.0], [1378.0, 6400.0], [1386.0, 5695.0], [1390.0, 6559.0], [1382.0, 4785.5], [1362.0, 7440.0], [1366.0, 4028.75], [1370.0, 6530.0], [1410.0, 5881.0], [1414.0, 4729.5], [1434.0, 3578.1666666666665], [1426.0, 5012.0], [1430.0, 5915.0], [1438.0, 5882.0], [1418.0, 4047.25], [1422.0, 4070.6666666666665], [1458.0, 5757.0], [1462.0, 6186.0], [1442.0, 5400.0], [1446.0, 5702.0], [1470.0, 5479.0], [1466.0, 4240.5], [1450.0, 4413.0], [1454.0, 6084.0], [1486.0, 5111.0], [1502.0, 5080.0], [1474.0, 5576.0], [1522.0, 4742.0], [1482.0, 5799.0], [1478.0, 5376.5], [1526.0, 4052.0], [1530.0, 4150.5], [1534.0, 4311.5], [1506.0, 4549.5], [1510.0, 5303.0], [1514.0, 5166.0], [1518.0, 5482.0], [1490.0, 3279.25], [1494.0, 4142.5], [1498.0, 4877.5], [1594.0, 4264.666666666667], [1558.0, 4325.5], [1542.0, 5734.0], [1538.0, 5420.0], [1566.0, 5663.0], [1598.0, 5227.0], [1570.0, 5048.0], [1590.0, 4042.5], [1586.0, 4135.666666666667], [1574.0, 4344.5], [1578.0, 3068.0], [1582.0, 5100.0], [1546.0, 4223.0], [1550.0, 5288.0], [1554.0, 5004.0], [1606.0, 4214.5], [1602.0, 4577.5], [1630.0, 4940.0], [1626.0, 5366.0], [1622.0, 4463.5], [1618.0, 5104.0], [1610.0, 4895.0], [1614.0, 4397.0], [1650.0, 5183.0], [1654.0, 4112.0], [1658.0, 4180.0], [1662.0, 4612.0], [1634.0, 4530.0], [1638.0, 5260.0], [1642.0, 6586.0], [1646.0, 5055.0], [1666.0, 4128.5], [1678.0, 4410.333333333333], [1690.0, 4000.3333333333335], [1686.0, 4827.0], [1694.0, 5416.0], [1670.0, 3740.5], [1674.0, 5778.0], [1682.0, 4502.0], [1706.0, 4947.0], [1702.0, 4999.0], [1698.0, 5046.0], [1726.0, 4434.0], [1714.0, 4681.0], [1718.0, 4867.0], [1722.0, 7246.0], [1710.0, 5021.5], [1730.0, 4895.0], [1742.0, 3734.0], [1758.0, 4759.0], [1750.0, 4696.0], [1754.0, 5640.0], [1746.0, 4987.666666666667], [1734.0, 4534.0], [1738.0, 4955.0], [1782.0, 4092.0], [1786.0, 4155.0], [1790.0, 5314.0], [1778.0, 4672.0], [1762.0, 4632.0], [1766.0, 4889.5], [1770.0, 4295.0], [1774.0, 4894.0], [1806.0, 5130.5], [1794.0, 4291.857142857143], [1802.0, 4089.0], [1798.0, 5441.0], [1842.0, 4362.0], [1850.0, 5519.0], [1846.0, 4330.0], [1854.0, 4647.333333333333], [1826.0, 5344.5], [1830.0, 4369.0], [1834.0, 5336.5], [1838.0, 4358.0], [1810.0, 5490.0], [1814.0, 5119.0], [1818.0, 4856.5], [1918.0, 4435.5], [1890.0, 4647.0], [1906.0, 4376.333333333333], [1910.0, 5555.0], [1914.0, 6546.5], [1894.0, 4934.0], [1898.0, 5289.0], [1902.0, 4887.5], [1870.0, 4199.666666666667], [1874.0, 3998.0], [1878.0, 4766.666666666667], [1886.0, 5509.333333333333], [1858.0, 4236.0], [1862.0, 4216.0], [1866.0, 4234.0], [1882.0, 4218.0], [1922.0, 4114.0], [1079.0, 6952.0], [1087.0, 4045.0], [1031.0, 4777.0], [1035.0, 6484.0], [1039.0, 7123.0], [1075.0, 6406.0], [1055.0, 4662.0], [1027.0, 7021.0], [1083.0, 4843.5], [1063.0, 4410.0], [1071.0, 4430.0], [1067.0, 6755.0], [1059.0, 6712.0], [1043.0, 4779.5], [1047.0, 4177.0], [1051.0, 6367.0], [1091.0, 4367.5], [1099.0, 2991.5714285714284], [1119.0, 4234.5], [1115.0, 3636.333333333333], [1111.0, 3274.75], [1107.0, 7132.0], [1095.0, 6942.0], [1143.0, 3355.25], [1139.0, 7237.0], [1103.0, 6762.0], [1147.0, 5378.5], [1123.0, 6306.0], [1151.0, 6514.0], [1127.0, 3525.25], [1131.0, 4204.5], [1135.0, 3602.0], [1163.0, 6395.0], [1159.0, 5214.0], [1171.0, 4430.5], [1155.0, 4462.5], [1183.0, 6173.0], [1179.0, 4547.0], [1167.0, 6742.0], [1195.0, 2687.0], [1199.0, 3377.0], [1187.0, 7504.0], [1191.0, 6516.0], [1215.0, 7890.0], [1211.0, 6279.0], [1207.0, 6277.0], [1203.0, 5676.5], [1175.0, 4168.333333333333], [1223.0, 3674.0], [1271.0, 4709.5], [1219.0, 6226.0], [1247.0, 6919.0], [1243.0, 4262.0], [1239.0, 5293.0], [1227.0, 4409.333333333333], [1267.0, 4859.0], [1231.0, 7271.0], [1279.0, 4430.0], [1275.0, 6662.0], [1251.0, 4398.5], [1263.0, 4512.0], [1259.0, 7166.0], [1255.0, 4377.75], [1235.0, 5067.666666666667], [1295.0, 6428.0], [1331.0, 4953.5], [1311.0, 4050.3333333333335], [1283.0, 4683.0], [1287.0, 5939.0], [1303.0, 4485.5], [1307.0, 4536.5], [1291.0, 3981.0], [1343.0, 7548.0], [1339.0, 6352.5], [1335.0, 6662.5], [1315.0, 4964.5], [1319.0, 4143.666666666667], [1323.0, 4304.5], [1327.0, 4210.0], [1299.0, 6281.0], [1355.0, 7300.0], [1375.0, 5193.5], [1351.0, 3536.5], [1347.0, 6015.5], [1359.0, 7386.0], [1395.0, 4368.0], [1399.0, 5955.0], [1407.0, 4935.666666666667], [1403.0, 6245.0], [1379.0, 4528.0], [1387.0, 6413.0], [1391.0, 6043.0], [1383.0, 3865.0], [1363.0, 6322.0], [1367.0, 6457.0], [1371.0, 4208.0], [1415.0, 5458.0], [1423.0, 4949.0], [1411.0, 6457.0], [1439.0, 5976.0], [1431.0, 5839.0], [1435.0, 6333.0], [1427.0, 3904.0], [1419.0, 4267.666666666667], [1463.0, 5984.0], [1467.0, 5962.0], [1471.0, 6076.0], [1459.0, 5543.0], [1443.0, 4478.0], [1447.0, 4420.0], [1455.0, 5536.0], [1451.0, 5659.0], [1483.0, 5715.0], [1491.0, 5644.0], [1495.0, 5850.0], [1479.0, 5742.0], [1487.0, 6755.0], [1523.0, 5589.0], [1531.0, 4082.5], [1527.0, 5379.5], [1515.0, 5526.0], [1519.0, 3854.5], [1507.0, 5178.0], [1511.0, 5605.0], [1535.0, 5948.0], [1499.0, 4026.5], [1503.0, 6634.0], [1475.0, 5306.0], [1543.0, 5683.0], [1547.0, 4505.0], [1567.0, 4803.5], [1539.0, 5064.0], [1563.0, 4089.5], [1559.0, 6435.0], [1599.0, 5546.0], [1591.0, 4387.333333333333], [1595.0, 5520.0], [1587.0, 4046.0], [1571.0, 4148.5], [1575.0, 5607.0], [1579.0, 5525.0], [1583.0, 4981.0], [1555.0, 6424.0], [1607.0, 3802.0], [1651.0, 6136.0], [1631.0, 4477.666666666667], [1627.0, 5368.0], [1619.0, 5351.0], [1623.0, 5337.0], [1603.0, 4826.0], [1611.0, 4902.0], [1615.0, 5129.0], [1655.0, 4704.0], [1663.0, 4053.3333333333335], [1659.0, 4746.0], [1635.0, 4814.5], [1639.0, 4730.0], [1647.0, 4915.0], [1643.0, 4524.0], [1667.0, 5804.0], [1671.0, 5689.0], [1687.0, 5121.0], [1691.0, 4837.0], [1695.0, 3856.5], [1675.0, 4606.5], [1683.0, 5095.0], [1679.0, 4135.5], [1707.0, 3959.0], [1703.0, 4995.0], [1699.0, 5044.0], [1727.0, 4872.0], [1715.0, 4769.5], [1719.0, 4923.0], [1723.0, 3998.0], [1711.0, 3956.5], [1739.0, 5527.0], [1735.0, 5327.5], [1731.0, 6281.0], [1751.0, 5581.0], [1755.0, 3895.5], [1747.0, 4389.4], [1743.0, 4692.75], [1783.0, 5673.0], [1787.0, 4511.0], [1791.0, 4580.0], [1779.0, 4144.0], [1763.0, 3809.2], [1767.0, 4685.0], [1771.0, 4798.5], [1775.0, 4135.333333333333], [1803.0, 4613.5], [1807.0, 4036.0], [1795.0, 5200.0], [1819.0, 4417.5], [1823.0, 4384.0], [1799.0, 5165.0], [1843.0, 4221.0], [1851.0, 3787.3333333333335], [1847.0, 4986.0], [1855.0, 4722.0], [1827.0, 4243.0], [1831.0, 4248.0], [1839.0, 4231.5], [1835.0, 4336.0], [1811.0, 4466.0], [1815.0, 5094.0], [1915.0, 4183.0], [1871.0, 4168.25], [1907.0, 4481.0], [1911.0, 4021.0], [1919.0, 5177.5], [1891.0, 4667.333333333333], [1895.0, 4056.0], [1899.0, 3831.3333333333335], [1903.0, 4852.5], [1875.0, 6671.0], [1879.0, 5349.0], [1887.0, 4170.0], [1859.0, 4915.0], [1863.0, 4989.0], [1867.0, 5592.0], [1883.0, 4277.0], [1923.0, 4775.0], [1.0, 10748.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1030.3996666666696, 5664.9763333333385]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1923.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 2722.0333333333333, "minX": 1.5495837E12, "maxY": 16496.85, "series": [{"data": [[1.5495837E12, 4500.35], [1.54958376E12, 16496.85]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495837E12, 2722.0333333333333], [1.54958376E12, 9977.966666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1961.2597200622088, "minX": 1.5495837E12, "maxY": 6675.366567670769, "series": [{"data": [[1.5495837E12, 1961.2597200622088], [1.54958376E12, 6675.366567670769]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958376E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1961.2472783825815, "minX": 1.5495837E12, "maxY": 6675.354688162929, "series": [{"data": [[1.5495837E12, 1961.2472783825815], [1.54958376E12, 6675.354688162929]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958376E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 49.91005515485785, "minX": 1.5495837E12, "maxY": 113.22395023328147, "series": [{"data": [[1.5495837E12, 113.22395023328147], [1.54958376E12, 49.91005515485785]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958376E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 195.0, "minX": 1.5495837E12, "maxY": 11115.0, "series": [{"data": [[1.5495837E12, 3884.0], [1.54958376E12, 11115.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495837E12, 195.0], [1.54958376E12, 2243.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495837E12, 3004.6], [1.54958376E12, 9318.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495837E12, 3706.5199999999936], [1.54958376E12, 10309.789999999995]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495837E12, 3292.6], [1.54958376E12, 9645.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 2055.0, "minX": 10.0, "maxY": 6712.0, "series": [{"data": [[39.0, 6712.0], [10.0, 2055.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 39.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 2055.0, "minX": 10.0, "maxY": 6712.0, "series": [{"data": [[39.0, 6712.0], [10.0, 2055.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 39.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 17.55, "minX": 1.5495837E12, "maxY": 32.45, "series": [{"data": [[1.5495837E12, 32.45], [1.54958376E12, 17.55]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 10.716666666666667, "minX": 1.5495837E12, "maxY": 39.28333333333333, "series": [{"data": [[1.5495837E12, 10.716666666666667], [1.54958376E12, 39.28333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 10.716666666666667, "minX": 1.5495837E12, "maxY": 39.28333333333333, "series": [{"data": [[1.5495837E12, 10.716666666666667], [1.54958376E12, 39.28333333333333]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958376E12, "title": "Transactions Per Second"}},
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
