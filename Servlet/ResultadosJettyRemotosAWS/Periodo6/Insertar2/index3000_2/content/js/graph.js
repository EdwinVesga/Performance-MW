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
        data: {"result": {"minY": 243.0, "minX": 0.0, "maxY": 11369.0, "series": [{"data": [[0.0, 243.0], [0.1, 274.0], [0.2, 318.0], [0.3, 331.0], [0.4, 340.0], [0.5, 348.0], [0.6, 356.0], [0.7, 363.0], [0.8, 371.0], [0.9, 380.0], [1.0, 391.0], [1.1, 401.0], [1.2, 403.0], [1.3, 413.0], [1.4, 419.0], [1.5, 430.0], [1.6, 433.0], [1.7, 436.0], [1.8, 450.0], [1.9, 453.0], [2.0, 463.0], [2.1, 465.0], [2.2, 481.0], [2.3, 495.0], [2.4, 511.0], [2.5, 517.0], [2.6, 526.0], [2.7, 537.0], [2.8, 542.0], [2.9, 559.0], [3.0, 570.0], [3.1, 590.0], [3.2, 606.0], [3.3, 629.0], [3.4, 632.0], [3.5, 639.0], [3.6, 647.0], [3.7, 664.0], [3.8, 686.0], [3.9, 713.0], [4.0, 726.0], [4.1, 746.0], [4.2, 765.0], [4.3, 767.0], [4.4, 770.0], [4.5, 783.0], [4.6, 806.0], [4.7, 824.0], [4.8, 833.0], [4.9, 852.0], [5.0, 860.0], [5.1, 867.0], [5.2, 888.0], [5.3, 920.0], [5.4, 931.0], [5.5, 938.0], [5.6, 946.0], [5.7, 954.0], [5.8, 974.0], [5.9, 985.0], [6.0, 1000.0], [6.1, 1018.0], [6.2, 1028.0], [6.3, 1048.0], [6.4, 1053.0], [6.5, 1069.0], [6.6, 1076.0], [6.7, 1101.0], [6.8, 1112.0], [6.9, 1118.0], [7.0, 1125.0], [7.1, 1132.0], [7.2, 1143.0], [7.3, 1159.0], [7.4, 1168.0], [7.5, 1185.0], [7.6, 1193.0], [7.7, 1198.0], [7.8, 1213.0], [7.9, 1233.0], [8.0, 1239.0], [8.1, 1266.0], [8.2, 1289.0], [8.3, 1298.0], [8.4, 1320.0], [8.5, 1323.0], [8.6, 1334.0], [8.7, 1362.0], [8.8, 1378.0], [8.9, 1387.0], [9.0, 1413.0], [9.1, 1441.0], [9.2, 1443.0], [9.3, 1463.0], [9.4, 1483.0], [9.5, 1488.0], [9.6, 1493.0], [9.7, 1517.0], [9.8, 1540.0], [9.9, 1547.0], [10.0, 1552.0], [10.1, 1556.0], [10.2, 1565.0], [10.3, 1569.0], [10.4, 1582.0], [10.5, 1594.0], [10.6, 1601.0], [10.7, 1618.0], [10.8, 1633.0], [10.9, 1656.0], [11.0, 1662.0], [11.1, 1672.0], [11.2, 1684.0], [11.3, 1688.0], [11.4, 1708.0], [11.5, 1732.0], [11.6, 1743.0], [11.7, 1754.0], [11.8, 1761.0], [11.9, 1765.0], [12.0, 1768.0], [12.1, 1779.0], [12.2, 1803.0], [12.3, 1813.0], [12.4, 1833.0], [12.5, 1841.0], [12.6, 1850.0], [12.7, 1876.0], [12.8, 1890.0], [12.9, 1914.0], [13.0, 1924.0], [13.1, 1930.0], [13.2, 1939.0], [13.3, 1963.0], [13.4, 1982.0], [13.5, 1984.0], [13.6, 2002.0], [13.7, 2015.0], [13.8, 2024.0], [13.9, 2036.0], [14.0, 2051.0], [14.1, 2067.0], [14.2, 2078.0], [14.3, 2096.0], [14.4, 2103.0], [14.5, 2118.0], [14.6, 2129.0], [14.7, 2168.0], [14.8, 2178.0], [14.9, 2187.0], [15.0, 2193.0], [15.1, 2206.0], [15.2, 2216.0], [15.3, 2221.0], [15.4, 2243.0], [15.5, 2256.0], [15.6, 2260.0], [15.7, 2281.0], [15.8, 2290.0], [15.9, 2311.0], [16.0, 2321.0], [16.1, 2344.0], [16.2, 2375.0], [16.3, 2396.0], [16.4, 2399.0], [16.5, 2419.0], [16.6, 2421.0], [16.7, 2436.0], [16.8, 2446.0], [16.9, 2455.0], [17.0, 2462.0], [17.1, 2465.0], [17.2, 2476.0], [17.3, 2502.0], [17.4, 2520.0], [17.5, 2533.0], [17.6, 2545.0], [17.7, 2555.0], [17.8, 2562.0], [17.9, 2568.0], [18.0, 2578.0], [18.1, 2582.0], [18.2, 2586.0], [18.3, 2590.0], [18.4, 2612.0], [18.5, 2642.0], [18.6, 2647.0], [18.7, 2657.0], [18.8, 2670.0], [18.9, 2691.0], [19.0, 2700.0], [19.1, 2705.0], [19.2, 2714.0], [19.3, 2729.0], [19.4, 2735.0], [19.5, 2742.0], [19.6, 2750.0], [19.7, 2756.0], [19.8, 2765.0], [19.9, 2782.0], [20.0, 2803.0], [20.1, 2808.0], [20.2, 2821.0], [20.3, 2825.0], [20.4, 2831.0], [20.5, 2833.0], [20.6, 2841.0], [20.7, 2851.0], [20.8, 2853.0], [20.9, 2864.0], [21.0, 2873.0], [21.1, 2877.0], [21.2, 2879.0], [21.3, 2883.0], [21.4, 2893.0], [21.5, 2896.0], [21.6, 2910.0], [21.7, 2915.0], [21.8, 2924.0], [21.9, 2927.0], [22.0, 2930.0], [22.1, 2941.0], [22.2, 2946.0], [22.3, 2948.0], [22.4, 2955.0], [22.5, 2963.0], [22.6, 2969.0], [22.7, 2977.0], [22.8, 2984.0], [22.9, 2993.0], [23.0, 2998.0], [23.1, 3018.0], [23.2, 3026.0], [23.3, 3030.0], [23.4, 3039.0], [23.5, 3042.0], [23.6, 3050.0], [23.7, 3055.0], [23.8, 3061.0], [23.9, 3064.0], [24.0, 3069.0], [24.1, 3072.0], [24.2, 3074.0], [24.3, 3078.0], [24.4, 3086.0], [24.5, 3094.0], [24.6, 3106.0], [24.7, 3113.0], [24.8, 3124.0], [24.9, 3131.0], [25.0, 3135.0], [25.1, 3142.0], [25.2, 3146.0], [25.3, 3150.0], [25.4, 3153.0], [25.5, 3162.0], [25.6, 3170.0], [25.7, 3174.0], [25.8, 3182.0], [25.9, 3193.0], [26.0, 3204.0], [26.1, 3208.0], [26.2, 3216.0], [26.3, 3224.0], [26.4, 3227.0], [26.5, 3232.0], [26.6, 3239.0], [26.7, 3240.0], [26.8, 3243.0], [26.9, 3248.0], [27.0, 3255.0], [27.1, 3259.0], [27.2, 3271.0], [27.3, 3279.0], [27.4, 3287.0], [27.5, 3296.0], [27.6, 3305.0], [27.7, 3309.0], [27.8, 3313.0], [27.9, 3319.0], [28.0, 3331.0], [28.1, 3342.0], [28.2, 3343.0], [28.3, 3346.0], [28.4, 3363.0], [28.5, 3367.0], [28.6, 3368.0], [28.7, 3374.0], [28.8, 3386.0], [28.9, 3390.0], [29.0, 3393.0], [29.1, 3398.0], [29.2, 3408.0], [29.3, 3418.0], [29.4, 3424.0], [29.5, 3430.0], [29.6, 3434.0], [29.7, 3441.0], [29.8, 3452.0], [29.9, 3462.0], [30.0, 3463.0], [30.1, 3467.0], [30.2, 3469.0], [30.3, 3475.0], [30.4, 3479.0], [30.5, 3492.0], [30.6, 3498.0], [30.7, 3502.0], [30.8, 3506.0], [30.9, 3510.0], [31.0, 3514.0], [31.1, 3522.0], [31.2, 3532.0], [31.3, 3539.0], [31.4, 3544.0], [31.5, 3547.0], [31.6, 3554.0], [31.7, 3557.0], [31.8, 3568.0], [31.9, 3569.0], [32.0, 3581.0], [32.1, 3593.0], [32.2, 3596.0], [32.3, 3599.0], [32.4, 3602.0], [32.5, 3612.0], [32.6, 3620.0], [32.7, 3625.0], [32.8, 3630.0], [32.9, 3646.0], [33.0, 3650.0], [33.1, 3661.0], [33.2, 3665.0], [33.3, 3673.0], [33.4, 3681.0], [33.5, 3692.0], [33.6, 3694.0], [33.7, 3695.0], [33.8, 3704.0], [33.9, 3718.0], [34.0, 3721.0], [34.1, 3734.0], [34.2, 3736.0], [34.3, 3737.0], [34.4, 3742.0], [34.5, 3747.0], [34.6, 3751.0], [34.7, 3756.0], [34.8, 3765.0], [34.9, 3769.0], [35.0, 3778.0], [35.1, 3782.0], [35.2, 3791.0], [35.3, 3794.0], [35.4, 3808.0], [35.5, 3813.0], [35.6, 3821.0], [35.7, 3845.0], [35.8, 3846.0], [35.9, 3850.0], [36.0, 3859.0], [36.1, 3869.0], [36.2, 3874.0], [36.3, 3885.0], [36.4, 3892.0], [36.5, 3894.0], [36.6, 3900.0], [36.7, 3907.0], [36.8, 3910.0], [36.9, 3920.0], [37.0, 3927.0], [37.1, 3932.0], [37.2, 3939.0], [37.3, 3940.0], [37.4, 3944.0], [37.5, 3950.0], [37.6, 3958.0], [37.7, 3972.0], [37.8, 3973.0], [37.9, 3979.0], [38.0, 3986.0], [38.1, 3993.0], [38.2, 4003.0], [38.3, 4005.0], [38.4, 4012.0], [38.5, 4015.0], [38.6, 4023.0], [38.7, 4032.0], [38.8, 4047.0], [38.9, 4052.0], [39.0, 4058.0], [39.1, 4061.0], [39.2, 4065.0], [39.3, 4069.0], [39.4, 4077.0], [39.5, 4084.0], [39.6, 4090.0], [39.7, 4091.0], [39.8, 4097.0], [39.9, 4109.0], [40.0, 4125.0], [40.1, 4127.0], [40.2, 4133.0], [40.3, 4141.0], [40.4, 4151.0], [40.5, 4153.0], [40.6, 4155.0], [40.7, 4157.0], [40.8, 4161.0], [40.9, 4167.0], [41.0, 4169.0], [41.1, 4171.0], [41.2, 4174.0], [41.3, 4181.0], [41.4, 4187.0], [41.5, 4193.0], [41.6, 4203.0], [41.7, 4206.0], [41.8, 4212.0], [41.9, 4220.0], [42.0, 4225.0], [42.1, 4233.0], [42.2, 4239.0], [42.3, 4253.0], [42.4, 4258.0], [42.5, 4266.0], [42.6, 4276.0], [42.7, 4287.0], [42.8, 4289.0], [42.9, 4291.0], [43.0, 4294.0], [43.1, 4305.0], [43.2, 4307.0], [43.3, 4312.0], [43.4, 4315.0], [43.5, 4317.0], [43.6, 4323.0], [43.7, 4326.0], [43.8, 4349.0], [43.9, 4353.0], [44.0, 4360.0], [44.1, 4364.0], [44.2, 4376.0], [44.3, 4379.0], [44.4, 4391.0], [44.5, 4402.0], [44.6, 4407.0], [44.7, 4418.0], [44.8, 4423.0], [44.9, 4439.0], [45.0, 4445.0], [45.1, 4450.0], [45.2, 4455.0], [45.3, 4462.0], [45.4, 4467.0], [45.5, 4472.0], [45.6, 4476.0], [45.7, 4485.0], [45.8, 4492.0], [45.9, 4499.0], [46.0, 4508.0], [46.1, 4519.0], [46.2, 4524.0], [46.3, 4529.0], [46.4, 4531.0], [46.5, 4542.0], [46.6, 4548.0], [46.7, 4549.0], [46.8, 4553.0], [46.9, 4557.0], [47.0, 4579.0], [47.1, 4592.0], [47.2, 4601.0], [47.3, 4611.0], [47.4, 4616.0], [47.5, 4621.0], [47.6, 4625.0], [47.7, 4628.0], [47.8, 4641.0], [47.9, 4649.0], [48.0, 4652.0], [48.1, 4656.0], [48.2, 4658.0], [48.3, 4674.0], [48.4, 4679.0], [48.5, 4691.0], [48.6, 4700.0], [48.7, 4709.0], [48.8, 4719.0], [48.9, 4722.0], [49.0, 4725.0], [49.1, 4731.0], [49.2, 4741.0], [49.3, 4752.0], [49.4, 4758.0], [49.5, 4770.0], [49.6, 4776.0], [49.7, 4786.0], [49.8, 4799.0], [49.9, 4811.0], [50.0, 4818.0], [50.1, 4829.0], [50.2, 4841.0], [50.3, 4863.0], [50.4, 4871.0], [50.5, 4880.0], [50.6, 4884.0], [50.7, 4898.0], [50.8, 4920.0], [50.9, 4933.0], [51.0, 4941.0], [51.1, 4961.0], [51.2, 4966.0], [51.3, 4974.0], [51.4, 4983.0], [51.5, 4991.0], [51.6, 5002.0], [51.7, 5008.0], [51.8, 5021.0], [51.9, 5033.0], [52.0, 5035.0], [52.1, 5046.0], [52.2, 5068.0], [52.3, 5080.0], [52.4, 5089.0], [52.5, 5100.0], [52.6, 5108.0], [52.7, 5116.0], [52.8, 5125.0], [52.9, 5130.0], [53.0, 5132.0], [53.1, 5143.0], [53.2, 5157.0], [53.3, 5166.0], [53.4, 5170.0], [53.5, 5178.0], [53.6, 5188.0], [53.7, 5191.0], [53.8, 5202.0], [53.9, 5210.0], [54.0, 5222.0], [54.1, 5227.0], [54.2, 5244.0], [54.3, 5246.0], [54.4, 5254.0], [54.5, 5265.0], [54.6, 5270.0], [54.7, 5278.0], [54.8, 5295.0], [54.9, 5300.0], [55.0, 5317.0], [55.1, 5321.0], [55.2, 5322.0], [55.3, 5334.0], [55.4, 5337.0], [55.5, 5345.0], [55.6, 5354.0], [55.7, 5361.0], [55.8, 5362.0], [55.9, 5365.0], [56.0, 5375.0], [56.1, 5386.0], [56.2, 5389.0], [56.3, 5398.0], [56.4, 5406.0], [56.5, 5438.0], [56.6, 5449.0], [56.7, 5456.0], [56.8, 5462.0], [56.9, 5472.0], [57.0, 5479.0], [57.1, 5482.0], [57.2, 5491.0], [57.3, 5497.0], [57.4, 5503.0], [57.5, 5521.0], [57.6, 5530.0], [57.7, 5533.0], [57.8, 5558.0], [57.9, 5570.0], [58.0, 5573.0], [58.1, 5587.0], [58.2, 5598.0], [58.3, 5611.0], [58.4, 5625.0], [58.5, 5633.0], [58.6, 5644.0], [58.7, 5662.0], [58.8, 5670.0], [58.9, 5673.0], [59.0, 5685.0], [59.1, 5689.0], [59.2, 5702.0], [59.3, 5720.0], [59.4, 5740.0], [59.5, 5753.0], [59.6, 5777.0], [59.7, 5799.0], [59.8, 5805.0], [59.9, 5825.0], [60.0, 5837.0], [60.1, 5866.0], [60.2, 5871.0], [60.3, 5898.0], [60.4, 5925.0], [60.5, 5945.0], [60.6, 5959.0], [60.7, 5965.0], [60.8, 5981.0], [60.9, 6010.0], [61.0, 6031.0], [61.1, 6043.0], [61.2, 6046.0], [61.3, 6057.0], [61.4, 6067.0], [61.5, 6091.0], [61.6, 6096.0], [61.7, 6112.0], [61.8, 6127.0], [61.9, 6138.0], [62.0, 6143.0], [62.1, 6154.0], [62.2, 6159.0], [62.3, 6163.0], [62.4, 6183.0], [62.5, 6193.0], [62.6, 6211.0], [62.7, 6218.0], [62.8, 6241.0], [62.9, 6270.0], [63.0, 6276.0], [63.1, 6294.0], [63.2, 6296.0], [63.3, 6310.0], [63.4, 6324.0], [63.5, 6345.0], [63.6, 6351.0], [63.7, 6361.0], [63.8, 6364.0], [63.9, 6369.0], [64.0, 6378.0], [64.1, 6381.0], [64.2, 6383.0], [64.3, 6395.0], [64.4, 6401.0], [64.5, 6411.0], [64.6, 6421.0], [64.7, 6426.0], [64.8, 6431.0], [64.9, 6441.0], [65.0, 6456.0], [65.1, 6464.0], [65.2, 6475.0], [65.3, 6487.0], [65.4, 6499.0], [65.5, 6515.0], [65.6, 6526.0], [65.7, 6545.0], [65.8, 6549.0], [65.9, 6562.0], [66.0, 6583.0], [66.1, 6600.0], [66.2, 6607.0], [66.3, 6619.0], [66.4, 6650.0], [66.5, 6655.0], [66.6, 6669.0], [66.7, 6680.0], [66.8, 6694.0], [66.9, 6707.0], [67.0, 6721.0], [67.1, 6732.0], [67.2, 6745.0], [67.3, 6753.0], [67.4, 6762.0], [67.5, 6771.0], [67.6, 6784.0], [67.7, 6791.0], [67.8, 6794.0], [67.9, 6806.0], [68.0, 6817.0], [68.1, 6823.0], [68.2, 6837.0], [68.3, 6842.0], [68.4, 6851.0], [68.5, 6853.0], [68.6, 6868.0], [68.7, 6880.0], [68.8, 6902.0], [68.9, 6914.0], [69.0, 6921.0], [69.1, 6931.0], [69.2, 6943.0], [69.3, 6962.0], [69.4, 6968.0], [69.5, 6974.0], [69.6, 6988.0], [69.7, 7002.0], [69.8, 7005.0], [69.9, 7016.0], [70.0, 7030.0], [70.1, 7042.0], [70.2, 7067.0], [70.3, 7079.0], [70.4, 7082.0], [70.5, 7101.0], [70.6, 7115.0], [70.7, 7121.0], [70.8, 7125.0], [70.9, 7130.0], [71.0, 7163.0], [71.1, 7168.0], [71.2, 7176.0], [71.3, 7186.0], [71.4, 7213.0], [71.5, 7222.0], [71.6, 7234.0], [71.7, 7247.0], [71.8, 7266.0], [71.9, 7278.0], [72.0, 7308.0], [72.1, 7327.0], [72.2, 7333.0], [72.3, 7355.0], [72.4, 7363.0], [72.5, 7367.0], [72.6, 7383.0], [72.7, 7401.0], [72.8, 7406.0], [72.9, 7416.0], [73.0, 7435.0], [73.1, 7450.0], [73.2, 7457.0], [73.3, 7472.0], [73.4, 7479.0], [73.5, 7483.0], [73.6, 7497.0], [73.7, 7511.0], [73.8, 7528.0], [73.9, 7533.0], [74.0, 7542.0], [74.1, 7545.0], [74.2, 7565.0], [74.3, 7571.0], [74.4, 7588.0], [74.5, 7610.0], [74.6, 7614.0], [74.7, 7626.0], [74.8, 7640.0], [74.9, 7641.0], [75.0, 7655.0], [75.1, 7674.0], [75.2, 7683.0], [75.3, 7696.0], [75.4, 7701.0], [75.5, 7704.0], [75.6, 7709.0], [75.7, 7713.0], [75.8, 7736.0], [75.9, 7750.0], [76.0, 7765.0], [76.1, 7780.0], [76.2, 7785.0], [76.3, 7819.0], [76.4, 7824.0], [76.5, 7843.0], [76.6, 7845.0], [76.7, 7861.0], [76.8, 7870.0], [76.9, 7874.0], [77.0, 7891.0], [77.1, 7895.0], [77.2, 7902.0], [77.3, 7911.0], [77.4, 7913.0], [77.5, 7932.0], [77.6, 7940.0], [77.7, 7948.0], [77.8, 7964.0], [77.9, 7974.0], [78.0, 7984.0], [78.1, 7993.0], [78.2, 7996.0], [78.3, 8003.0], [78.4, 8011.0], [78.5, 8020.0], [78.6, 8028.0], [78.7, 8033.0], [78.8, 8038.0], [78.9, 8045.0], [79.0, 8047.0], [79.1, 8058.0], [79.2, 8066.0], [79.3, 8069.0], [79.4, 8083.0], [79.5, 8088.0], [79.6, 8090.0], [79.7, 8099.0], [79.8, 8104.0], [79.9, 8112.0], [80.0, 8124.0], [80.1, 8131.0], [80.2, 8135.0], [80.3, 8138.0], [80.4, 8143.0], [80.5, 8151.0], [80.6, 8154.0], [80.7, 8159.0], [80.8, 8162.0], [80.9, 8166.0], [81.0, 8170.0], [81.1, 8172.0], [81.2, 8175.0], [81.3, 8181.0], [81.4, 8188.0], [81.5, 8192.0], [81.6, 8196.0], [81.7, 8204.0], [81.8, 8209.0], [81.9, 8212.0], [82.0, 8221.0], [82.1, 8227.0], [82.2, 8237.0], [82.3, 8240.0], [82.4, 8245.0], [82.5, 8247.0], [82.6, 8250.0], [82.7, 8253.0], [82.8, 8260.0], [82.9, 8264.0], [83.0, 8267.0], [83.1, 8270.0], [83.2, 8274.0], [83.3, 8281.0], [83.4, 8288.0], [83.5, 8296.0], [83.6, 8298.0], [83.7, 8305.0], [83.8, 8312.0], [83.9, 8317.0], [84.0, 8322.0], [84.1, 8326.0], [84.2, 8331.0], [84.3, 8342.0], [84.4, 8345.0], [84.5, 8347.0], [84.6, 8350.0], [84.7, 8359.0], [84.8, 8363.0], [84.9, 8365.0], [85.0, 8368.0], [85.1, 8371.0], [85.2, 8373.0], [85.3, 8375.0], [85.4, 8378.0], [85.5, 8383.0], [85.6, 8390.0], [85.7, 8391.0], [85.8, 8399.0], [85.9, 8408.0], [86.0, 8413.0], [86.1, 8422.0], [86.2, 8428.0], [86.3, 8436.0], [86.4, 8440.0], [86.5, 8445.0], [86.6, 8451.0], [86.7, 8456.0], [86.8, 8459.0], [86.9, 8463.0], [87.0, 8467.0], [87.1, 8473.0], [87.2, 8482.0], [87.3, 8485.0], [87.4, 8490.0], [87.5, 8504.0], [87.6, 8507.0], [87.7, 8511.0], [87.8, 8519.0], [87.9, 8532.0], [88.0, 8545.0], [88.1, 8551.0], [88.2, 8552.0], [88.3, 8557.0], [88.4, 8560.0], [88.5, 8562.0], [88.6, 8570.0], [88.7, 8576.0], [88.8, 8583.0], [88.9, 8589.0], [89.0, 8600.0], [89.1, 8601.0], [89.2, 8610.0], [89.3, 8618.0], [89.4, 8626.0], [89.5, 8630.0], [89.6, 8634.0], [89.7, 8640.0], [89.8, 8646.0], [89.9, 8655.0], [90.0, 8658.0], [90.1, 8665.0], [90.2, 8673.0], [90.3, 8689.0], [90.4, 8698.0], [90.5, 8705.0], [90.6, 8712.0], [90.7, 8725.0], [90.8, 8737.0], [90.9, 8751.0], [91.0, 8755.0], [91.1, 8756.0], [91.2, 8765.0], [91.3, 8769.0], [91.4, 8775.0], [91.5, 8783.0], [91.6, 8786.0], [91.7, 8794.0], [91.8, 8801.0], [91.9, 8811.0], [92.0, 8811.0], [92.1, 8815.0], [92.2, 8820.0], [92.3, 8823.0], [92.4, 8827.0], [92.5, 8838.0], [92.6, 8848.0], [92.7, 8856.0], [92.8, 8863.0], [92.9, 8871.0], [93.0, 8875.0], [93.1, 8877.0], [93.2, 8888.0], [93.3, 8892.0], [93.4, 8896.0], [93.5, 8901.0], [93.6, 8911.0], [93.7, 8916.0], [93.8, 8924.0], [93.9, 8930.0], [94.0, 8940.0], [94.1, 8945.0], [94.2, 8952.0], [94.3, 8963.0], [94.4, 8970.0], [94.5, 8983.0], [94.6, 9011.0], [94.7, 9024.0], [94.8, 9071.0], [94.9, 9079.0], [95.0, 9081.0], [95.1, 9091.0], [95.2, 9117.0], [95.3, 9140.0], [95.4, 9156.0], [95.5, 9193.0], [95.6, 9207.0], [95.7, 9224.0], [95.8, 9234.0], [95.9, 9263.0], [96.0, 9301.0], [96.1, 9317.0], [96.2, 9332.0], [96.3, 9351.0], [96.4, 9394.0], [96.5, 9408.0], [96.6, 9472.0], [96.7, 9486.0], [96.8, 9490.0], [96.9, 9517.0], [97.0, 9526.0], [97.1, 9556.0], [97.2, 9600.0], [97.3, 9620.0], [97.4, 9636.0], [97.5, 9657.0], [97.6, 9710.0], [97.7, 9736.0], [97.8, 9755.0], [97.9, 9793.0], [98.0, 9851.0], [98.1, 9863.0], [98.2, 9897.0], [98.3, 9921.0], [98.4, 9990.0], [98.5, 10039.0], [98.6, 10140.0], [98.7, 10172.0], [98.8, 10207.0], [98.9, 10244.0], [99.0, 10339.0], [99.1, 10428.0], [99.2, 10532.0], [99.3, 10607.0], [99.4, 10777.0], [99.5, 10894.0], [99.6, 10954.0], [99.7, 11057.0], [99.8, 11131.0], [99.9, 11216.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 66.0, "series": [{"data": [[200.0, 4.0], [300.0, 29.0], [400.0, 38.0], [500.0, 24.0], [600.0, 21.0], [700.0, 20.0], [800.0, 21.0], [900.0, 23.0], [1000.0, 21.0], [1100.0, 31.0], [1200.0, 18.0], [1300.0, 18.0], [1400.0, 22.0], [1500.0, 27.0], [1600.0, 25.0], [1700.0, 24.0], [1800.0, 20.0], [1900.0, 22.0], [2000.0, 22.0], [2100.0, 22.0], [2200.0, 24.0], [2300.0, 17.0], [2400.0, 25.0], [2500.0, 31.0], [2600.0, 20.0], [2800.0, 47.0], [2700.0, 29.0], [2900.0, 46.0], [3000.0, 45.0], [3100.0, 43.0], [3300.0, 49.0], [3200.0, 46.0], [3400.0, 45.0], [3500.0, 50.0], [3600.0, 42.0], [3700.0, 49.0], [3800.0, 37.0], [3900.0, 48.0], [4000.0, 49.0], [4100.0, 52.0], [4300.0, 43.0], [4200.0, 44.0], [4400.0, 44.0], [4500.0, 37.0], [4600.0, 43.0], [4800.0, 27.0], [4700.0, 38.0], [4900.0, 23.0], [5000.0, 29.0], [5100.0, 38.0], [5300.0, 45.0], [5200.0, 34.0], [5400.0, 29.0], [5500.0, 27.0], [5600.0, 29.0], [5800.0, 17.0], [5700.0, 17.0], [5900.0, 15.0], [6000.0, 24.0], [6100.0, 28.0], [6200.0, 20.0], [6300.0, 34.0], [6400.0, 33.0], [6500.0, 19.0], [6600.0, 22.0], [6700.0, 31.0], [6800.0, 28.0], [6900.0, 26.0], [7000.0, 25.0], [7100.0, 26.0], [7300.0, 21.0], [7400.0, 28.0], [7200.0, 19.0], [7500.0, 24.0], [7600.0, 29.0], [7700.0, 26.0], [7800.0, 28.0], [7900.0, 32.0], [8000.0, 45.0], [8100.0, 56.0], [8200.0, 61.0], [8300.0, 66.0], [8400.0, 48.0], [8500.0, 46.0], [8600.0, 43.0], [8700.0, 41.0], [8800.0, 50.0], [8900.0, 33.0], [9000.0, 17.0], [9100.0, 13.0], [9200.0, 13.0], [9300.0, 13.0], [9400.0, 13.0], [9500.0, 10.0], [9600.0, 10.0], [9700.0, 13.0], [9800.0, 8.0], [9900.0, 6.0], [10000.0, 4.0], [10100.0, 6.0], [10200.0, 6.0], [10300.0, 4.0], [10400.0, 2.0], [10500.0, 4.0], [10600.0, 2.0], [10700.0, 2.0], [10800.0, 3.0], [10900.0, 4.0], [11000.0, 3.0], [11100.0, 4.0], [11200.0, 2.0], [11300.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 11300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 71.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2710.0, "series": [{"data": [[1.0, 219.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 71.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2710.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 979.1456666666653, "minX": 1.54958328E12, "maxY": 979.1456666666653, "series": [{"data": [[1.54958328E12, 979.1456666666653]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958328E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 333.0, "minX": 1.0, "maxY": 11167.0, "series": [{"data": [[2.0, 8346.0], [3.0, 8643.0], [4.0, 8952.0], [5.0, 8574.0], [6.0, 8336.0], [7.0, 8351.0], [9.0, 8623.0], [10.0, 8823.0], [11.0, 8651.0], [12.0, 8808.0], [14.0, 8890.5], [15.0, 8863.0], [16.0, 8921.0], [18.0, 8588.5], [19.0, 8802.0], [20.0, 8445.0], [21.0, 8811.0], [22.0, 8436.0], [23.0, 8775.0], [25.0, 8621.0], [26.0, 8910.0], [27.0, 8312.0], [28.0, 8370.0], [29.0, 8773.0], [30.0, 8585.0], [31.0, 8298.0], [33.0, 8377.0], [32.0, 8622.0], [35.0, 8470.0], [34.0, 8457.0], [37.0, 8807.5], [39.0, 8823.0], [38.0, 8557.0], [41.0, 8772.0], [40.0, 8872.0], [43.0, 8371.0], [42.0, 8911.0], [45.0, 8510.0], [44.0, 8930.0], [47.0, 8456.0], [46.0, 8504.0], [49.0, 8765.0], [48.0, 8582.0], [51.0, 8541.0], [50.0, 8514.0], [52.0, 8876.0], [55.0, 8755.0], [54.0, 8684.0], [57.0, 8503.5], [59.0, 9755.0], [58.0, 8793.0], [61.0, 8436.0], [60.0, 8827.0], [63.0, 8855.0], [62.0, 8260.0], [67.0, 8722.0], [66.0, 9087.0], [65.0, 8574.0], [64.0, 8916.0], [71.0, 8522.0], [70.0, 8814.0], [69.0, 8348.0], [68.0, 8322.0], [75.0, 9736.0], [74.0, 8811.0], [73.0, 8347.0], [72.0, 8877.0], [79.0, 8947.0], [78.0, 8538.0], [77.0, 8370.0], [76.0, 8507.0], [83.0, 8786.0], [82.0, 8958.0], [81.0, 8559.5], [87.0, 8532.0], [86.0, 8385.0], [85.0, 8362.5], [89.0, 4627.5], [90.0, 8408.0], [88.0, 8312.0], [95.0, 4536.5], [94.0, 8343.0], [93.0, 8833.0], [92.0, 8705.5], [96.0, 333.0], [97.0, 5940.0], [99.0, 1682.3333333333333], [98.0, 2530.0], [100.0, 372.0], [103.0, 465.0], [102.0, 4502.5], [101.0, 6256.666666666667], [104.0, 1722.4166666666665], [105.0, 1467.5], [107.0, 1746.0], [106.0, 4379.0], [108.0, 461.5], [110.0, 3129.0], [109.0, 1559.5714285714287], [111.0, 8791.0], [115.0, 2476.25], [114.0, 4322.0], [113.0, 8428.0], [112.0, 8169.0], [116.0, 2065.8], [117.0, 2583.25], [119.0, 3169.6666666666665], [118.0, 8798.0], [120.0, 589.0], [121.0, 5984.333333333333], [123.0, 3180.3333333333335], [122.0, 8634.0], [127.0, 8655.0], [126.0, 8569.5], [124.0, 8697.0], [128.0, 4705.0], [135.0, 8170.0], [134.0, 8190.0], [133.0, 8398.0], [132.0, 8144.0], [131.0, 8213.0], [130.0, 8162.0], [129.0, 8705.0], [136.0, 4724.5], [137.0, 403.0], [141.0, 4664.0], [143.0, 8413.0], [142.0, 8349.0], [140.0, 8887.0], [138.0, 8257.5], [151.0, 8589.0], [150.0, 8221.0], [149.0, 8639.0], [148.0, 8424.0], [147.0, 8365.0], [146.0, 8587.0], [145.0, 8322.0], [153.0, 4505.5], [156.0, 4400.5], [159.0, 542.0], [158.0, 8950.0], [157.0, 8250.0], [155.0, 8185.0], [154.0, 8353.0], [152.0, 8258.0], [164.0, 3008.6666666666665], [163.0, 4174.5], [166.0, 4350.0], [167.0, 4502.0], [165.0, 8143.0], [162.0, 8453.0], [161.0, 8170.0], [160.0, 8929.0], [171.0, 5932.5], [175.0, 3104.6666666666665], [174.0, 3158.3333333333335], [173.0, 4512.0], [172.0, 8227.0], [170.0, 8299.0], [169.0, 8943.0], [168.0, 9636.0], [177.0, 4933.5], [179.0, 4570.0], [182.0, 528.0], [183.0, 8243.5], [181.0, 8825.0], [180.0, 9489.0], [178.0, 8673.0], [176.0, 9380.0], [191.0, 8843.0], [190.0, 8238.0], [189.0, 8278.0], [188.0, 8083.0], [187.0, 8173.0], [186.0, 8135.0], [185.0, 8065.0], [184.0, 8038.0], [199.0, 9486.0], [198.0, 9317.0], [197.0, 8175.0], [196.0, 9346.0], [195.0, 8610.0], [194.0, 8857.0], [193.0, 8756.0], [192.0, 8271.0], [200.0, 4377.5], [207.0, 8066.0], [206.0, 8664.0], [205.0, 8068.0], [204.0, 10988.0], [203.0, 8315.0], [202.0, 8888.0], [201.0, 8185.0], [211.0, 2122.6], [215.0, 8181.0], [214.0, 8514.0], [213.0, 8052.0], [212.0, 8204.0], [210.0, 8298.0], [209.0, 8963.0], [208.0, 8092.0], [223.0, 8212.0], [222.0, 8755.0], [221.0, 7964.0], [220.0, 9990.0], [219.0, 8090.0], [218.0, 8120.5], [216.0, 8085.0], [231.0, 8710.0], [230.0, 8192.0], [229.0, 8099.0], [228.0, 7988.0], [227.0, 8697.0], [226.0, 7940.0], [225.0, 9908.0], [224.0, 8482.0], [233.0, 5881.5], [234.0, 5165.5], [236.0, 2758.75], [239.0, 4325.0], [238.0, 8576.0], [237.0, 8580.0], [235.0, 8632.0], [232.0, 8045.0], [241.0, 4245.333333333334], [242.0, 2862.5], [243.0, 4347.0], [247.0, 9301.0], [246.0, 8552.0], [245.0, 8195.0], [244.0, 8618.0], [240.0, 8247.0], [251.0, 4916.0], [255.0, 5648.333333333333], [253.0, 8900.0], [252.0, 11167.0], [250.0, 8221.0], [249.0, 7975.0], [248.0, 8003.0], [270.0, 8445.0], [256.0, 4303.333333333334], [257.0, 8644.0], [259.0, 8560.0], [258.0, 8655.0], [263.0, 9640.0], [262.0, 9249.0], [260.0, 2568.0], [261.0, 4872.5], [265.0, 4350.5], [267.0, 8486.0], [266.0, 8463.0], [264.0, 4422.5], [271.0, 3244.3333333333335], [269.0, 8383.0], [268.0, 7894.0], [286.0, 8783.0], [273.0, 4310.5], [272.0, 4458.0], [279.0, 7941.0], [278.0, 8099.0], [277.0, 7951.0], [276.0, 8630.0], [287.0, 5794.0], [285.0, 5852.0], [284.0, 8134.0], [275.0, 11139.0], [274.0, 8646.0], [283.0, 8794.0], [282.0, 8451.0], [281.0, 8468.0], [280.0, 11123.0], [302.0, 3963.3333333333335], [303.0, 2131.0], [301.0, 4295.0], [300.0, 3892.6666666666665], [299.0, 4597.0], [298.0, 3172.0], [297.0, 3435.6666666666665], [296.0, 3156.3333333333335], [294.0, 4787.5], [293.0, 7969.0], [292.0, 8892.0], [295.0, 11072.0], [289.0, 7860.0], [288.0, 8931.0], [291.0, 8283.0], [290.0, 8466.0], [318.0, 7704.0], [304.0, 3200.3333333333335], [305.0, 5959.0], [307.0, 8658.0], [306.0, 9193.0], [311.0, 4975.0], [310.0, 9123.0], [309.0, 9517.0], [308.0, 8015.0], [312.0, 5563.5], [314.0, 4711.0], [313.0, 8737.0], [315.0, 8665.0], [319.0, 8209.0], [317.0, 8552.0], [316.0, 8459.0], [335.0, 8286.0], [322.0, 4129.666666666666], [321.0, 5035.5], [320.0, 8475.0], [327.0, 8290.0], [326.0, 8938.0], [325.0, 8166.0], [324.0, 7690.0], [328.0, 4269.5], [329.0, 8747.0], [334.0, 9207.0], [333.0, 8698.0], [332.0, 8242.0], [323.0, 9156.0], [331.0, 8201.0], [330.0, 9971.0], [350.0, 9446.0], [351.0, 9220.0], [349.0, 10954.0], [348.0, 8159.0], [347.0, 8485.0], [346.0, 8204.0], [345.0, 9418.0], [344.0, 8304.0], [343.0, 10932.0], [337.0, 8891.0], [336.0, 7717.0], [339.0, 9594.0], [338.0, 8916.0], [342.0, 9752.0], [341.0, 10944.0], [340.0, 8929.0], [366.0, 8924.0], [367.0, 8870.0], [365.0, 8266.0], [364.0, 8378.0], [363.0, 8889.0], [362.0, 8238.0], [361.0, 8450.0], [360.0, 8267.0], [359.0, 8600.0], [353.0, 7817.0], [352.0, 9620.0], [355.0, 7897.0], [354.0, 8626.0], [358.0, 8151.0], [357.0, 8162.0], [356.0, 8748.0], [382.0, 10777.0], [375.0, 3606.0], [376.0, 2379.714285714286], [374.0, 3517.3333333333335], [373.0, 8098.0], [372.0, 9080.0], [377.0, 3474.3333333333335], [383.0, 8502.0], [381.0, 7965.0], [380.0, 8272.0], [371.0, 7705.0], [370.0, 8326.0], [369.0, 7542.0], [368.0, 9332.0], [379.0, 8143.0], [378.0, 8179.0], [399.0, 9796.0], [385.0, 5300.5], [391.0, 9400.0], [384.0, 8640.0], [390.0, 10752.0], [389.0, 7984.0], [388.0, 8878.0], [394.0, 4833.0], [398.0, 8596.0], [397.0, 8088.0], [396.0, 8436.0], [387.0, 7640.0], [386.0, 9519.0], [395.0, 8559.0], [393.0, 9477.0], [392.0, 8240.0], [412.0, 5140.0], [408.0, 4797.0], [405.0, 4889.0], [404.0, 8134.0], [407.0, 8874.0], [401.0, 8104.0], [400.0, 8288.0], [403.0, 8359.0], [402.0, 8222.0], [406.0, 8181.0], [409.0, 4695.0], [414.0, 5001.0], [415.0, 8112.0], [413.0, 8169.0], [411.0, 8460.0], [410.0, 9863.0], [431.0, 4556.0], [425.0, 4449.0], [429.0, 5933.0], [430.0, 8811.0], [427.0, 8263.0], [426.0, 8473.0], [424.0, 9045.5], [422.0, 10621.0], [417.0, 10607.0], [416.0, 8817.0], [419.0, 9863.0], [418.0, 10428.0], [421.0, 9390.0], [420.0, 10580.0], [446.0, 8088.0], [441.0, 4771.0], [442.0, 4779.0], [447.0, 10248.0], [445.0, 10521.0], [444.0, 10200.0], [443.0, 8142.0], [440.0, 8326.0], [439.0, 8970.0], [433.0, 8545.0], [432.0, 9310.0], [435.0, 8672.0], [434.0, 8601.0], [438.0, 10541.0], [437.0, 10532.0], [436.0, 8626.0], [463.0, 8026.0], [451.0, 3510.3333333333335], [454.0, 1036.5], [453.0, 8204.0], [452.0, 8207.0], [456.0, 3712.0], [457.0, 8637.0], [455.0, 5693.333333333333], [448.0, 8368.0], [450.0, 10237.0], [449.0, 8564.0], [462.0, 8391.0], [461.0, 8909.0], [460.0, 8163.0], [459.0, 8601.0], [458.0, 9702.0], [478.0, 6568.0], [467.0, 4092.0], [466.0, 7626.0], [465.0, 8253.0], [464.0, 9515.0], [468.0, 4503.0], [470.0, 8698.0], [471.0, 1200.5], [479.0, 7845.0], [476.0, 7898.0], [475.0, 8485.0], [474.0, 8945.0], [473.0, 9517.0], [472.0, 9807.0], [492.0, 2328.333333333333], [484.0, 2995.75], [483.0, 4675.0], [482.0, 7932.0], [481.0, 8131.0], [480.0, 9227.0], [487.0, 7087.0], [486.0, 9620.0], [485.0, 3332.6666666666665], [491.0, 4881.0], [493.0, 5362.5], [494.0, 4650.0], [495.0, 10144.0], [489.0, 9472.0], [488.0, 8600.0], [490.0, 10324.0], [510.0, 8331.0], [504.0, 5196.5], [506.0, 5242.0], [511.0, 9296.0], [509.0, 8837.0], [508.0, 7843.0], [507.0, 8777.0], [505.0, 7215.0], [503.0, 10221.0], [497.0, 8160.0], [496.0, 8237.0], [499.0, 9080.0], [498.0, 8069.0], [502.0, 8480.0], [501.0, 7924.0], [500.0, 10207.0], [514.0, 4937.0], [512.0, 5379.5], [516.0, 10169.0], [518.0, 3456.6666666666665], [520.0, 5664.0], [524.0, 8268.0], [526.0, 8277.0], [530.0, 4275.5], [532.0, 7713.0], [534.0, 8058.0], [528.0, 8020.0], [542.0, 9198.0], [540.0, 7406.0], [538.0, 10039.0], [536.0, 7640.0], [546.0, 7917.0], [568.0, 4643.5], [550.0, 7641.0], [548.0, 8816.0], [552.0, 8270.0], [554.0, 8767.0], [544.0, 8731.0], [558.0, 9865.0], [566.0, 3366.3333333333335], [564.0, 8323.0], [574.0, 4521.0], [572.0, 9870.0], [570.0, 9629.0], [560.0, 7688.0], [562.0, 7613.0], [578.0, 3633.6666666666665], [582.0, 4515.0], [576.0, 7905.0], [590.0, 8488.0], [588.0, 9496.0], [586.0, 7605.0], [584.0, 7709.0], [580.0, 5697.5], [600.0, 9763.0], [594.0, 8865.0], [596.0, 9065.0], [592.0, 4804.5], [598.0, 9768.0], [602.0, 3375.75], [604.0, 8121.5], [606.0, 8043.0], [614.0, 2925.75], [632.0, 3891.3333333333335], [636.0, 6198.0], [634.0, 9317.0], [638.0, 7614.0], [612.0, 7107.0], [610.0, 8928.0], [616.0, 5472.5], [618.0, 7528.0], [608.0, 7942.0], [624.0, 4553.5], [626.0, 9490.0], [630.0, 8504.0], [628.0, 8028.0], [622.0, 2907.75], [620.0, 7321.0], [642.0, 5313.0], [646.0, 4070.5], [640.0, 7278.0], [652.0, 4263.5], [650.0, 7479.0], [654.0, 7119.0], [644.0, 4959.0], [648.0, 4528.0], [664.0, 7366.0], [666.0, 7567.0], [668.0, 5030.0], [670.0, 7678.0], [658.0, 7638.5], [656.0, 9408.0], [662.0, 9478.0], [660.0, 9394.0], [674.0, 8112.0], [684.0, 5550.0], [676.0, 3682.333333333333], [672.0, 7882.5], [686.0, 7061.0], [678.0, 3475.0], [680.0, 4180.5], [690.0, 4159.0], [700.0, 4507.5], [688.0, 7176.0], [702.0, 8046.0], [698.0, 4437.5], [696.0, 7445.0], [694.0, 6703.0], [692.0, 4562.0], [682.0, 2740.4], [704.0, 9207.0], [730.0, 2202.0], [712.0, 3935.0], [714.0, 9234.0], [716.0, 3856.3333333333335], [720.0, 4674.0], [726.0, 7707.0], [724.0, 7588.0], [706.0, 7042.0], [708.0, 8165.0], [710.0, 7115.0], [718.0, 6745.0], [728.0, 8826.0], [732.0, 2669.8], [734.0, 1484.3333333333335], [738.0, 5131.5], [760.0, 5104.5], [736.0, 3307.333333333333], [750.0, 6762.0], [740.0, 3588.333333333333], [742.0, 8378.0], [746.0, 7671.0], [744.0, 7025.0], [748.0, 4098.0], [756.0, 7379.0], [754.0, 6655.0], [764.0, 7279.0], [762.0, 7421.0], [752.0, 6950.0], [766.0, 6781.0], [758.0, 7168.0], [772.0, 5589.5], [792.0, 2296.0], [782.0, 3215.666666666667], [774.0, 4302.0], [794.0, 7132.0], [796.0, 8897.0], [798.0, 6370.0], [778.0, 4083.5], [776.0, 4866.5], [780.0, 3628.25], [784.0, 4509.5], [786.0, 3717.333333333333], [788.0, 5508.0], [790.0, 3518.75], [768.0, 6583.0], [770.0, 7893.0], [804.0, 3163.2], [800.0, 2987.5], [814.0, 7001.0], [802.0, 3826.0], [806.0, 4972.0], [824.0, 2980.8333333333335], [830.0, 4392.0], [816.0, 8758.0], [828.0, 5422.5], [826.0, 8700.0], [822.0, 2972.0], [820.0, 6741.0], [818.0, 8720.0], [808.0, 3991.0], [810.0, 8753.0], [812.0, 4828.0], [836.0, 4379.0], [834.0, 4174.0], [832.0, 6292.0], [846.0, 8467.0], [838.0, 8628.0], [840.0, 3327.666666666667], [852.0, 3601.25], [850.0, 6519.5], [848.0, 6968.0], [854.0, 6148.0], [862.0, 7179.0], [860.0, 7484.0], [858.0, 7475.0], [856.0, 8550.0], [842.0, 5595.5], [844.0, 4678.5], [892.0, 7005.0], [880.0, 8422.0], [882.0, 7167.0], [884.0, 7127.0], [894.0, 8320.0], [890.0, 6860.0], [888.0, 7327.0], [864.0, 6735.0], [866.0, 6540.0], [870.0, 7497.0], [878.0, 6324.0], [876.0, 7225.0], [874.0, 6793.0], [872.0, 6049.0], [886.0, 8196.0], [926.0, 4423.5], [922.0, 5648.0], [918.0, 3112.1111111111113], [912.0, 7331.5], [914.0, 7511.0], [916.0, 6832.0], [924.0, 6988.0], [920.0, 6431.0], [900.0, 6351.0], [898.0, 7335.0], [896.0, 7996.0], [910.0, 5929.0], [908.0, 8136.0], [906.0, 6842.0], [904.0, 6837.0], [944.0, 3861.0], [940.0, 3998.666666666667], [942.0, 3663.6], [948.0, 5232.5], [950.0, 7785.0], [946.0, 3796.333333333333], [958.0, 7016.0], [956.0, 6096.0], [954.0, 7826.0], [952.0, 5957.0], [934.0, 7453.0], [932.0, 6401.0], [930.0, 6918.0], [928.0, 6384.0], [938.0, 4218.666666666667], [936.0, 2655.78947368421], [988.0, 6213.5], [990.0, 7938.0], [976.0, 6655.0], [978.0, 6274.0], [980.0, 7571.0], [986.0, 7538.0], [984.0, 6771.0], [966.0, 6551.0], [964.0, 6755.0], [962.0, 5947.0], [960.0, 6322.0], [974.0, 6562.0], [972.0, 5799.0], [970.0, 7315.0], [968.0, 6732.0], [982.0, 6270.0], [1020.0, 6211.0], [1008.0, 7702.0], [1010.0, 7479.0], [1012.0, 6087.0], [1022.0, 6471.0], [1018.0, 7750.0], [1016.0, 6629.0], [992.0, 7902.0], [994.0, 5925.0], [996.0, 6706.0], [998.0, 7698.0], [1006.0, 7655.0], [1004.0, 6183.0], [1002.0, 6729.0], [1000.0, 5472.0], [1014.0, 5345.0], [1080.0, 7466.0], [1056.0, 7234.0], [1060.0, 6447.0], [1064.0, 5662.0], [1084.0, 7119.0], [1076.0, 5845.0], [1072.0, 6669.0], [1024.0, 5634.0], [1028.0, 6562.0], [1032.0, 6707.0], [1036.0, 5981.0], [1052.0, 5388.0], [1048.0, 6078.0], [1044.0, 6096.0], [1040.0, 7703.0], [1068.0, 7435.0], [1144.0, 6525.5], [1120.0, 6301.0], [1124.0, 7005.0], [1128.0, 5673.0], [1148.0, 7125.0], [1140.0, 5965.0], [1136.0, 6057.0], [1088.0, 6295.0], [1092.0, 5080.0], [1100.0, 6050.0], [1116.0, 4941.0], [1112.0, 5115.0], [1108.0, 6433.0], [1104.0, 5366.0], [1132.0, 5406.0], [1184.0, 6910.0], [1192.0, 3204.6153846153843], [1196.0, 3366.571428571429], [1188.0, 6897.0], [1212.0, 4098.5], [1208.0, 3478.8333333333335], [1204.0, 3502.5], [1200.0, 4075.3333333333335], [1164.0, 5361.0], [1160.0, 7082.0], [1156.0, 6748.0], [1152.0, 5558.0], [1180.0, 6561.0], [1176.0, 7002.0], [1172.0, 6104.0], [1168.0, 5890.0], [1224.0, 6757.0], [1240.0, 3286.0], [1216.0, 6793.0], [1220.0, 5573.0], [1244.0, 6676.0], [1228.0, 3338.5], [1268.0, 5130.0], [1264.0, 6218.0], [1272.0, 5122.0], [1248.0, 3741.5], [1276.0, 4710.0], [1252.0, 3936.0], [1260.0, 6575.0], [1256.0, 5033.0], [1232.0, 6730.0], [1236.0, 4946.0], [1284.0, 5166.0], [1288.0, 4764.0], [1280.0, 4012.0], [1304.0, 6304.0], [1300.0, 6376.0], [1296.0, 4722.0], [1308.0, 4608.0], [1292.0, 3185.8571428571427], [1328.0, 4019.0], [1332.0, 6382.0], [1336.0, 5087.0], [1316.0, 4776.0], [1312.0, 6363.0], [1320.0, 4880.0], [1324.0, 6415.0], [1340.0, 6062.5], [1356.0, 3570.0], [1400.0, 3783.5], [1372.0, 3489.75], [1344.0, 5399.0], [1348.0, 5686.0], [1352.0, 4991.0], [1376.0, 4754.5], [1380.0, 5224.0], [1404.0, 3498.3333333333335], [1392.0, 3756.5], [1396.0, 4495.0], [1388.0, 5305.0], [1384.0, 4407.0], [1360.0, 3733.0], [1364.0, 3609.5], [1368.0, 4445.0], [1416.0, 4361.0], [1460.0, 3995.0], [1432.0, 4709.0], [1436.0, 3499.0], [1428.0, 4208.0], [1412.0, 4889.5], [1408.0, 6061.0], [1420.0, 4548.0], [1456.0, 3699.0], [1468.0, 5143.0], [1464.0, 4556.0], [1440.0, 4069.0], [1444.0, 4689.0], [1448.0, 5227.0], [1452.0, 4360.0], [1424.0, 3787.5], [1472.0, 5128.5], [1484.0, 2588.0], [1520.0, 4307.0], [1524.0, 4085.6666666666665], [1528.0, 4839.0], [1532.0, 4323.0], [1496.0, 4459.0], [1492.0, 3755.0], [1488.0, 5083.0], [1500.0, 4625.5], [1476.0, 4190.0], [1480.0, 5125.0], [1504.0, 4188.0], [1508.0, 3658.6], [1512.0, 4411.5], [1516.0, 3929.75], [1544.0, 3677.0], [1540.0, 3506.25], [1536.0, 5598.0], [1564.0, 4628.0], [1556.0, 5386.0], [1552.0, 4200.0], [1548.0, 5503.0], [1568.0, 4658.0], [1592.0, 4084.0], [1596.0, 3667.0], [1584.0, 5615.0], [1588.0, 5147.0], [1576.0, 4179.25], [1572.0, 5511.0], [1580.0, 3860.0], [1608.0, 3078.3333333333335], [1620.0, 4620.0], [1600.0, 3942.0], [1628.0, 3661.0], [1624.0, 3532.0], [1612.0, 4441.0], [1648.0, 4031.5], [1652.0, 4258.0], [1656.0, 5000.0], [1632.0, 4302.0], [1636.0, 4360.0], [1644.0, 4047.0], [1640.0, 3687.0], [1616.0, 4698.5], [1720.0, 4343.0], [1668.0, 3351.5], [1664.0, 4920.0], [1692.0, 5167.0], [1688.0, 3584.0], [1684.0, 4899.0], [1696.0, 3932.5], [1700.0, 4535.0], [1724.0, 3359.3333333333335], [1712.0, 3279.0], [1676.0, 4155.0], [1716.0, 4523.0], [1704.0, 3839.0], [1708.0, 5337.0], [1680.0, 3953.4], [1732.0, 3828.2], [1776.0, 4379.666666666667], [1728.0, 3180.0], [1756.0, 3987.0], [1752.0, 4018.25], [1748.0, 3074.0], [1744.0, 4508.5], [1736.0, 4539.5], [1780.0, 3844.3333333333335], [1788.0, 5132.0], [1784.0, 4357.333333333333], [1760.0, 4414.75], [1768.0, 4378.5], [1772.0, 4266.0], [1764.0, 4295.25], [1740.0, 4106.666666666667], [1796.0, 4544.0], [1792.0, 2815.0], [1800.0, 3062.0], [1820.0, 3997.6666666666665], [1816.0, 4016.5], [1828.0, 4131.714285714285], [1832.0, 3456.5], [1824.0, 3429.0], [1804.0, 2993.0], [1808.0, 4134.0], [1812.0, 3768.6666666666665], [1081.0, 5244.0], [1057.0, 5662.0], [1061.0, 5960.0], [1065.0, 5170.0], [1085.0, 7483.0], [1077.0, 5625.0], [1073.0, 6441.0], [1025.0, 6974.0], [1029.0, 7765.0], [1033.0, 6123.0], [1037.0, 6841.0], [1053.0, 5246.0], [1049.0, 5566.0], [1045.0, 6850.0], [1069.0, 5248.0], [1145.0, 6046.0], [1149.0, 7047.0], [1121.0, 4829.0], [1125.0, 6112.0], [1129.0, 5051.0], [1141.0, 7009.0], [1137.0, 5685.0], [1101.0, 5474.0], [1097.0, 6661.5], [1093.0, 7401.0], [1089.0, 6605.0], [1117.0, 7079.0], [1113.0, 5130.0], [1109.0, 5543.0], [1105.0, 7003.0], [1133.0, 5438.0], [1213.0, 3337.8], [1209.0, 3271.6666666666665], [1193.0, 3312.5000000000005], [1197.0, 3243.4], [1185.0, 6157.0], [1189.0, 6849.0], [1205.0, 4398.0], [1201.0, 4132.0], [1153.0, 5436.0], [1157.0, 6044.0], [1161.0, 7082.0], [1165.0, 6880.0], [1181.0, 5297.0], [1177.0, 6968.0], [1173.0, 6823.0], [1169.0, 5446.0], [1225.0, 2573.0], [1217.0, 5795.0], [1221.0, 6786.0], [1241.0, 3692.5], [1237.0, 6689.0], [1245.0, 5270.0], [1229.0, 6750.0], [1277.0, 5744.0], [1273.0, 3329.4], [1269.0, 4254.0], [1265.0, 4195.0], [1249.0, 4100.0], [1253.0, 4157.5], [1257.0, 3754.5], [1261.0, 4792.5], [1233.0, 4767.5], [1281.0, 4298.5], [1293.0, 4201.0], [1309.0, 4092.0], [1301.0, 4743.0], [1297.0, 5472.0], [1305.0, 5070.0], [1285.0, 4420.5], [1289.0, 5159.0], [1329.0, 5116.0], [1333.0, 6031.0], [1337.0, 3414.3333333333335], [1313.0, 5386.0], [1341.0, 6269.0], [1317.0, 4576.5], [1321.0, 4730.0], [1325.0, 6401.0], [1349.0, 5959.0], [1365.0, 3606.5], [1353.0, 6154.0], [1373.0, 3807.0], [1345.0, 5278.0], [1369.0, 4029.3333333333335], [1357.0, 3578.8], [1393.0, 6067.0], [1397.0, 4307.0], [1401.0, 4679.0], [1405.0, 5157.0], [1381.0, 5354.0], [1377.0, 4700.0], [1385.0, 5503.0], [1389.0, 4035.6666666666665], [1361.0, 3577.0], [1457.0, 3719.3333333333335], [1461.0, 4921.0], [1417.0, 3773.0], [1413.0, 4088.5], [1409.0, 4356.0], [1437.0, 4131.333333333333], [1421.0, 3527.6], [1469.0, 3643.6666666666665], [1441.0, 4065.0], [1445.0, 4592.0], [1449.0, 4566.0], [1465.0, 5191.0], [1453.0, 3514.6], [1433.0, 4322.0], [1429.0, 5354.0], [1425.0, 2972.0], [1501.0, 3979.0], [1481.0, 3745.5], [1525.0, 4405.0], [1485.0, 3916.5], [1521.0, 3649.6666666666665], [1529.0, 4291.0], [1493.0, 3554.75], [1489.0, 4649.0], [1497.0, 4089.5], [1473.0, 4580.0], [1477.0, 4084.0], [1505.0, 4952.0], [1509.0, 5633.0], [1513.0, 3636.5], [1517.0, 4228.0], [1545.0, 4245.5], [1549.0, 4292.0], [1537.0, 4312.0], [1565.0, 3392.5], [1561.0, 3679.5], [1557.0, 5275.0], [1553.0, 4725.0], [1541.0, 4123.0], [1569.0, 4020.3333333333335], [1597.0, 4185.5], [1593.0, 3853.0], [1585.0, 3913.5], [1589.0, 4290.5], [1573.0, 4003.0], [1581.0, 5168.0], [1577.0, 3818.5], [1609.0, 5335.0], [1601.0, 4433.333333333333], [1629.0, 4242.0], [1625.0, 3776.6666666666665], [1621.0, 5321.0], [1605.0, 4173.5], [1613.0, 3850.0], [1653.0, 4743.0], [1657.0, 3701.0], [1661.0, 3800.0], [1649.0, 3984.0], [1633.0, 3650.0], [1645.0, 4303.0], [1641.0, 4811.0], [1637.0, 4054.0], [1617.0, 3675.0], [1713.0, 3462.0], [1669.0, 4263.333333333333], [1665.0, 2915.0], [1693.0, 4199.0], [1689.0, 3835.9999999999995], [1685.0, 3908.6666666666665], [1697.0, 3595.0], [1725.0, 4755.0], [1721.0, 3701.25], [1677.0, 4799.0], [1717.0, 4235.333333333333], [1701.0, 4496.5], [1705.0, 3813.3333333333335], [1709.0, 4622.0], [1673.0, 4858.5], [1681.0, 3682.2], [1729.0, 4039.5], [1733.0, 4102.666666666667], [1757.0, 4036.0], [1753.0, 3913.571428571429], [1749.0, 4137.0], [1745.0, 3433.5], [1737.0, 4264.0], [1741.0, 3715.8], [1777.0, 3659.6666666666665], [1781.0, 3422.0], [1785.0, 3330.5], [1789.0, 4833.0], [1761.0, 4021.5], [1765.0, 4514.333333333333], [1769.0, 3632.6666666666665], [1773.0, 4455.25], [1793.0, 4455.0], [1813.0, 4330.0], [1797.0, 4772.0], [1821.0, 2949.0], [1817.0, 4280.0], [1829.0, 4720.0], [1833.0, 4533.0], [1825.0, 5357.0], [1805.0, 3799.0], [1809.0, 4883.0], [515.0, 3352.6666666666665], [539.0, 7559.0], [513.0, 7843.0], [517.0, 8485.0], [521.0, 10140.0], [523.0, 9088.5], [525.0, 4607.0], [527.0, 3369.0], [531.0, 4689.5], [533.0, 10065.0], [535.0, 8941.0], [529.0, 4817.5], [543.0, 10017.0], [541.0, 8246.0], [537.0, 8296.0], [519.0, 8250.0], [545.0, 7906.0], [547.0, 5045.0], [551.0, 4591.5], [549.0, 9011.0], [553.0, 4502.5], [555.0, 4415.5], [559.0, 7520.0], [557.0, 9798.5], [563.0, 5682.0], [567.0, 8549.0], [565.0, 5744.0], [573.0, 8047.0], [571.0, 7525.0], [569.0, 9897.0], [575.0, 4424.0], [561.0, 9534.0], [579.0, 5422.5], [577.0, 9736.0], [591.0, 7368.0], [589.0, 9726.0], [587.0, 8583.0], [585.0, 8968.0], [581.0, 8342.0], [583.0, 4389.0], [601.0, 4288.0], [593.0, 5157.0], [597.0, 7555.0], [599.0, 4183.0], [603.0, 1404.0], [605.0, 5053.0], [607.0, 7472.0], [611.0, 7545.0], [609.0, 4857.0], [615.0, 3616.0], [633.0, 9600.0], [637.0, 8248.0], [639.0, 7895.0], [613.0, 4952.0], [617.0, 7881.0], [619.0, 4777.0], [623.0, 3783.6666666666665], [625.0, 4704.0], [627.0, 5377.0], [631.0, 3274.6666666666665], [629.0, 9637.0], [621.0, 4367.5], [641.0, 5101.5], [651.0, 9556.0], [653.0, 7533.0], [655.0, 9180.0], [643.0, 2812.75], [645.0, 3733.6666666666665], [647.0, 5087.5], [665.0, 8033.0], [667.0, 9084.0], [669.0, 7213.0], [659.0, 4598.0], [663.0, 4444.5], [661.0, 7528.0], [649.0, 4925.0], [677.0, 3185.25], [679.0, 4819.0], [675.0, 7480.0], [673.0, 8367.0], [687.0, 4249.666666666666], [685.0, 8189.0], [691.0, 3451.0], [699.0, 2908.6], [701.0, 4951.5], [703.0, 4153.0], [689.0, 8507.0], [697.0, 8993.0], [693.0, 4889.0], [695.0, 4776.0], [681.0, 4075.5], [683.0, 3271.75], [721.0, 8359.0], [713.0, 6943.0], [715.0, 8975.0], [727.0, 7443.0], [725.0, 7218.0], [723.0, 8692.5], [719.0, 4710.0], [705.0, 7067.0], [707.0, 8029.0], [709.0, 7222.0], [711.0, 9018.0], [717.0, 7107.0], [729.0, 9077.0], [731.0, 7321.5], [733.0, 2921.0], [735.0, 3956.2], [739.0, 9100.0], [737.0, 7079.0], [751.0, 6464.0], [749.0, 6433.0], [741.0, 8711.0], [743.0, 7138.0], [747.0, 5649.0], [745.0, 9071.0], [753.0, 4741.0], [757.0, 5177.0], [755.0, 8289.0], [765.0, 3523.0], [763.0, 8754.0], [761.0, 8796.0], [767.0, 7042.0], [759.0, 3781.666666666667], [773.0, 6963.0], [771.0, 4853.0], [775.0, 6651.0], [793.0, 3531.8571428571427], [795.0, 7163.0], [797.0, 8856.0], [799.0, 4001.0], [779.0, 3072.25], [777.0, 3076.0], [781.0, 3309.75], [787.0, 4701.0], [789.0, 3773.0], [791.0, 3766.666666666667], [785.0, 5470.0], [783.0, 5095.5], [769.0, 7278.0], [805.0, 3440.666666666667], [801.0, 3899.333333333333], [815.0, 5002.0], [803.0, 3882.0], [807.0, 8814.0], [829.0, 3722.333333333333], [831.0, 7475.0], [827.0, 8347.0], [825.0, 6492.0], [817.0, 5011.0], [821.0, 4596.5], [819.0, 7765.0], [823.0, 4159.666666666666], [809.0, 6378.0], [811.0, 8751.0], [813.0, 4780.5], [837.0, 3996.0], [839.0, 4883.0], [833.0, 5130.5], [847.0, 6782.0], [835.0, 4130.0], [841.0, 6369.0], [851.0, 7247.0], [853.0, 7266.0], [855.0, 8587.0], [863.0, 8374.0], [861.0, 6274.0], [859.0, 8551.0], [857.0, 7178.0], [843.0, 7657.0], [845.0, 4317.0], [893.0, 6853.0], [895.0, 6037.0], [881.0, 6768.0], [883.0, 7610.0], [885.0, 6091.0], [891.0, 6500.0], [889.0, 8362.0], [879.0, 8456.0], [865.0, 6138.0], [869.0, 6496.0], [867.0, 7543.0], [871.0, 6310.0], [877.0, 6091.0], [875.0, 6295.0], [887.0, 7543.0], [923.0, 5318.5], [927.0, 4826.5], [913.0, 6188.0], [915.0, 7256.0], [917.0, 5749.0], [925.0, 7213.0], [903.0, 6799.5], [901.0, 7067.0], [899.0, 8314.0], [897.0, 6455.0], [909.0, 7505.0], [907.0, 5753.0], [905.0, 8310.0], [919.0, 8267.0], [945.0, 6965.0], [953.0, 7780.0], [941.0, 3351.8], [949.0, 6035.0], [951.0, 7823.0], [947.0, 3895.0], [943.0, 4606.0], [957.0, 6183.0], [955.0, 6004.0], [935.0, 6367.0], [933.0, 6765.0], [931.0, 6521.0], [929.0, 7329.0], [939.0, 2707.8], [937.0, 5558.5], [985.0, 6345.0], [991.0, 6851.0], [977.0, 6824.0], [979.0, 6352.0], [981.0, 6933.0], [989.0, 7912.0], [967.0, 7868.0], [965.0, 8037.0], [963.0, 5822.0], [961.0, 7030.0], [975.0, 5667.0], [973.0, 5739.0], [971.0, 6363.0], [983.0, 7744.0], [1021.0, 6969.0], [1023.0, 6475.0], [1009.0, 6837.0], [1011.0, 6127.0], [1013.0, 5777.0], [1019.0, 5867.0], [1017.0, 6610.0], [1007.0, 6163.0], [993.0, 5625.0], [995.0, 7186.0], [997.0, 7861.0], [999.0, 5825.0], [1005.0, 6012.0], [1003.0, 6322.0], [1001.0, 6257.0], [1015.0, 5691.0], [1082.0, 5670.0], [1086.0, 6417.0], [1058.0, 6921.0], [1062.0, 5945.0], [1066.0, 7384.0], [1078.0, 5702.0], [1074.0, 6676.0], [1054.0, 7610.0], [1026.0, 5866.0], [1030.0, 6006.0], [1034.0, 6395.0], [1038.0, 7683.0], [1050.0, 6607.0], [1046.0, 7674.0], [1042.0, 6244.5], [1070.0, 6148.0], [1146.0, 7090.0], [1150.0, 5637.0], [1122.0, 6338.0], [1126.0, 5300.0], [1130.0, 6241.0], [1142.0, 5317.0], [1138.0, 6159.0], [1118.0, 5533.0], [1090.0, 5111.0], [1098.0, 7355.0], [1094.0, 7406.0], [1102.0, 6658.0], [1114.0, 5680.0], [1110.0, 5524.0], [1106.0, 6110.0], [1134.0, 5827.0], [1186.0, 6796.0], [1210.0, 3342.3333333333335], [1198.0, 3477.8], [1194.0, 3347.5], [1190.0, 2877.0], [1214.0, 3617.0], [1206.0, 3434.142857142857], [1202.0, 3705.0], [1166.0, 6806.0], [1162.0, 6240.0], [1154.0, 5811.0], [1182.0, 5543.0], [1178.0, 5449.0], [1174.0, 5456.0], [1170.0, 5142.0], [1226.0, 4988.0], [1274.0, 3671.0], [1246.0, 5501.0], [1218.0, 6784.0], [1222.0, 6791.0], [1242.0, 5188.0], [1230.0, 6753.0], [1270.0, 5704.0], [1250.0, 6515.0], [1278.0, 5587.0], [1262.0, 4160.5], [1258.0, 6603.0], [1254.0, 5740.0], [1234.0, 4897.0], [1238.0, 5894.0], [1286.0, 4938.0], [1334.0, 6399.0], [1282.0, 6463.0], [1310.0, 4580.0], [1306.0, 4247.5], [1302.0, 6331.0], [1298.0, 6355.0], [1290.0, 5035.0], [1338.0, 3604.25], [1294.0, 6065.0], [1330.0, 5720.0], [1318.0, 4166.333333333333], [1314.0, 6201.0], [1326.0, 6030.0], [1342.0, 6382.0], [1350.0, 5106.0], [1370.0, 3391.3333333333335], [1358.0, 5693.0], [1374.0, 4820.0], [1346.0, 5046.0], [1354.0, 6122.0], [1378.0, 5521.0], [1406.0, 4351.0], [1402.0, 4611.0], [1398.0, 5479.0], [1382.0, 4919.5], [1390.0, 5481.0], [1386.0, 6463.0], [1362.0, 3836.0], [1366.0, 5651.0], [1414.0, 5322.0], [1438.0, 3548.5], [1430.0, 4780.0], [1434.0, 4107.333333333333], [1418.0, 4334.333333333333], [1410.0, 6383.0], [1422.0, 4315.0], [1458.0, 3591.0], [1462.0, 4322.0], [1466.0, 4067.0], [1470.0, 4167.5], [1442.0, 3790.0], [1446.0, 4499.0], [1450.0, 4473.0], [1454.0, 4056.5], [1426.0, 4361.666666666667], [1482.0, 5130.0], [1474.0, 4447.0], [1486.0, 5805.0], [1522.0, 4181.0], [1530.0, 4173.0], [1526.0, 3629.0], [1534.0, 4235.5], [1494.0, 3765.0], [1490.0, 4130.0], [1498.0, 4233.0], [1478.0, 5905.0], [1502.0, 5530.0], [1506.0, 4925.0], [1510.0, 4471.0], [1514.0, 5497.0], [1518.0, 3546.6666666666665], [1538.0, 4167.0], [1542.0, 5334.0], [1566.0, 4600.0], [1562.0, 3958.25], [1558.0, 4522.5], [1554.0, 5213.0], [1546.0, 3896.5], [1550.0, 4754.0], [1570.0, 4658.0], [1598.0, 3987.0], [1594.0, 4529.0], [1590.0, 3543.0], [1586.0, 4579.0], [1578.0, 3420.3333333333335], [1582.0, 5477.0], [1610.0, 4119.5], [1606.0, 3800.0], [1602.0, 4737.0], [1630.0, 3509.0], [1626.0, 4375.0], [1622.0, 4267.0], [1614.0, 3448.3333333333335], [1650.0, 3723.0], [1654.0, 5611.0], [1658.0, 3343.5], [1662.0, 3185.0], [1638.0, 4287.5], [1646.0, 3405.0], [1642.0, 4326.0], [1618.0, 3960.5], [1718.0, 3517.0], [1670.0, 3889.6666666666665], [1666.0, 4195.0], [1694.0, 3694.0], [1686.0, 3500.0], [1690.0, 3764.3333333333335], [1698.0, 4722.0], [1726.0, 4653.0], [1722.0, 4126.5], [1714.0, 3990.0], [1678.0, 4723.0], [1702.0, 5066.0], [1710.0, 4656.0], [1674.0, 3859.0], [1682.0, 3800.6666666666665], [1730.0, 3983.8], [1758.0, 4356.166666666666], [1754.0, 3709.8749999999995], [1750.0, 4752.0], [1746.0, 3308.0], [1734.0, 4656.0], [1738.0, 3670.0], [1742.0, 3977.0], [1778.0, 3911.857142857143], [1782.0, 3227.0], [1790.0, 4097.0], [1786.0, 4338.5], [1762.0, 4133.333333333333], [1766.0, 3883.6666666666665], [1770.0, 3957.0], [1774.0, 2811.5], [1798.0, 4556.0], [1794.0, 4349.0], [1802.0, 4254.0], [1822.0, 4418.0], [1818.0, 4169.0], [1814.0, 3154.5], [1806.0, 3697.75], [1830.0, 2876.0], [1834.0, 4450.0], [1826.0, 3823.25], [1810.0, 4137.5], [1083.0, 7463.0], [1087.0, 6481.0], [1059.0, 5343.0], [1063.0, 7272.0], [1067.0, 5871.0], [1079.0, 5379.0], [1075.0, 7530.0], [1055.0, 7610.0], [1031.0, 7367.0], [1035.0, 7724.0], [1039.0, 5801.0], [1051.0, 6127.0], [1047.0, 7641.0], [1043.0, 7408.0], [1071.0, 7533.0], [1139.0, 6212.0], [1151.0, 5673.0], [1123.0, 5334.0], [1127.0, 6294.0], [1131.0, 6931.0], [1147.0, 5089.0], [1103.0, 5578.0], [1099.0, 6588.0], [1095.0, 5621.0], [1091.0, 5377.0], [1119.0, 7123.0], [1115.0, 6199.0], [1111.0, 5002.0], [1107.0, 5601.0], [1135.0, 5268.0], [1187.0, 6161.0], [1199.0, 3737.0], [1195.0, 3432.2], [1191.0, 3903.7499999999995], [1215.0, 6794.0], [1211.0, 3325.0], [1207.0, 3307.8333333333335], [1203.0, 3693.3333333333335], [1183.0, 6225.0], [1155.0, 6923.0], [1159.0, 6422.5], [1163.0, 5486.0], [1167.0, 6791.0], [1179.0, 5689.0], [1175.0, 5500.0], [1171.0, 5686.0], [1223.0, 3720.3333333333335], [1231.0, 4456.5], [1219.0, 4932.0], [1247.0, 4221.5], [1239.0, 5042.0], [1243.0, 6158.0], [1227.0, 6806.0], [1275.0, 4956.0], [1279.0, 6132.0], [1271.0, 4434.5], [1267.0, 4915.333333333333], [1251.0, 5837.0], [1255.0, 5008.0], [1259.0, 6381.0], [1263.0, 5210.0], [1235.0, 4941.5], [1287.0, 3131.0], [1311.0, 3535.0], [1303.0, 4722.5], [1299.0, 5033.0], [1307.0, 6424.0], [1283.0, 5482.0], [1291.0, 4138.0], [1295.0, 6323.0], [1331.0, 5322.0], [1335.0, 5255.0], [1343.0, 4816.5], [1315.0, 5562.0], [1319.0, 4054.5], [1323.0, 5647.5], [1327.0, 6404.0], [1351.0, 5234.0], [1367.0, 5606.0], [1355.0, 3791.125], [1375.0, 3982.0], [1347.0, 6400.0], [1371.0, 3323.6], [1407.0, 4133.5], [1395.0, 3525.4285714285716], [1359.0, 5329.0], [1399.0, 4652.0], [1403.0, 4349.0], [1383.0, 3644.0], [1379.0, 5295.0], [1387.0, 3410.833333333333], [1391.0, 5484.0], [1363.0, 5369.0], [1419.0, 4728.0], [1415.0, 5179.0], [1411.0, 3185.0], [1439.0, 4382.0], [1423.0, 4507.0], [1459.0, 3799.8], [1463.0, 4310.0], [1443.0, 4486.0], [1447.0, 5222.0], [1451.0, 4321.0], [1467.0, 5965.0], [1455.0, 4641.0], [1427.0, 3126.0], [1435.0, 5008.0], [1431.0, 4485.0], [1487.0, 4090.0], [1483.0, 4508.0], [1523.0, 4288.0], [1531.0, 4017.5], [1527.0, 4674.0], [1535.0, 4151.333333333333], [1495.0, 4758.5], [1491.0, 5799.0], [1499.0, 5004.0], [1503.0, 4317.0], [1475.0, 4545.0], [1479.0, 3822.0], [1507.0, 3596.0], [1511.0, 2955.0], [1519.0, 5867.0], [1539.0, 4171.0], [1551.0, 3738.5], [1563.0, 3499.0], [1567.0, 4090.0], [1555.0, 3813.0], [1559.0, 4238.5], [1543.0, 3598.0], [1547.0, 4262.5], [1599.0, 3814.5], [1595.0, 5202.0], [1591.0, 4468.333333333333], [1587.0, 3599.0], [1571.0, 4638.5], [1575.0, 4570.0], [1579.0, 3961.0], [1583.0, 4721.0], [1603.0, 3813.0], [1631.0, 4974.0], [1627.0, 3945.5], [1623.0, 3567.6666666666665], [1607.0, 5248.0], [1611.0, 3894.0], [1615.0, 3734.0], [1651.0, 4176.5], [1655.0, 4236.0], [1659.0, 4225.0], [1663.0, 3553.0], [1635.0, 5027.0], [1639.0, 3594.5], [1643.0, 3660.0], [1647.0, 4877.0], [1619.0, 4885.0], [1667.0, 4144.0], [1671.0, 3775.3333333333335], [1691.0, 4966.0], [1695.0, 4360.25], [1687.0, 3620.0], [1683.0, 3622.0], [1675.0, 3640.25], [1699.0, 4625.0], [1727.0, 3441.0], [1719.0, 4413.0], [1715.0, 4204.5], [1679.0, 5000.0], [1703.0, 4619.0], [1707.0, 4095.3333333333335], [1711.0, 3801.5], [1743.0, 4763.0], [1731.0, 4211.75], [1759.0, 3740.0], [1755.0, 4177.833333333334], [1751.0, 4360.0], [1747.0, 3740.0], [1779.0, 3769.0], [1783.0, 4300.5], [1787.0, 3960.6666666666665], [1791.0, 4035.0], [1763.0, 4237.0], [1767.0, 4012.75], [1771.0, 4168.0], [1775.0, 2884.5], [1739.0, 4598.0], [1795.0, 4272.0], [1819.0, 4123.75], [1803.0, 3924.0], [1799.0, 4154.0], [1823.0, 3810.0], [1815.0, 4631.333333333333], [1831.0, 3950.0], [1827.0, 4297.666666666667], [1807.0, 4306.0], [1811.0, 4178.4], [1.0, 8981.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[979.1456666666653, 5154.346]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1834.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12700.0, "minX": 1.54958328E12, "maxY": 20997.266666666666, "series": [{"data": [[1.54958328E12, 20997.266666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958328E12, 12700.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958328E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 5154.346, "minX": 1.54958328E12, "maxY": 5154.346, "series": [{"data": [[1.54958328E12, 5154.346]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958328E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 5154.33366666667, "minX": 1.54958328E12, "maxY": 5154.33366666667, "series": [{"data": [[1.54958328E12, 5154.33366666667]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958328E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 117.03399999999986, "minX": 1.54958328E12, "maxY": 117.03399999999986, "series": [{"data": [[1.54958328E12, 117.03399999999986]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958328E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 243.0, "minX": 1.54958328E12, "maxY": 11369.0, "series": [{"data": [[1.54958328E12, 11369.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958328E12, 243.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958328E12, 8657.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958328E12, 10338.849999999997]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958328E12, 9080.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958328E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4819.0, "minX": 50.0, "maxY": 4819.0, "series": [{"data": [[50.0, 4819.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4819.0, "minX": 50.0, "maxY": 4819.0, "series": [{"data": [[50.0, 4819.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958328E12, "maxY": 50.0, "series": [{"data": [[1.54958328E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958328E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958328E12, "maxY": 50.0, "series": [{"data": [[1.54958328E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958328E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958328E12, "maxY": 50.0, "series": [{"data": [[1.54958328E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958328E12, "title": "Transactions Per Second"}},
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
