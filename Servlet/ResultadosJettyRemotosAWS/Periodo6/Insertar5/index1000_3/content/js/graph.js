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
        data: {"result": {"minY": 220.0, "minX": 0.0, "maxY": 6957.0, "series": [{"data": [[0.0, 220.0], [0.1, 223.0], [0.2, 230.0], [0.3, 230.0], [0.4, 236.0], [0.5, 245.0], [0.6, 247.0], [0.7, 257.0], [0.8, 259.0], [0.9, 262.0], [1.0, 263.0], [1.1, 276.0], [1.2, 277.0], [1.3, 277.0], [1.4, 281.0], [1.5, 282.0], [1.6, 282.0], [1.7, 289.0], [1.8, 290.0], [1.9, 290.0], [2.0, 295.0], [2.1, 299.0], [2.2, 303.0], [2.3, 303.0], [2.4, 304.0], [2.5, 304.0], [2.6, 305.0], [2.7, 306.0], [2.8, 307.0], [2.9, 308.0], [3.0, 310.0], [3.1, 310.0], [3.2, 311.0], [3.3, 321.0], [3.4, 321.0], [3.5, 321.0], [3.6, 325.0], [3.7, 326.0], [3.8, 332.0], [3.9, 335.0], [4.0, 336.0], [4.1, 337.0], [4.2, 344.0], [4.3, 345.0], [4.4, 345.0], [4.5, 352.0], [4.6, 361.0], [4.7, 362.0], [4.8, 366.0], [4.9, 375.0], [5.0, 380.0], [5.1, 384.0], [5.2, 385.0], [5.3, 397.0], [5.4, 401.0], [5.5, 408.0], [5.6, 409.0], [5.7, 415.0], [5.8, 421.0], [5.9, 423.0], [6.0, 425.0], [6.1, 425.0], [6.2, 437.0], [6.3, 439.0], [6.4, 445.0], [6.5, 447.0], [6.6, 448.0], [6.7, 459.0], [6.8, 466.0], [6.9, 467.0], [7.0, 468.0], [7.1, 469.0], [7.2, 482.0], [7.3, 482.0], [7.4, 498.0], [7.5, 498.0], [7.6, 500.0], [7.7, 509.0], [7.8, 512.0], [7.9, 513.0], [8.0, 524.0], [8.1, 534.0], [8.2, 543.0], [8.3, 568.0], [8.4, 572.0], [8.5, 576.0], [8.6, 578.0], [8.7, 580.0], [8.8, 582.0], [8.9, 596.0], [9.0, 599.0], [9.1, 610.0], [9.2, 617.0], [9.3, 623.0], [9.4, 628.0], [9.5, 651.0], [9.6, 657.0], [9.7, 672.0], [9.8, 685.0], [9.9, 697.0], [10.0, 701.0], [10.1, 706.0], [10.2, 706.0], [10.3, 706.0], [10.4, 723.0], [10.5, 727.0], [10.6, 738.0], [10.7, 744.0], [10.8, 751.0], [10.9, 765.0], [11.0, 774.0], [11.1, 779.0], [11.2, 780.0], [11.3, 782.0], [11.4, 787.0], [11.5, 793.0], [11.6, 798.0], [11.7, 805.0], [11.8, 828.0], [11.9, 830.0], [12.0, 839.0], [12.1, 852.0], [12.2, 866.0], [12.3, 876.0], [12.4, 886.0], [12.5, 890.0], [12.6, 898.0], [12.7, 902.0], [12.8, 914.0], [12.9, 916.0], [13.0, 917.0], [13.1, 959.0], [13.2, 965.0], [13.3, 978.0], [13.4, 984.0], [13.5, 1003.0], [13.6, 1061.0], [13.7, 1075.0], [13.8, 1160.0], [13.9, 1353.0], [14.0, 1432.0], [14.1, 1469.0], [14.2, 1537.0], [14.3, 1577.0], [14.4, 1607.0], [14.5, 1608.0], [14.6, 1610.0], [14.7, 1635.0], [14.8, 1637.0], [14.9, 1643.0], [15.0, 1645.0], [15.1, 1668.0], [15.2, 1702.0], [15.3, 1712.0], [15.4, 1741.0], [15.5, 1743.0], [15.6, 1752.0], [15.7, 1754.0], [15.8, 1762.0], [15.9, 1767.0], [16.0, 1795.0], [16.1, 1796.0], [16.2, 1806.0], [16.3, 1814.0], [16.4, 1818.0], [16.5, 1830.0], [16.6, 1834.0], [16.7, 1841.0], [16.8, 1849.0], [16.9, 1869.0], [17.0, 1871.0], [17.1, 1878.0], [17.2, 1887.0], [17.3, 1906.0], [17.4, 1912.0], [17.5, 1915.0], [17.6, 1919.0], [17.7, 1927.0], [17.8, 1932.0], [17.9, 1932.0], [18.0, 1938.0], [18.1, 1940.0], [18.2, 1974.0], [18.3, 1992.0], [18.4, 2071.0], [18.5, 2073.0], [18.6, 2094.0], [18.7, 2131.0], [18.8, 2157.0], [18.9, 2157.0], [19.0, 2168.0], [19.1, 2191.0], [19.2, 2240.0], [19.3, 2272.0], [19.4, 2283.0], [19.5, 2283.0], [19.6, 2286.0], [19.7, 2316.0], [19.8, 2317.0], [19.9, 2363.0], [20.0, 2380.0], [20.1, 2391.0], [20.2, 2405.0], [20.3, 2427.0], [20.4, 2431.0], [20.5, 2445.0], [20.6, 2449.0], [20.7, 2457.0], [20.8, 2491.0], [20.9, 2505.0], [21.0, 2512.0], [21.1, 2512.0], [21.2, 2522.0], [21.3, 2531.0], [21.4, 2538.0], [21.5, 2538.0], [21.6, 2544.0], [21.7, 2545.0], [21.8, 2550.0], [21.9, 2569.0], [22.0, 2571.0], [22.1, 2574.0], [22.2, 2579.0], [22.3, 2587.0], [22.4, 2617.0], [22.5, 2661.0], [22.6, 2667.0], [22.7, 2678.0], [22.8, 2685.0], [22.9, 2687.0], [23.0, 2698.0], [23.1, 2708.0], [23.2, 2712.0], [23.3, 2717.0], [23.4, 2728.0], [23.5, 2753.0], [23.6, 2756.0], [23.7, 2775.0], [23.8, 2795.0], [23.9, 2811.0], [24.0, 2816.0], [24.1, 2816.0], [24.2, 2876.0], [24.3, 2879.0], [24.4, 2883.0], [24.5, 2909.0], [24.6, 2910.0], [24.7, 2916.0], [24.8, 2917.0], [24.9, 2924.0], [25.0, 2931.0], [25.1, 2939.0], [25.2, 2955.0], [25.3, 2970.0], [25.4, 2979.0], [25.5, 3007.0], [25.6, 3018.0], [25.7, 3021.0], [25.8, 3024.0], [25.9, 3025.0], [26.0, 3037.0], [26.1, 3044.0], [26.2, 3066.0], [26.3, 3097.0], [26.4, 3101.0], [26.5, 3101.0], [26.6, 3110.0], [26.7, 3132.0], [26.8, 3134.0], [26.9, 3140.0], [27.0, 3140.0], [27.1, 3141.0], [27.2, 3159.0], [27.3, 3160.0], [27.4, 3162.0], [27.5, 3165.0], [27.6, 3188.0], [27.7, 3191.0], [27.8, 3203.0], [27.9, 3207.0], [28.0, 3218.0], [28.1, 3219.0], [28.2, 3230.0], [28.3, 3239.0], [28.4, 3240.0], [28.5, 3244.0], [28.6, 3246.0], [28.7, 3249.0], [28.8, 3260.0], [28.9, 3269.0], [29.0, 3280.0], [29.1, 3284.0], [29.2, 3285.0], [29.3, 3294.0], [29.4, 3312.0], [29.5, 3316.0], [29.6, 3316.0], [29.7, 3325.0], [29.8, 3337.0], [29.9, 3344.0], [30.0, 3350.0], [30.1, 3385.0], [30.2, 3399.0], [30.3, 3403.0], [30.4, 3413.0], [30.5, 3424.0], [30.6, 3426.0], [30.7, 3427.0], [30.8, 3448.0], [30.9, 3457.0], [31.0, 3459.0], [31.1, 3463.0], [31.2, 3480.0], [31.3, 3485.0], [31.4, 3487.0], [31.5, 3487.0], [31.6, 3487.0], [31.7, 3488.0], [31.8, 3488.0], [31.9, 3490.0], [32.0, 3491.0], [32.1, 3495.0], [32.2, 3496.0], [32.3, 3505.0], [32.4, 3515.0], [32.5, 3519.0], [32.6, 3522.0], [32.7, 3524.0], [32.8, 3524.0], [32.9, 3545.0], [33.0, 3551.0], [33.1, 3553.0], [33.2, 3564.0], [33.3, 3579.0], [33.4, 3580.0], [33.5, 3587.0], [33.6, 3588.0], [33.7, 3600.0], [33.8, 3601.0], [33.9, 3602.0], [34.0, 3607.0], [34.1, 3609.0], [34.2, 3617.0], [34.3, 3625.0], [34.4, 3625.0], [34.5, 3629.0], [34.6, 3631.0], [34.7, 3634.0], [34.8, 3634.0], [34.9, 3634.0], [35.0, 3647.0], [35.1, 3652.0], [35.2, 3656.0], [35.3, 3656.0], [35.4, 3657.0], [35.5, 3662.0], [35.6, 3665.0], [35.7, 3670.0], [35.8, 3673.0], [35.9, 3676.0], [36.0, 3677.0], [36.1, 3684.0], [36.2, 3691.0], [36.3, 3694.0], [36.4, 3716.0], [36.5, 3722.0], [36.6, 3727.0], [36.7, 3734.0], [36.8, 3751.0], [36.9, 3757.0], [37.0, 3758.0], [37.1, 3764.0], [37.2, 3766.0], [37.3, 3767.0], [37.4, 3768.0], [37.5, 3772.0], [37.6, 3776.0], [37.7, 3776.0], [37.8, 3781.0], [37.9, 3797.0], [38.0, 3801.0], [38.1, 3806.0], [38.2, 3814.0], [38.3, 3821.0], [38.4, 3823.0], [38.5, 3828.0], [38.6, 3844.0], [38.7, 3853.0], [38.8, 3854.0], [38.9, 3873.0], [39.0, 3877.0], [39.1, 3877.0], [39.2, 3897.0], [39.3, 3898.0], [39.4, 3898.0], [39.5, 3901.0], [39.6, 3907.0], [39.7, 3908.0], [39.8, 3922.0], [39.9, 3924.0], [40.0, 3924.0], [40.1, 3929.0], [40.2, 3934.0], [40.3, 3940.0], [40.4, 3950.0], [40.5, 3950.0], [40.6, 3953.0], [40.7, 3962.0], [40.8, 3967.0], [40.9, 3967.0], [41.0, 3968.0], [41.1, 3974.0], [41.2, 3982.0], [41.3, 3983.0], [41.4, 3986.0], [41.5, 3993.0], [41.6, 4006.0], [41.7, 4017.0], [41.8, 4019.0], [41.9, 4021.0], [42.0, 4023.0], [42.1, 4023.0], [42.2, 4025.0], [42.3, 4030.0], [42.4, 4031.0], [42.5, 4034.0], [42.6, 4039.0], [42.7, 4042.0], [42.8, 4045.0], [42.9, 4046.0], [43.0, 4055.0], [43.1, 4058.0], [43.2, 4061.0], [43.3, 4068.0], [43.4, 4068.0], [43.5, 4070.0], [43.6, 4072.0], [43.7, 4076.0], [43.8, 4083.0], [43.9, 4085.0], [44.0, 4085.0], [44.1, 4098.0], [44.2, 4110.0], [44.3, 4118.0], [44.4, 4121.0], [44.5, 4134.0], [44.6, 4138.0], [44.7, 4142.0], [44.8, 4144.0], [44.9, 4155.0], [45.0, 4157.0], [45.1, 4158.0], [45.2, 4159.0], [45.3, 4165.0], [45.4, 4166.0], [45.5, 4167.0], [45.6, 4178.0], [45.7, 4180.0], [45.8, 4191.0], [45.9, 4192.0], [46.0, 4198.0], [46.1, 4209.0], [46.2, 4213.0], [46.3, 4225.0], [46.4, 4227.0], [46.5, 4230.0], [46.6, 4233.0], [46.7, 4237.0], [46.8, 4237.0], [46.9, 4240.0], [47.0, 4241.0], [47.1, 4241.0], [47.2, 4246.0], [47.3, 4249.0], [47.4, 4250.0], [47.5, 4254.0], [47.6, 4255.0], [47.7, 4259.0], [47.8, 4267.0], [47.9, 4281.0], [48.0, 4281.0], [48.1, 4282.0], [48.2, 4286.0], [48.3, 4287.0], [48.4, 4298.0], [48.5, 4303.0], [48.6, 4305.0], [48.7, 4307.0], [48.8, 4308.0], [48.9, 4317.0], [49.0, 4319.0], [49.1, 4320.0], [49.2, 4331.0], [49.3, 4332.0], [49.4, 4335.0], [49.5, 4338.0], [49.6, 4340.0], [49.7, 4341.0], [49.8, 4344.0], [49.9, 4351.0], [50.0, 4351.0], [50.1, 4354.0], [50.2, 4355.0], [50.3, 4360.0], [50.4, 4362.0], [50.5, 4363.0], [50.6, 4365.0], [50.7, 4372.0], [50.8, 4376.0], [50.9, 4379.0], [51.0, 4380.0], [51.1, 4382.0], [51.2, 4385.0], [51.3, 4388.0], [51.4, 4393.0], [51.5, 4395.0], [51.6, 4397.0], [51.7, 4402.0], [51.8, 4403.0], [51.9, 4405.0], [52.0, 4406.0], [52.1, 4407.0], [52.2, 4409.0], [52.3, 4417.0], [52.4, 4417.0], [52.5, 4418.0], [52.6, 4419.0], [52.7, 4419.0], [52.8, 4422.0], [52.9, 4422.0], [53.0, 4423.0], [53.1, 4426.0], [53.2, 4427.0], [53.3, 4427.0], [53.4, 4427.0], [53.5, 4428.0], [53.6, 4428.0], [53.7, 4436.0], [53.8, 4436.0], [53.9, 4437.0], [54.0, 4440.0], [54.1, 4444.0], [54.2, 4444.0], [54.3, 4447.0], [54.4, 4453.0], [54.5, 4457.0], [54.6, 4458.0], [54.7, 4460.0], [54.8, 4461.0], [54.9, 4465.0], [55.0, 4476.0], [55.1, 4480.0], [55.2, 4482.0], [55.3, 4486.0], [55.4, 4491.0], [55.5, 4492.0], [55.6, 4493.0], [55.7, 4495.0], [55.8, 4495.0], [55.9, 4499.0], [56.0, 4500.0], [56.1, 4501.0], [56.2, 4501.0], [56.3, 4502.0], [56.4, 4504.0], [56.5, 4510.0], [56.6, 4511.0], [56.7, 4512.0], [56.8, 4512.0], [56.9, 4513.0], [57.0, 4513.0], [57.1, 4516.0], [57.2, 4517.0], [57.3, 4520.0], [57.4, 4527.0], [57.5, 4529.0], [57.6, 4540.0], [57.7, 4542.0], [57.8, 4542.0], [57.9, 4543.0], [58.0, 4551.0], [58.1, 4551.0], [58.2, 4553.0], [58.3, 4554.0], [58.4, 4562.0], [58.5, 4564.0], [58.6, 4568.0], [58.7, 4569.0], [58.8, 4570.0], [58.9, 4595.0], [59.0, 4600.0], [59.1, 4602.0], [59.2, 4604.0], [59.3, 4605.0], [59.4, 4605.0], [59.5, 4606.0], [59.6, 4607.0], [59.7, 4610.0], [59.8, 4610.0], [59.9, 4610.0], [60.0, 4612.0], [60.1, 4620.0], [60.2, 4622.0], [60.3, 4622.0], [60.4, 4624.0], [60.5, 4624.0], [60.6, 4624.0], [60.7, 4627.0], [60.8, 4629.0], [60.9, 4629.0], [61.0, 4631.0], [61.1, 4632.0], [61.2, 4641.0], [61.3, 4645.0], [61.4, 4645.0], [61.5, 4647.0], [61.6, 4648.0], [61.7, 4649.0], [61.8, 4653.0], [61.9, 4654.0], [62.0, 4655.0], [62.1, 4657.0], [62.2, 4659.0], [62.3, 4662.0], [62.4, 4664.0], [62.5, 4665.0], [62.6, 4666.0], [62.7, 4667.0], [62.8, 4668.0], [62.9, 4671.0], [63.0, 4674.0], [63.1, 4674.0], [63.2, 4675.0], [63.3, 4676.0], [63.4, 4676.0], [63.5, 4677.0], [63.6, 4682.0], [63.7, 4682.0], [63.8, 4682.0], [63.9, 4684.0], [64.0, 4684.0], [64.1, 4686.0], [64.2, 4691.0], [64.3, 4693.0], [64.4, 4698.0], [64.5, 4713.0], [64.6, 4718.0], [64.7, 4719.0], [64.8, 4721.0], [64.9, 4722.0], [65.0, 4723.0], [65.1, 4724.0], [65.2, 4725.0], [65.3, 4725.0], [65.4, 4725.0], [65.5, 4726.0], [65.6, 4728.0], [65.7, 4731.0], [65.8, 4732.0], [65.9, 4733.0], [66.0, 4733.0], [66.1, 4735.0], [66.2, 4737.0], [66.3, 4740.0], [66.4, 4741.0], [66.5, 4744.0], [66.6, 4745.0], [66.7, 4745.0], [66.8, 4746.0], [66.9, 4751.0], [67.0, 4755.0], [67.1, 4757.0], [67.2, 4757.0], [67.3, 4758.0], [67.4, 4760.0], [67.5, 4760.0], [67.6, 4768.0], [67.7, 4774.0], [67.8, 4777.0], [67.9, 4784.0], [68.0, 4785.0], [68.1, 4786.0], [68.2, 4787.0], [68.3, 4789.0], [68.4, 4789.0], [68.5, 4790.0], [68.6, 4790.0], [68.7, 4791.0], [68.8, 4795.0], [68.9, 4798.0], [69.0, 4803.0], [69.1, 4819.0], [69.2, 4819.0], [69.3, 4820.0], [69.4, 4820.0], [69.5, 4821.0], [69.6, 4824.0], [69.7, 4828.0], [69.8, 4828.0], [69.9, 4829.0], [70.0, 4829.0], [70.1, 4829.0], [70.2, 4830.0], [70.3, 4834.0], [70.4, 4838.0], [70.5, 4840.0], [70.6, 4840.0], [70.7, 4843.0], [70.8, 4843.0], [70.9, 4847.0], [71.0, 4847.0], [71.1, 4851.0], [71.2, 4853.0], [71.3, 4856.0], [71.4, 4857.0], [71.5, 4859.0], [71.6, 4861.0], [71.7, 4862.0], [71.8, 4862.0], [71.9, 4865.0], [72.0, 4865.0], [72.1, 4870.0], [72.2, 4872.0], [72.3, 4876.0], [72.4, 4877.0], [72.5, 4882.0], [72.6, 4887.0], [72.7, 4894.0], [72.8, 4896.0], [72.9, 4897.0], [73.0, 4897.0], [73.1, 4903.0], [73.2, 4908.0], [73.3, 4911.0], [73.4, 4911.0], [73.5, 4912.0], [73.6, 4914.0], [73.7, 4916.0], [73.8, 4920.0], [73.9, 4921.0], [74.0, 4924.0], [74.1, 4927.0], [74.2, 4931.0], [74.3, 4936.0], [74.4, 4947.0], [74.5, 4948.0], [74.6, 4950.0], [74.7, 4950.0], [74.8, 4950.0], [74.9, 4956.0], [75.0, 4956.0], [75.1, 4958.0], [75.2, 4969.0], [75.3, 4970.0], [75.4, 4974.0], [75.5, 4980.0], [75.6, 4981.0], [75.7, 4981.0], [75.8, 4983.0], [75.9, 4986.0], [76.0, 4989.0], [76.1, 4990.0], [76.2, 4992.0], [76.3, 4994.0], [76.4, 5000.0], [76.5, 5000.0], [76.6, 5008.0], [76.7, 5009.0], [76.8, 5015.0], [76.9, 5017.0], [77.0, 5017.0], [77.1, 5018.0], [77.2, 5019.0], [77.3, 5021.0], [77.4, 5021.0], [77.5, 5025.0], [77.6, 5030.0], [77.7, 5030.0], [77.8, 5030.0], [77.9, 5031.0], [78.0, 5033.0], [78.1, 5035.0], [78.2, 5037.0], [78.3, 5038.0], [78.4, 5038.0], [78.5, 5038.0], [78.6, 5045.0], [78.7, 5048.0], [78.8, 5052.0], [78.9, 5062.0], [79.0, 5065.0], [79.1, 5066.0], [79.2, 5073.0], [79.3, 5075.0], [79.4, 5076.0], [79.5, 5078.0], [79.6, 5079.0], [79.7, 5080.0], [79.8, 5091.0], [79.9, 5092.0], [80.0, 5096.0], [80.1, 5096.0], [80.2, 5101.0], [80.3, 5109.0], [80.4, 5110.0], [80.5, 5119.0], [80.6, 5119.0], [80.7, 5125.0], [80.8, 5126.0], [80.9, 5131.0], [81.0, 5136.0], [81.1, 5140.0], [81.2, 5144.0], [81.3, 5154.0], [81.4, 5157.0], [81.5, 5163.0], [81.6, 5166.0], [81.7, 5168.0], [81.8, 5171.0], [81.9, 5183.0], [82.0, 5188.0], [82.1, 5188.0], [82.2, 5189.0], [82.3, 5192.0], [82.4, 5194.0], [82.5, 5197.0], [82.6, 5197.0], [82.7, 5208.0], [82.8, 5214.0], [82.9, 5229.0], [83.0, 5231.0], [83.1, 5233.0], [83.2, 5234.0], [83.3, 5234.0], [83.4, 5239.0], [83.5, 5240.0], [83.6, 5244.0], [83.7, 5244.0], [83.8, 5251.0], [83.9, 5253.0], [84.0, 5256.0], [84.1, 5259.0], [84.2, 5260.0], [84.3, 5261.0], [84.4, 5263.0], [84.5, 5277.0], [84.6, 5280.0], [84.7, 5286.0], [84.8, 5291.0], [84.9, 5292.0], [85.0, 5298.0], [85.1, 5299.0], [85.2, 5299.0], [85.3, 5303.0], [85.4, 5306.0], [85.5, 5306.0], [85.6, 5314.0], [85.7, 5318.0], [85.8, 5322.0], [85.9, 5325.0], [86.0, 5327.0], [86.1, 5327.0], [86.2, 5332.0], [86.3, 5334.0], [86.4, 5336.0], [86.5, 5347.0], [86.6, 5352.0], [86.7, 5354.0], [86.8, 5356.0], [86.9, 5358.0], [87.0, 5365.0], [87.1, 5365.0], [87.2, 5370.0], [87.3, 5372.0], [87.4, 5376.0], [87.5, 5378.0], [87.6, 5381.0], [87.7, 5390.0], [87.8, 5391.0], [87.9, 5397.0], [88.0, 5398.0], [88.1, 5409.0], [88.2, 5424.0], [88.3, 5431.0], [88.4, 5432.0], [88.5, 5432.0], [88.6, 5437.0], [88.7, 5448.0], [88.8, 5451.0], [88.9, 5453.0], [89.0, 5457.0], [89.1, 5461.0], [89.2, 5464.0], [89.3, 5470.0], [89.4, 5472.0], [89.5, 5472.0], [89.6, 5474.0], [89.7, 5480.0], [89.8, 5482.0], [89.9, 5482.0], [90.0, 5483.0], [90.1, 5496.0], [90.2, 5497.0], [90.3, 5499.0], [90.4, 5510.0], [90.5, 5510.0], [90.6, 5512.0], [90.7, 5515.0], [90.8, 5516.0], [90.9, 5531.0], [91.0, 5533.0], [91.1, 5535.0], [91.2, 5541.0], [91.3, 5553.0], [91.4, 5564.0], [91.5, 5570.0], [91.6, 5575.0], [91.7, 5576.0], [91.8, 5603.0], [91.9, 5608.0], [92.0, 5610.0], [92.1, 5610.0], [92.2, 5614.0], [92.3, 5618.0], [92.4, 5619.0], [92.5, 5621.0], [92.6, 5622.0], [92.7, 5623.0], [92.8, 5625.0], [92.9, 5626.0], [93.0, 5635.0], [93.1, 5639.0], [93.2, 5644.0], [93.3, 5653.0], [93.4, 5654.0], [93.5, 5655.0], [93.6, 5655.0], [93.7, 5660.0], [93.8, 5663.0], [93.9, 5665.0], [94.0, 5686.0], [94.1, 5691.0], [94.2, 5698.0], [94.3, 5703.0], [94.4, 5716.0], [94.5, 5732.0], [94.6, 5740.0], [94.7, 5742.0], [94.8, 5745.0], [94.9, 5748.0], [95.0, 5758.0], [95.1, 5760.0], [95.2, 5762.0], [95.3, 5764.0], [95.4, 5769.0], [95.5, 5770.0], [95.6, 5782.0], [95.7, 5784.0], [95.8, 5786.0], [95.9, 5795.0], [96.0, 5801.0], [96.1, 5804.0], [96.2, 5826.0], [96.3, 5830.0], [96.4, 5858.0], [96.5, 5863.0], [96.6, 5864.0], [96.7, 5869.0], [96.8, 5934.0], [96.9, 5943.0], [97.0, 5951.0], [97.1, 5977.0], [97.2, 6018.0], [97.3, 6060.0], [97.4, 6085.0], [97.5, 6115.0], [97.6, 6140.0], [97.7, 6161.0], [97.8, 6185.0], [97.9, 6231.0], [98.0, 6272.0], [98.1, 6280.0], [98.2, 6358.0], [98.3, 6360.0], [98.4, 6414.0], [98.5, 6494.0], [98.6, 6595.0], [98.7, 6605.0], [98.8, 6621.0], [98.9, 6627.0], [99.0, 6674.0], [99.1, 6680.0], [99.2, 6687.0], [99.3, 6688.0], [99.4, 6721.0], [99.5, 6789.0], [99.6, 6892.0], [99.7, 6932.0], [99.8, 6942.0], [99.9, 6957.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 55.0, "series": [{"data": [[600.0, 9.0], [700.0, 17.0], [800.0, 10.0], [900.0, 8.0], [1000.0, 3.0], [1100.0, 1.0], [1300.0, 1.0], [1400.0, 2.0], [1500.0, 2.0], [1600.0, 8.0], [1700.0, 10.0], [1800.0, 11.0], [1900.0, 11.0], [2000.0, 3.0], [2100.0, 4.0], [2200.0, 5.0], [2300.0, 5.0], [2400.0, 7.0], [2500.0, 15.0], [2600.0, 7.0], [2700.0, 8.0], [2800.0, 6.0], [2900.0, 10.0], [3000.0, 9.0], [3100.0, 14.0], [3200.0, 16.0], [3300.0, 9.0], [3400.0, 20.0], [3500.0, 14.0], [3600.0, 27.0], [3700.0, 16.0], [3800.0, 15.0], [3900.0, 21.0], [4000.0, 26.0], [4100.0, 19.0], [4300.0, 32.0], [4200.0, 24.0], [4500.0, 30.0], [4400.0, 43.0], [4600.0, 55.0], [4700.0, 45.0], [4800.0, 41.0], [5000.0, 38.0], [4900.0, 33.0], [5100.0, 26.0], [5200.0, 26.0], [5300.0, 28.0], [5400.0, 23.0], [5500.0, 14.0], [5600.0, 25.0], [5800.0, 8.0], [5700.0, 17.0], [5900.0, 4.0], [6000.0, 3.0], [6100.0, 4.0], [6200.0, 3.0], [6300.0, 2.0], [6600.0, 7.0], [6400.0, 2.0], [6500.0, 1.0], [6700.0, 2.0], [6900.0, 3.0], [6800.0, 1.0], [200.0, 22.0], [300.0, 32.0], [400.0, 22.0], [500.0, 15.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 6900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 65.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 858.0, "series": [{"data": [[1.0, 65.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 77.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 858.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 321.67900000000014, "minX": 1.54958364E12, "maxY": 321.67900000000014, "series": [{"data": [[1.54958364E12, 321.67900000000014]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 273.2857142857143, "minX": 1.0, "maxY": 6957.0, "series": [{"data": [[2.0, 4741.0], [3.0, 4667.0], [4.0, 4627.0], [5.0, 4500.0], [6.0, 4654.0], [9.0, 4834.666666666667], [10.0, 4610.0], [13.0, 4921.0], [14.0, 4460.0], [15.0, 4692.5], [16.0, 4423.0], [17.0, 5464.0], [18.0, 4403.0], [19.0, 4428.0], [20.0, 4645.0], [22.0, 4579.0], [23.0, 4684.0], [24.0, 4351.0], [25.0, 4492.0], [26.0, 4870.0], [27.0, 4882.0], [28.0, 1013.3333333333334], [29.0, 273.2857142857143], [30.0, 1545.1428571428569], [31.0, 1397.5], [33.0, 2387.5], [32.0, 2375.5], [35.0, 2452.5], [34.0, 1551.0], [37.0, 4912.0], [39.0, 1322.2], [38.0, 2973.5], [41.0, 1866.3333333333333], [40.0, 5045.0], [42.0, 1090.6666666666665], [43.0, 2470.5], [45.0, 5531.0], [44.0, 4649.0], [46.0, 2832.5], [47.0, 5260.0], [48.0, 1229.2], [49.0, 2076.333333333333], [50.0, 1019.1666666666667], [51.0, 392.5], [53.0, 2372.5], [52.0, 4867.5], [55.0, 5136.0], [54.0, 5480.0], [56.0, 2416.0], [57.0, 4950.0], [59.0, 4542.0], [58.0, 4676.0], [61.0, 2637.0], [60.0, 4798.0], [63.0, 1257.6], [62.0, 1922.3333333333333], [64.0, 1476.5], [66.0, 1984.6666666666667], [67.0, 2793.0], [65.0, 5194.0], [68.0, 1807.6666666666667], [71.0, 2080.0], [70.0, 5144.0], [69.0, 4725.0], [72.0, 1528.75], [75.0, 4569.0], [74.0, 5347.0], [73.0, 4282.0], [76.0, 2127.0], [78.0, 4820.0], [77.0, 4740.0], [81.0, 2579.0], [82.0, 4958.0], [80.0, 5325.0], [84.0, 2086.0], [86.0, 1991.6666666666667], [85.0, 1479.6], [87.0, 5299.0], [91.0, 4856.0], [90.0, 5614.0], [89.0, 4647.0], [88.0, 4733.0], [95.0, 5110.0], [94.0, 5332.0], [93.0, 4341.0], [92.0, 4916.0], [96.0, 2485.5], [97.0, 2559.0], [98.0, 3134.0], [99.0, 4896.0], [103.0, 2417.5], [102.0, 5208.0], [101.0, 4742.0], [104.0, 723.2], [105.0, 1487.3000000000002], [107.0, 4495.0], [106.0, 4237.0], [109.0, 3092.5], [111.0, 5327.0], [110.0, 5482.0], [108.0, 4624.0], [114.0, 2621.0], [115.0, 4178.0], [113.0, 5065.0], [112.0, 5378.0], [116.0, 3075.0], [118.0, 2213.0], [117.0, 2847.0], [119.0, 2013.3333333333333], [120.0, 1673.4], [123.0, 5665.0], [122.0, 4948.0], [121.0, 5764.0], [127.0, 5154.0], [126.0, 5626.0], [125.0, 4564.0], [124.0, 5188.0], [130.0, 2788.0], [133.0, 1763.0], [132.0, 2494.0], [135.0, 4298.0], [134.0, 4719.0], [131.0, 4198.0], [129.0, 4250.0], [128.0, 5482.0], [137.0, 1883.5], [136.0, 3233.5], [138.0, 3261.0], [139.0, 2967.0], [142.0, 1896.75], [141.0, 2975.5], [143.0, 3377.0], [140.0, 4562.0], [145.0, 2609.5], [146.0, 2822.5], [149.0, 1829.0], [150.0, 2507.0], [148.0, 2795.0], [151.0, 5570.0], [147.0, 5432.0], [144.0, 5192.0], [159.0, 4876.0], [158.0, 4981.0], [157.0, 4379.0], [156.0, 4042.0], [155.0, 5497.0], [154.0, 4791.0], [153.0, 5129.0], [152.0, 4602.0], [166.0, 5259.0], [165.0, 5644.0], [164.0, 4657.0], [163.0, 5409.0], [162.0, 4612.0], [161.0, 5037.0], [160.0, 4751.0], [175.0, 5197.0], [174.0, 5686.0], [173.0, 4393.0], [172.0, 4648.0], [171.0, 5370.0], [170.0, 5240.0], [169.0, 4395.0], [168.0, 5236.0], [183.0, 5277.0], [182.0, 4427.0], [181.0, 5608.0], [180.0, 3908.0], [179.0, 5000.0], [178.0, 4241.0], [177.0, 5655.0], [176.0, 4829.0], [191.0, 4912.0], [190.0, 4486.0], [189.0, 6085.0], [188.0, 5131.0], [187.0, 5025.0], [186.0, 5451.0], [185.0, 4725.0], [184.0, 4732.0], [198.0, 5510.0], [197.0, 4046.0], [196.0, 4495.0], [195.0, 5079.0], [194.0, 4335.0], [193.0, 4723.0], [192.0, 4267.0], [207.0, 5062.0], [206.0, 6185.0], [205.0, 5610.0], [204.0, 5080.0], [203.0, 4819.0], [202.0, 5372.0], [201.0, 5233.0], [200.0, 5043.5], [215.0, 5663.0], [214.0, 3934.0], [213.0, 4605.0], [212.0, 6115.0], [211.0, 4564.0], [209.0, 4755.0], [208.0, 4529.0], [223.0, 4482.0], [222.0, 4760.0], [221.0, 5126.0], [220.0, 5280.0], [219.0, 4622.0], [218.0, 4768.0], [217.0, 4388.0], [216.0, 4840.0], [231.0, 4722.0], [230.0, 4624.0], [229.0, 5052.0], [228.0, 4675.0], [227.0, 5782.0], [226.0, 4903.0], [225.0, 6789.0], [224.0, 4897.0], [239.0, 4255.0], [238.0, 4989.0], [237.0, 4237.0], [236.0, 5496.0], [235.0, 5188.0], [234.0, 5303.0], [233.0, 4406.0], [232.0, 4259.0], [247.0, 6414.0], [246.0, 4317.0], [245.0, 4819.0], [244.0, 5564.0], [243.0, 4789.0], [242.0, 4950.0], [241.0, 4865.0], [240.0, 5019.0], [253.0, 2485.25], [252.0, 2134.6666666666665], [251.0, 3640.0], [250.0, 3159.5], [254.0, 3177.0], [255.0, 5256.0], [249.0, 4166.0], [248.0, 4829.0], [269.0, 3383.0], [265.0, 3570.0], [263.0, 3446.5], [262.0, 4513.0], [261.0, 5021.0], [260.0, 5575.0], [266.0, 2991.5], [271.0, 5038.0], [270.0, 5977.0], [268.0, 5804.0], [259.0, 5031.0], [258.0, 5934.0], [257.0, 4992.0], [256.0, 5292.0], [267.0, 5769.0], [264.0, 5261.0], [284.0, 3533.5], [272.0, 3123.666666666667], [275.0, 2871.666666666667], [274.0, 5510.0], [273.0, 5869.0], [276.0, 2976.333333333333], [277.0, 4785.0], [279.0, 2955.0], [278.0, 4721.0], [283.0, 2942.0], [282.0, 4760.0], [281.0, 5244.0], [280.0, 5376.0], [285.0, 4142.5], [287.0, 4016.0], [286.0, 4784.0], [302.0, 5318.0], [288.0, 2554.25], [290.0, 5621.0], [289.0, 6060.0], [295.0, 4480.0], [294.0, 4666.0], [293.0, 4664.0], [292.0, 5745.0], [291.0, 2802.6666666666665], [303.0, 3638.5], [301.0, 4725.0], [300.0, 4847.0], [299.0, 5732.0], [298.0, 5358.0], [297.0, 4682.0], [296.0, 5008.0], [316.0, 4147.0], [305.0, 4136.0], [307.0, 3388.5], [306.0, 4887.0], [309.0, 3364.0], [308.0, 5603.0], [310.0, 3229.333333333333], [311.0, 4757.0], [304.0, 5076.0], [317.0, 4183.0], [318.0, 3442.5], [319.0, 5299.0], [312.0, 5306.0], [314.0, 4501.0], [313.0, 5365.0], [323.0, 4530.0], [321.0, 2620.75], [320.0, 3761.0], [322.0, 3380.0], [327.0, 3659.5], [326.0, 4745.0], [325.0, 6957.0], [324.0, 4795.0], [330.0, 1989.5], [331.0, 5619.0], [329.0, 3417.5], [335.0, 5263.0], [328.0, 4351.0], [334.0, 5858.0], [333.0, 4306.0], [332.0, 5576.0], [351.0, 5618.0], [337.0, 3807.0], [343.0, 4622.0], [336.0, 4790.0], [342.0, 4502.0], [341.0, 4865.0], [340.0, 4872.0], [349.0, 3561.5], [350.0, 5457.0], [348.0, 4624.0], [339.0, 4990.0], [338.0, 4834.0], [347.0, 5325.0], [346.0, 5334.0], [345.0, 6942.0], [344.0, 4777.0], [367.0, 5168.0], [353.0, 3643.0], [352.0, 4862.0], [355.0, 5327.0], [354.0, 5786.0], [359.0, 4840.0], [358.0, 4458.0], [357.0, 5623.0], [356.0, 6140.0], [363.0, 4150.5], [364.0, 3297.3333333333335], [366.0, 5483.0], [365.0, 4698.0], [362.0, 5092.0], [361.0, 4512.0], [360.0, 5474.0], [382.0, 5096.0], [376.0, 4188.0], [377.0, 3971.5], [383.0, 4731.0], [381.0, 4950.0], [380.0, 4924.0], [379.0, 4758.0], [378.0, 5234.0], [375.0, 6595.0], [369.0, 5239.0], [368.0, 5171.0], [371.0, 4665.0], [370.0, 4857.0], [374.0, 5231.0], [373.0, 4025.0], [372.0, 4068.0], [396.0, 3198.3333333333335], [385.0, 3966.666666666667], [387.0, 6932.0], [386.0, 5654.0], [391.0, 5018.0], [384.0, 4686.0], [389.0, 3412.3333333333335], [388.0, 5472.0], [390.0, 3628.0], [398.0, 3883.5], [399.0, 5655.0], [393.0, 5368.5], [397.0, 6674.0], [395.0, 5499.0], [394.0, 6687.0], [415.0, 3210.5], [401.0, 3544.5], [400.0, 5864.0], [407.0, 4914.0], [406.0, 4303.0], [405.0, 6605.0], [404.0, 5096.0], [402.0, 4607.0], [408.0, 4503.0], [409.0, 5951.0], [411.0, 3660.0], [410.0, 4023.333333333333], [413.0, 3468.6666666666665], [414.0, 4595.0], [412.0, 5740.0], [403.0, 5784.0], [429.0, 4134.0], [419.0, 4384.5], [423.0, 4726.0], [416.0, 5625.0], [418.0, 4786.0], [417.0, 5197.0], [421.0, 3664.5], [420.0, 5653.0], [422.0, 3522.0], [425.0, 4758.0], [424.0, 4422.0], [431.0, 3474.5], [430.0, 6621.0], [428.0, 4516.0], [427.0, 5533.0], [426.0, 4853.0], [446.0, 3776.0], [435.0, 4045.6666666666665], [438.0, 3774.0], [437.0, 4824.0], [436.0, 4382.0], [439.0, 3457.0], [433.0, 5830.0], [432.0, 3772.0], [447.0, 4286.0], [445.0, 4167.0], [444.0, 4600.0], [443.0, 3634.0], [442.0, 3953.0], [441.0, 4974.0], [440.0, 5748.0], [462.0, 5758.0], [450.0, 4035.5], [451.0, 3620.5], [455.0, 3773.5], [449.0, 4610.0], [448.0, 5610.0], [454.0, 3764.0], [453.0, 5863.0], [452.0, 4610.0], [463.0, 4397.0], [456.0, 4671.0], [461.0, 4476.0], [460.0, 5296.0], [458.0, 4249.0], [457.0, 4034.0], [477.0, 3171.0], [465.0, 3293.3333333333335], [466.0, 3686.0], [471.0, 3398.3333333333335], [464.0, 4021.0], [469.0, 4662.0], [468.0, 4828.0], [472.0, 3812.5], [473.0, 5716.0], [479.0, 3629.0], [478.0, 5512.0], [476.0, 3757.0], [467.0, 4457.0], [475.0, 5801.0], [474.0, 4641.0], [495.0, 3487.0], [486.0, 3470.5], [484.0, 3530.6666666666665], [485.0, 3993.0], [491.0, 4052.5], [494.0, 4668.0], [493.0, 3631.0], [492.0, 4332.0], [487.0, 5078.0], [480.0, 4233.0], [482.0, 4510.0], [481.0, 5066.0], [483.0, 4927.0], [490.0, 3734.0], [489.0, 5021.0], [488.0, 4121.0], [511.0, 4499.0], [502.0, 3821.0], [501.0, 3024.0], [500.0, 4791.0], [507.0, 3461.0], [509.0, 4247.5], [510.0, 3593.0], [508.0, 3490.0], [498.0, 3495.0], [497.0, 4085.0], [496.0, 5390.0], [503.0, 3487.0], [506.0, 3203.0], [505.0, 5009.0], [504.0, 3967.0], [538.0, 3537.5], [517.0, 3591.5], [513.0, 4203.0], [512.0, 3753.5], [527.0, 5286.0], [526.0, 3426.0], [525.0, 3670.0], [516.0, 3252.0], [515.0, 3488.0], [514.0, 4165.0], [518.0, 3791.6666666666665], [519.0, 3850.0], [521.0, 4017.3333333333335], [520.0, 4227.0], [523.0, 4527.0], [522.0, 5119.0], [524.0, 3540.0], [529.0, 3968.5], [535.0, 3504.5], [534.0, 3599.5], [533.0, 3767.0], [532.0, 3191.0], [531.0, 5535.0], [530.0, 4427.0], [528.0, 3812.0], [543.0, 5352.0], [541.0, 4173.5], [540.0, 4281.0], [539.0, 4956.0], [542.0, 3464.5], [536.0, 3466.5], [537.0, 3656.0], [569.0, 4071.5], [553.0, 3741.75], [552.0, 4083.0], [554.0, 5291.0], [555.0, 3914.5], [561.0, 3671.5], [562.0, 5017.0], [564.0, 3487.0], [563.0, 3983.0], [560.0, 3678.6], [559.0, 3555.6666666666665], [558.0, 2909.0], [557.0, 3600.0], [556.0, 5437.0], [568.0, 3440.5], [551.0, 4230.0], [550.0, 3403.0], [549.0, 4019.0], [548.0, 4319.0], [547.0, 5298.0], [546.0, 3165.0], [545.0, 4031.0], [544.0, 5336.0], [565.0, 3783.5], [566.0, 3924.0], [570.0, 3780.5], [571.0, 4677.0], [573.0, 4674.0], [572.0, 3716.0], [575.0, 3994.5], [574.0, 4475.0], [601.0, 4009.5], [593.0, 4097.5], [576.0, 3649.3333333333335], [583.0, 3616.0], [582.0, 4568.0], [581.0, 4331.0], [580.0, 4213.0], [579.0, 3844.0], [578.0, 4017.0], [577.0, 4757.0], [600.0, 4843.0], [606.0, 3599.6666666666665], [605.0, 3665.0], [604.0, 3982.0], [603.0, 3929.0], [602.0, 4551.0], [607.0, 3269.0], [592.0, 4674.0], [585.0, 3592.6666666666665], [584.0, 4110.0], [586.0, 3695.5], [587.0, 3898.0], [589.0, 4402.0], [588.0, 4708.5], [591.0, 4076.0], [590.0, 4629.0], [594.0, 4268.0], [595.0, 2972.0], [597.0, 3747.0], [599.0, 2712.0], [598.0, 4287.0], [596.0, 3870.5], [613.0, 3649.3333333333335], [623.0, 3818.5], [608.0, 4190.0], [609.0, 3710.6666666666665], [610.0, 3418.5], [611.0, 3950.0], [624.0, 4293.5], [639.0, 3887.0], [638.0, 3653.0], [635.0, 3952.1666666666665], [634.0, 4744.0], [636.0, 3505.0], [637.0, 3994.0], [632.0, 4034.4], [615.0, 4068.0], [614.0, 3797.0], [633.0, 3677.0], [626.0, 3471.0], [625.0, 4113.333333333333], [628.0, 4079.8], [629.0, 3705.0], [630.0, 3370.0], [631.0, 3854.0], [627.0, 3454.5], [616.0, 3531.0], [617.0, 3491.0], [619.0, 4385.0], [618.0, 4511.0], [620.0, 3606.6666666666665], [621.0, 3680.5], [622.0, 3912.6666666666665], [640.0, 3788.75], [641.0, 3998.0], [643.0, 3294.0], [642.0, 3658.5], [1.0, 4426.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[321.67900000000014, 3795.6890000000008]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 643.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6283.333333333333, "minX": 1.54958364E12, "maxY": 6999.083333333333, "series": [{"data": [[1.54958364E12, 6999.083333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958364E12, 6283.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3795.6890000000008, "minX": 1.54958364E12, "maxY": 3795.6890000000008, "series": [{"data": [[1.54958364E12, 3795.6890000000008]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3795.6750000000006, "minX": 1.54958364E12, "maxY": 3795.6750000000006, "series": [{"data": [[1.54958364E12, 3795.6750000000006]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 49.22399999999996, "minX": 1.54958364E12, "maxY": 49.22399999999996, "series": [{"data": [[1.54958364E12, 49.22399999999996]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 220.0, "minX": 1.54958364E12, "maxY": 6957.0, "series": [{"data": [[1.54958364E12, 6957.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958364E12, 220.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958364E12, 5482.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958364E12, 6673.530000000001]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958364E12, 5757.499999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4352.5, "minX": 16.0, "maxY": 4352.5, "series": [{"data": [[16.0, 4352.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4352.5, "minX": 16.0, "maxY": 4352.5, "series": [{"data": [[16.0, 4352.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958364E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958364E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958364E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958364E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958364E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958364E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Transactions Per Second"}},
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
