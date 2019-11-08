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
        data: {"result": {"minY": 272.0, "minX": 0.0, "maxY": 7842.0, "series": [{"data": [[0.0, 272.0], [0.1, 296.0], [0.2, 299.0], [0.3, 299.0], [0.4, 316.0], [0.5, 328.0], [0.6, 329.0], [0.7, 351.0], [0.8, 365.0], [0.9, 374.0], [1.0, 378.0], [1.1, 381.0], [1.2, 383.0], [1.3, 386.0], [1.4, 386.0], [1.5, 389.0], [1.6, 389.0], [1.7, 389.0], [1.8, 392.0], [1.9, 394.0], [2.0, 397.0], [2.1, 400.0], [2.2, 401.0], [2.3, 408.0], [2.4, 409.0], [2.5, 410.0], [2.6, 416.0], [2.7, 418.0], [2.8, 423.0], [2.9, 424.0], [3.0, 428.0], [3.1, 442.0], [3.2, 447.0], [3.3, 449.0], [3.4, 452.0], [3.5, 453.0], [3.6, 456.0], [3.7, 457.0], [3.8, 458.0], [3.9, 463.0], [4.0, 465.0], [4.1, 466.0], [4.2, 470.0], [4.3, 471.0], [4.4, 477.0], [4.5, 479.0], [4.6, 479.0], [4.7, 481.0], [4.8, 481.0], [4.9, 481.0], [5.0, 483.0], [5.1, 497.0], [5.2, 500.0], [5.3, 502.0], [5.4, 503.0], [5.5, 503.0], [5.6, 507.0], [5.7, 512.0], [5.8, 518.0], [5.9, 521.0], [6.0, 524.0], [6.1, 525.0], [6.2, 531.0], [6.3, 535.0], [6.4, 545.0], [6.5, 546.0], [6.6, 554.0], [6.7, 556.0], [6.8, 562.0], [6.9, 567.0], [7.0, 568.0], [7.1, 575.0], [7.2, 576.0], [7.3, 583.0], [7.4, 597.0], [7.5, 610.0], [7.6, 612.0], [7.7, 616.0], [7.8, 617.0], [7.9, 620.0], [8.0, 630.0], [8.1, 632.0], [8.2, 632.0], [8.3, 632.0], [8.4, 637.0], [8.5, 638.0], [8.6, 638.0], [8.7, 641.0], [8.8, 642.0], [8.9, 644.0], [9.0, 648.0], [9.1, 655.0], [9.2, 662.0], [9.3, 678.0], [9.4, 682.0], [9.5, 682.0], [9.6, 691.0], [9.7, 716.0], [9.8, 717.0], [9.9, 728.0], [10.0, 731.0], [10.1, 735.0], [10.2, 736.0], [10.3, 742.0], [10.4, 744.0], [10.5, 769.0], [10.6, 770.0], [10.7, 773.0], [10.8, 779.0], [10.9, 780.0], [11.0, 783.0], [11.1, 784.0], [11.2, 789.0], [11.3, 798.0], [11.4, 799.0], [11.5, 803.0], [11.6, 807.0], [11.7, 832.0], [11.8, 838.0], [11.9, 841.0], [12.0, 843.0], [12.1, 847.0], [12.2, 857.0], [12.3, 859.0], [12.4, 867.0], [12.5, 872.0], [12.6, 877.0], [12.7, 877.0], [12.8, 885.0], [12.9, 885.0], [13.0, 908.0], [13.1, 912.0], [13.2, 915.0], [13.3, 924.0], [13.4, 926.0], [13.5, 932.0], [13.6, 937.0], [13.7, 941.0], [13.8, 953.0], [13.9, 953.0], [14.0, 955.0], [14.1, 960.0], [14.2, 967.0], [14.3, 979.0], [14.4, 984.0], [14.5, 1018.0], [14.6, 1020.0], [14.7, 1022.0], [14.8, 1028.0], [14.9, 1030.0], [15.0, 1045.0], [15.1, 1067.0], [15.2, 1082.0], [15.3, 1107.0], [15.4, 1141.0], [15.5, 1557.0], [15.6, 1578.0], [15.7, 1579.0], [15.8, 1614.0], [15.9, 1617.0], [16.0, 1635.0], [16.1, 1652.0], [16.2, 1654.0], [16.3, 1718.0], [16.4, 1738.0], [16.5, 1748.0], [16.6, 1752.0], [16.7, 1802.0], [16.8, 1815.0], [16.9, 1826.0], [17.0, 1849.0], [17.1, 1869.0], [17.2, 1881.0], [17.3, 1882.0], [17.4, 1912.0], [17.5, 1926.0], [17.6, 1927.0], [17.7, 1931.0], [17.8, 1941.0], [17.9, 1946.0], [18.0, 2014.0], [18.1, 2021.0], [18.2, 2023.0], [18.3, 2031.0], [18.4, 2032.0], [18.5, 2051.0], [18.6, 2062.0], [18.7, 2062.0], [18.8, 2087.0], [18.9, 2089.0], [19.0, 2130.0], [19.1, 2136.0], [19.2, 2138.0], [19.3, 2138.0], [19.4, 2152.0], [19.5, 2168.0], [19.6, 2176.0], [19.7, 2177.0], [19.8, 2186.0], [19.9, 2229.0], [20.0, 2254.0], [20.1, 2255.0], [20.2, 2277.0], [20.3, 2284.0], [20.4, 2285.0], [20.5, 2311.0], [20.6, 2317.0], [20.7, 2323.0], [20.8, 2329.0], [20.9, 2346.0], [21.0, 2348.0], [21.1, 2380.0], [21.2, 2382.0], [21.3, 2401.0], [21.4, 2432.0], [21.5, 2447.0], [21.6, 2452.0], [21.7, 2456.0], [21.8, 2467.0], [21.9, 2471.0], [22.0, 2480.0], [22.1, 2483.0], [22.2, 2501.0], [22.3, 2509.0], [22.4, 2533.0], [22.5, 2552.0], [22.6, 2610.0], [22.7, 2654.0], [22.8, 2660.0], [22.9, 2675.0], [23.0, 2678.0], [23.1, 2683.0], [23.2, 2685.0], [23.3, 2702.0], [23.4, 2702.0], [23.5, 2706.0], [23.6, 2738.0], [23.7, 2748.0], [23.8, 2749.0], [23.9, 2762.0], [24.0, 2781.0], [24.1, 2785.0], [24.2, 2787.0], [24.3, 2791.0], [24.4, 2794.0], [24.5, 2820.0], [24.6, 2821.0], [24.7, 2856.0], [24.8, 2875.0], [24.9, 2879.0], [25.0, 2883.0], [25.1, 2887.0], [25.2, 2890.0], [25.3, 2891.0], [25.4, 2893.0], [25.5, 2899.0], [25.6, 2912.0], [25.7, 2926.0], [25.8, 2933.0], [25.9, 2941.0], [26.0, 2957.0], [26.1, 3014.0], [26.2, 3034.0], [26.3, 3041.0], [26.4, 3051.0], [26.5, 3066.0], [26.6, 3066.0], [26.7, 3091.0], [26.8, 3094.0], [26.9, 3103.0], [27.0, 3107.0], [27.1, 3122.0], [27.2, 3125.0], [27.3, 3155.0], [27.4, 3160.0], [27.5, 3164.0], [27.6, 3166.0], [27.7, 3179.0], [27.8, 3181.0], [27.9, 3188.0], [28.0, 3189.0], [28.1, 3194.0], [28.2, 3206.0], [28.3, 3211.0], [28.4, 3218.0], [28.5, 3221.0], [28.6, 3224.0], [28.7, 3241.0], [28.8, 3241.0], [28.9, 3249.0], [29.0, 3250.0], [29.1, 3253.0], [29.2, 3266.0], [29.3, 3268.0], [29.4, 3277.0], [29.5, 3291.0], [29.6, 3293.0], [29.7, 3298.0], [29.8, 3303.0], [29.9, 3316.0], [30.0, 3317.0], [30.1, 3321.0], [30.2, 3324.0], [30.3, 3331.0], [30.4, 3345.0], [30.5, 3346.0], [30.6, 3365.0], [30.7, 3369.0], [30.8, 3378.0], [30.9, 3384.0], [31.0, 3388.0], [31.1, 3392.0], [31.2, 3399.0], [31.3, 3410.0], [31.4, 3417.0], [31.5, 3418.0], [31.6, 3419.0], [31.7, 3426.0], [31.8, 3453.0], [31.9, 3460.0], [32.0, 3462.0], [32.1, 3462.0], [32.2, 3473.0], [32.3, 3479.0], [32.4, 3486.0], [32.5, 3487.0], [32.6, 3489.0], [32.7, 3491.0], [32.8, 3502.0], [32.9, 3502.0], [33.0, 3516.0], [33.1, 3522.0], [33.2, 3528.0], [33.3, 3532.0], [33.4, 3534.0], [33.5, 3536.0], [33.6, 3543.0], [33.7, 3545.0], [33.8, 3557.0], [33.9, 3565.0], [34.0, 3566.0], [34.1, 3576.0], [34.2, 3576.0], [34.3, 3577.0], [34.4, 3601.0], [34.5, 3601.0], [34.6, 3603.0], [34.7, 3603.0], [34.8, 3613.0], [34.9, 3616.0], [35.0, 3621.0], [35.1, 3626.0], [35.2, 3626.0], [35.3, 3629.0], [35.4, 3630.0], [35.5, 3631.0], [35.6, 3639.0], [35.7, 3642.0], [35.8, 3643.0], [35.9, 3646.0], [36.0, 3646.0], [36.1, 3649.0], [36.2, 3651.0], [36.3, 3653.0], [36.4, 3655.0], [36.5, 3671.0], [36.6, 3675.0], [36.7, 3676.0], [36.8, 3677.0], [36.9, 3688.0], [37.0, 3695.0], [37.1, 3701.0], [37.2, 3708.0], [37.3, 3710.0], [37.4, 3712.0], [37.5, 3713.0], [37.6, 3717.0], [37.7, 3727.0], [37.8, 3732.0], [37.9, 3737.0], [38.0, 3741.0], [38.1, 3742.0], [38.2, 3757.0], [38.3, 3761.0], [38.4, 3765.0], [38.5, 3767.0], [38.6, 3768.0], [38.7, 3769.0], [38.8, 3772.0], [38.9, 3782.0], [39.0, 3784.0], [39.1, 3794.0], [39.2, 3799.0], [39.3, 3801.0], [39.4, 3810.0], [39.5, 3811.0], [39.6, 3813.0], [39.7, 3814.0], [39.8, 3815.0], [39.9, 3836.0], [40.0, 3887.0], [40.1, 3890.0], [40.2, 3893.0], [40.3, 3900.0], [40.4, 3905.0], [40.5, 3906.0], [40.6, 3908.0], [40.7, 3912.0], [40.8, 3914.0], [40.9, 3918.0], [41.0, 3920.0], [41.1, 3924.0], [41.2, 3926.0], [41.3, 3926.0], [41.4, 3936.0], [41.5, 3941.0], [41.6, 3943.0], [41.7, 3949.0], [41.8, 3950.0], [41.9, 3956.0], [42.0, 3961.0], [42.1, 3965.0], [42.2, 3965.0], [42.3, 3966.0], [42.4, 3968.0], [42.5, 3969.0], [42.6, 3970.0], [42.7, 3970.0], [42.8, 3976.0], [42.9, 3977.0], [43.0, 3985.0], [43.1, 3987.0], [43.2, 3988.0], [43.3, 3995.0], [43.4, 3996.0], [43.5, 3996.0], [43.6, 3997.0], [43.7, 4003.0], [43.8, 4003.0], [43.9, 4011.0], [44.0, 4013.0], [44.1, 4020.0], [44.2, 4021.0], [44.3, 4030.0], [44.4, 4031.0], [44.5, 4033.0], [44.6, 4040.0], [44.7, 4041.0], [44.8, 4042.0], [44.9, 4047.0], [45.0, 4049.0], [45.1, 4054.0], [45.2, 4055.0], [45.3, 4057.0], [45.4, 4065.0], [45.5, 4065.0], [45.6, 4067.0], [45.7, 4071.0], [45.8, 4072.0], [45.9, 4077.0], [46.0, 4083.0], [46.1, 4087.0], [46.2, 4089.0], [46.3, 4091.0], [46.4, 4094.0], [46.5, 4098.0], [46.6, 4100.0], [46.7, 4101.0], [46.8, 4101.0], [46.9, 4104.0], [47.0, 4109.0], [47.1, 4109.0], [47.2, 4110.0], [47.3, 4112.0], [47.4, 4123.0], [47.5, 4123.0], [47.6, 4128.0], [47.7, 4134.0], [47.8, 4148.0], [47.9, 4149.0], [48.0, 4157.0], [48.1, 4160.0], [48.2, 4163.0], [48.3, 4163.0], [48.4, 4168.0], [48.5, 4172.0], [48.6, 4172.0], [48.7, 4174.0], [48.8, 4184.0], [48.9, 4185.0], [49.0, 4197.0], [49.1, 4200.0], [49.2, 4207.0], [49.3, 4215.0], [49.4, 4216.0], [49.5, 4216.0], [49.6, 4218.0], [49.7, 4221.0], [49.8, 4222.0], [49.9, 4227.0], [50.0, 4227.0], [50.1, 4238.0], [50.2, 4241.0], [50.3, 4241.0], [50.4, 4241.0], [50.5, 4244.0], [50.6, 4245.0], [50.7, 4246.0], [50.8, 4248.0], [50.9, 4249.0], [51.0, 4252.0], [51.1, 4254.0], [51.2, 4257.0], [51.3, 4259.0], [51.4, 4260.0], [51.5, 4266.0], [51.6, 4270.0], [51.7, 4275.0], [51.8, 4283.0], [51.9, 4285.0], [52.0, 4287.0], [52.1, 4287.0], [52.2, 4291.0], [52.3, 4295.0], [52.4, 4297.0], [52.5, 4300.0], [52.6, 4301.0], [52.7, 4306.0], [52.8, 4314.0], [52.9, 4323.0], [53.0, 4324.0], [53.1, 4326.0], [53.2, 4326.0], [53.3, 4328.0], [53.4, 4328.0], [53.5, 4330.0], [53.6, 4332.0], [53.7, 4335.0], [53.8, 4339.0], [53.9, 4342.0], [54.0, 4343.0], [54.1, 4344.0], [54.2, 4345.0], [54.3, 4349.0], [54.4, 4352.0], [54.5, 4358.0], [54.6, 4366.0], [54.7, 4366.0], [54.8, 4367.0], [54.9, 4368.0], [55.0, 4370.0], [55.1, 4370.0], [55.2, 4370.0], [55.3, 4371.0], [55.4, 4372.0], [55.5, 4379.0], [55.6, 4382.0], [55.7, 4384.0], [55.8, 4387.0], [55.9, 4390.0], [56.0, 4390.0], [56.1, 4391.0], [56.2, 4392.0], [56.3, 4394.0], [56.4, 4397.0], [56.5, 4407.0], [56.6, 4407.0], [56.7, 4411.0], [56.8, 4413.0], [56.9, 4413.0], [57.0, 4414.0], [57.1, 4414.0], [57.2, 4415.0], [57.3, 4417.0], [57.4, 4422.0], [57.5, 4422.0], [57.6, 4423.0], [57.7, 4432.0], [57.8, 4433.0], [57.9, 4437.0], [58.0, 4441.0], [58.1, 4443.0], [58.2, 4456.0], [58.3, 4460.0], [58.4, 4460.0], [58.5, 4462.0], [58.6, 4463.0], [58.7, 4469.0], [58.8, 4475.0], [58.9, 4475.0], [59.0, 4481.0], [59.1, 4483.0], [59.2, 4490.0], [59.3, 4492.0], [59.4, 4500.0], [59.5, 4515.0], [59.6, 4516.0], [59.7, 4523.0], [59.8, 4524.0], [59.9, 4524.0], [60.0, 4525.0], [60.1, 4527.0], [60.2, 4530.0], [60.3, 4531.0], [60.4, 4531.0], [60.5, 4533.0], [60.6, 4538.0], [60.7, 4540.0], [60.8, 4542.0], [60.9, 4542.0], [61.0, 4543.0], [61.1, 4548.0], [61.2, 4548.0], [61.3, 4549.0], [61.4, 4551.0], [61.5, 4553.0], [61.6, 4554.0], [61.7, 4559.0], [61.8, 4559.0], [61.9, 4564.0], [62.0, 4570.0], [62.1, 4572.0], [62.2, 4575.0], [62.3, 4581.0], [62.4, 4584.0], [62.5, 4586.0], [62.6, 4586.0], [62.7, 4591.0], [62.8, 4592.0], [62.9, 4596.0], [63.0, 4601.0], [63.1, 4606.0], [63.2, 4608.0], [63.3, 4616.0], [63.4, 4619.0], [63.5, 4620.0], [63.6, 4621.0], [63.7, 4623.0], [63.8, 4624.0], [63.9, 4626.0], [64.0, 4628.0], [64.1, 4631.0], [64.2, 4631.0], [64.3, 4634.0], [64.4, 4635.0], [64.5, 4636.0], [64.6, 4641.0], [64.7, 4646.0], [64.8, 4646.0], [64.9, 4647.0], [65.0, 4647.0], [65.1, 4647.0], [65.2, 4648.0], [65.3, 4654.0], [65.4, 4657.0], [65.5, 4658.0], [65.6, 4658.0], [65.7, 4658.0], [65.8, 4668.0], [65.9, 4669.0], [66.0, 4669.0], [66.1, 4670.0], [66.2, 4671.0], [66.3, 4673.0], [66.4, 4674.0], [66.5, 4677.0], [66.6, 4682.0], [66.7, 4684.0], [66.8, 4684.0], [66.9, 4693.0], [67.0, 4693.0], [67.1, 4698.0], [67.2, 4698.0], [67.3, 4700.0], [67.4, 4702.0], [67.5, 4706.0], [67.6, 4706.0], [67.7, 4716.0], [67.8, 4726.0], [67.9, 4731.0], [68.0, 4739.0], [68.1, 4742.0], [68.2, 4745.0], [68.3, 4748.0], [68.4, 4763.0], [68.5, 4764.0], [68.6, 4771.0], [68.7, 4772.0], [68.8, 4778.0], [68.9, 4778.0], [69.0, 4780.0], [69.1, 4784.0], [69.2, 4788.0], [69.3, 4790.0], [69.4, 4794.0], [69.5, 4794.0], [69.6, 4795.0], [69.7, 4799.0], [69.8, 4805.0], [69.9, 4805.0], [70.0, 4816.0], [70.1, 4817.0], [70.2, 4819.0], [70.3, 4820.0], [70.4, 4820.0], [70.5, 4822.0], [70.6, 4823.0], [70.7, 4827.0], [70.8, 4837.0], [70.9, 4842.0], [71.0, 4843.0], [71.1, 4845.0], [71.2, 4846.0], [71.3, 4850.0], [71.4, 4852.0], [71.5, 4854.0], [71.6, 4857.0], [71.7, 4860.0], [71.8, 4864.0], [71.9, 4865.0], [72.0, 4865.0], [72.1, 4868.0], [72.2, 4869.0], [72.3, 4869.0], [72.4, 4872.0], [72.5, 4877.0], [72.6, 4879.0], [72.7, 4879.0], [72.8, 4880.0], [72.9, 4883.0], [73.0, 4885.0], [73.1, 4887.0], [73.2, 4889.0], [73.3, 4892.0], [73.4, 4896.0], [73.5, 4901.0], [73.6, 4905.0], [73.7, 4910.0], [73.8, 4911.0], [73.9, 4913.0], [74.0, 4914.0], [74.1, 4916.0], [74.2, 4917.0], [74.3, 4921.0], [74.4, 4921.0], [74.5, 4923.0], [74.6, 4931.0], [74.7, 4932.0], [74.8, 4933.0], [74.9, 4935.0], [75.0, 4937.0], [75.1, 4940.0], [75.2, 4940.0], [75.3, 4947.0], [75.4, 4948.0], [75.5, 4949.0], [75.6, 4951.0], [75.7, 4955.0], [75.8, 4962.0], [75.9, 4962.0], [76.0, 4963.0], [76.1, 4967.0], [76.2, 4970.0], [76.3, 4971.0], [76.4, 4974.0], [76.5, 4974.0], [76.6, 4974.0], [76.7, 4977.0], [76.8, 4978.0], [76.9, 4985.0], [77.0, 4986.0], [77.1, 4990.0], [77.2, 4990.0], [77.3, 4998.0], [77.4, 5000.0], [77.5, 5001.0], [77.6, 5002.0], [77.7, 5003.0], [77.8, 5004.0], [77.9, 5014.0], [78.0, 5015.0], [78.1, 5025.0], [78.2, 5029.0], [78.3, 5035.0], [78.4, 5039.0], [78.5, 5039.0], [78.6, 5040.0], [78.7, 5049.0], [78.8, 5050.0], [78.9, 5052.0], [79.0, 5055.0], [79.1, 5060.0], [79.2, 5065.0], [79.3, 5066.0], [79.4, 5076.0], [79.5, 5078.0], [79.6, 5079.0], [79.7, 5083.0], [79.8, 5084.0], [79.9, 5093.0], [80.0, 5105.0], [80.1, 5108.0], [80.2, 5117.0], [80.3, 5120.0], [80.4, 5132.0], [80.5, 5136.0], [80.6, 5138.0], [80.7, 5139.0], [80.8, 5141.0], [80.9, 5145.0], [81.0, 5150.0], [81.1, 5151.0], [81.2, 5164.0], [81.3, 5165.0], [81.4, 5167.0], [81.5, 5168.0], [81.6, 5171.0], [81.7, 5171.0], [81.8, 5171.0], [81.9, 5180.0], [82.0, 5190.0], [82.1, 5191.0], [82.2, 5194.0], [82.3, 5197.0], [82.4, 5197.0], [82.5, 5204.0], [82.6, 5205.0], [82.7, 5212.0], [82.8, 5214.0], [82.9, 5222.0], [83.0, 5223.0], [83.1, 5225.0], [83.2, 5226.0], [83.3, 5230.0], [83.4, 5235.0], [83.5, 5240.0], [83.6, 5241.0], [83.7, 5244.0], [83.8, 5246.0], [83.9, 5247.0], [84.0, 5247.0], [84.1, 5255.0], [84.2, 5256.0], [84.3, 5260.0], [84.4, 5263.0], [84.5, 5271.0], [84.6, 5274.0], [84.7, 5278.0], [84.8, 5279.0], [84.9, 5280.0], [85.0, 5287.0], [85.1, 5289.0], [85.2, 5295.0], [85.3, 5295.0], [85.4, 5297.0], [85.5, 5298.0], [85.6, 5301.0], [85.7, 5301.0], [85.8, 5310.0], [85.9, 5310.0], [86.0, 5311.0], [86.1, 5319.0], [86.2, 5324.0], [86.3, 5335.0], [86.4, 5336.0], [86.5, 5338.0], [86.6, 5345.0], [86.7, 5345.0], [86.8, 5347.0], [86.9, 5349.0], [87.0, 5356.0], [87.1, 5357.0], [87.2, 5358.0], [87.3, 5362.0], [87.4, 5363.0], [87.5, 5368.0], [87.6, 5372.0], [87.7, 5373.0], [87.8, 5374.0], [87.9, 5376.0], [88.0, 5380.0], [88.1, 5382.0], [88.2, 5383.0], [88.3, 5386.0], [88.4, 5390.0], [88.5, 5400.0], [88.6, 5415.0], [88.7, 5427.0], [88.8, 5431.0], [88.9, 5439.0], [89.0, 5440.0], [89.1, 5450.0], [89.2, 5463.0], [89.3, 5464.0], [89.4, 5474.0], [89.5, 5493.0], [89.6, 5495.0], [89.7, 5497.0], [89.8, 5498.0], [89.9, 5499.0], [90.0, 5517.0], [90.1, 5524.0], [90.2, 5527.0], [90.3, 5535.0], [90.4, 5538.0], [90.5, 5545.0], [90.6, 5554.0], [90.7, 5554.0], [90.8, 5559.0], [90.9, 5600.0], [91.0, 5608.0], [91.1, 5613.0], [91.2, 5614.0], [91.3, 5616.0], [91.4, 5626.0], [91.5, 5627.0], [91.6, 5631.0], [91.7, 5633.0], [91.8, 5638.0], [91.9, 5640.0], [92.0, 5642.0], [92.1, 5656.0], [92.2, 5676.0], [92.3, 5690.0], [92.4, 5700.0], [92.5, 5704.0], [92.6, 5728.0], [92.7, 5746.0], [92.8, 5757.0], [92.9, 5766.0], [93.0, 5770.0], [93.1, 5796.0], [93.2, 5805.0], [93.3, 5807.0], [93.4, 5835.0], [93.5, 5844.0], [93.6, 5867.0], [93.7, 5867.0], [93.8, 5885.0], [93.9, 5890.0], [94.0, 5895.0], [94.1, 5899.0], [94.2, 5904.0], [94.3, 5913.0], [94.4, 5919.0], [94.5, 5920.0], [94.6, 5953.0], [94.7, 5972.0], [94.8, 5975.0], [94.9, 5985.0], [95.0, 5986.0], [95.1, 6000.0], [95.2, 6024.0], [95.3, 6026.0], [95.4, 6030.0], [95.5, 6039.0], [95.6, 6067.0], [95.7, 6088.0], [95.8, 6100.0], [95.9, 6118.0], [96.0, 6126.0], [96.1, 6169.0], [96.2, 6234.0], [96.3, 6242.0], [96.4, 6268.0], [96.5, 6278.0], [96.6, 6335.0], [96.7, 6336.0], [96.8, 6367.0], [96.9, 6379.0], [97.0, 6423.0], [97.1, 6430.0], [97.2, 6430.0], [97.3, 6449.0], [97.4, 6480.0], [97.5, 6494.0], [97.6, 6505.0], [97.7, 6506.0], [97.8, 6523.0], [97.9, 6546.0], [98.0, 6547.0], [98.1, 6584.0], [98.2, 6608.0], [98.3, 6609.0], [98.4, 6645.0], [98.5, 6678.0], [98.6, 6688.0], [98.7, 6761.0], [98.8, 6778.0], [98.9, 6818.0], [99.0, 6870.0], [99.1, 6909.0], [99.2, 6977.0], [99.3, 7029.0], [99.4, 7030.0], [99.5, 7062.0], [99.6, 7145.0], [99.7, 7657.0], [99.8, 7684.0], [99.9, 7842.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 43.0, "series": [{"data": [[600.0, 22.0], [700.0, 18.0], [800.0, 15.0], [900.0, 15.0], [1000.0, 8.0], [1100.0, 2.0], [1500.0, 3.0], [1600.0, 5.0], [1700.0, 4.0], [1800.0, 7.0], [1900.0, 6.0], [2000.0, 9.0], [2100.0, 9.0], [2200.0, 6.0], [2300.0, 8.0], [2400.0, 9.0], [2500.0, 4.0], [2600.0, 7.0], [2700.0, 12.0], [2800.0, 11.0], [2900.0, 5.0], [3000.0, 8.0], [3100.0, 13.0], [3200.0, 16.0], [3300.0, 15.0], [3400.0, 15.0], [3500.0, 16.0], [3700.0, 22.0], [3600.0, 27.0], [3800.0, 10.0], [3900.0, 34.0], [4000.0, 29.0], [4100.0, 25.0], [4200.0, 34.0], [4300.0, 40.0], [4600.0, 43.0], [4500.0, 36.0], [4400.0, 29.0], [4800.0, 37.0], [4700.0, 25.0], [4900.0, 39.0], [5000.0, 26.0], [5100.0, 26.0], [5200.0, 31.0], [5300.0, 29.0], [5600.0, 15.0], [5400.0, 15.0], [5500.0, 9.0], [5800.0, 10.0], [5700.0, 8.0], [6100.0, 4.0], [5900.0, 9.0], [6000.0, 7.0], [6200.0, 4.0], [6300.0, 4.0], [6600.0, 5.0], [6400.0, 6.0], [6500.0, 6.0], [6800.0, 2.0], [6900.0, 2.0], [6700.0, 2.0], [7100.0, 1.0], [7000.0, 3.0], [7600.0, 2.0], [7800.0, 1.0], [200.0, 3.0], [300.0, 17.0], [400.0, 32.0], [500.0, 23.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 53.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 845.0, "series": [{"data": [[1.0, 102.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 53.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 845.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 319.25400000000036, "minX": 1.54958352E12, "maxY": 319.25400000000036, "series": [{"data": [[1.54958352E12, 319.25400000000036]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 783.0, "minX": 1.0, "maxY": 7842.0, "series": [{"data": [[2.0, 4619.0], [3.0, 4820.0], [5.0, 4827.0], [6.0, 4850.0], [7.0, 5226.0], [8.0, 5244.0], [9.0, 5136.0], [10.0, 4970.0], [11.0, 4433.0], [12.0, 4413.0], [13.0, 4778.0], [14.0, 4857.0], [15.0, 4700.0], [16.0, 4962.0], [17.0, 5559.0], [18.0, 4306.0], [19.0, 5093.0], [21.0, 5252.5], [23.0, 5120.0], [25.0, 4708.0], [26.0, 5383.0], [27.0, 5050.0], [28.0, 4548.0], [29.0, 4559.0], [30.0, 5274.0], [31.0, 4869.0], [33.0, 5450.0], [32.0, 4631.0], [35.0, 5168.0], [34.0, 4533.0], [37.0, 5247.0], [36.0, 4820.0], [39.0, 4627.5], [41.0, 4451.0], [43.0, 5132.0], [42.0, 5279.0], [45.0, 5495.0], [44.0, 4669.0], [47.0, 1619.25], [46.0, 5400.0], [49.0, 1391.4], [48.0, 2385.5], [51.0, 830.2307692307693], [50.0, 890.0], [52.0, 1400.5], [53.0, 1273.4], [54.0, 1230.8333333333333], [55.0, 1471.0], [56.0, 2547.0], [57.0, 5554.0], [59.0, 1710.3333333333333], [58.0, 2705.0], [61.0, 1735.6666666666667], [60.0, 4764.0], [62.0, 1717.8], [63.0, 4932.0], [66.0, 1760.3333333333333], [67.0, 1503.0], [65.0, 2633.5], [64.0, 4626.0], [70.0, 2543.0], [71.0, 2661.5], [69.0, 5919.0], [68.0, 5415.0], [73.0, 2065.666666666667], [72.0, 2473.0], [74.0, 3162.5], [75.0, 4254.0], [77.0, 1459.2], [76.0, 3159.0], [78.0, 2346.0], [79.0, 5440.0], [80.0, 2779.0], [82.0, 3300.0], [81.0, 2951.0], [83.0, 1660.5], [85.0, 1902.0], [86.0, 3092.0], [87.0, 6584.0], [84.0, 5084.0], [88.0, 2624.0], [89.0, 2134.0], [90.0, 1704.75], [91.0, 4608.0], [92.0, 2964.0], [95.0, 2713.333333333333], [94.0, 6088.0], [93.0, 4227.0], [98.0, 4978.0], [97.0, 5356.0], [96.0, 4407.0], [103.0, 4366.0], [102.0, 4109.0], [101.0, 5920.0], [100.0, 5830.5], [105.0, 1943.6666666666667], [107.0, 1639.0], [106.0, 5757.0], [104.0, 5191.0], [108.0, 2172.5], [109.0, 2590.5], [111.0, 2988.5], [110.0, 2640.333333333333], [115.0, 5110.0], [114.0, 5190.0], [112.0, 7062.0], [119.0, 6778.0], [118.0, 4407.0], [117.0, 6367.0], [116.0, 4693.0], [121.0, 783.0], [123.0, 4415.0], [122.0, 6306.5], [120.0, 6039.0], [125.0, 2826.0], [126.0, 3331.5], [127.0, 2464.0], [124.0, 4222.0], [130.0, 1589.0], [129.0, 2593.5], [131.0, 1418.5714285714284], [132.0, 1547.1666666666665], [134.0, 2311.333333333333], [133.0, 3079.5], [135.0, 1980.6666666666667], [128.0, 4872.0], [136.0, 1872.6], [138.0, 2091.333333333333], [137.0, 2668.666666666667], [140.0, 1369.625], [139.0, 1915.75], [141.0, 1707.5], [142.0, 3111.0], [143.0, 4669.0], [145.0, 1867.6666666666667], [146.0, 2541.0], [151.0, 4011.0], [150.0, 4745.0], [149.0, 4621.0], [148.0, 4441.0], [147.0, 6026.0], [144.0, 5640.0], [159.0, 5278.0], [158.0, 4790.0], [157.0, 6423.0], [156.0, 5972.0], [155.0, 4794.0], [154.0, 4954.0], [152.0, 4542.0], [167.0, 4314.0], [165.0, 6100.0], [164.0, 4101.0], [163.0, 4072.0], [162.0, 4344.0], [161.0, 4343.0], [160.0, 7842.0], [175.0, 4342.0], [174.0, 5066.0], [173.0, 5704.0], [172.0, 4880.0], [171.0, 4238.0], [170.0, 4098.0], [169.0, 5204.0], [168.0, 3969.0], [183.0, 4668.0], [182.0, 7029.0], [181.0, 5770.0], [180.0, 5108.0], [179.0, 3920.0], [178.0, 5271.0], [177.0, 6430.0], [176.0, 6505.0], [191.0, 4252.0], [190.0, 5538.0], [189.0, 4684.0], [188.0, 5035.0], [187.0, 4349.0], [186.0, 5345.0], [185.0, 5600.0], [184.0, 4937.0], [199.0, 4516.0], [198.0, 5138.0], [197.0, 6379.0], [196.0, 5368.0], [195.0, 5301.0], [194.0, 5139.0], [193.0, 4827.0], [192.0, 5835.0], [207.0, 4616.0], [206.0, 6169.0], [205.0, 4592.0], [204.0, 5638.0], [203.0, 6268.0], [202.0, 4916.0], [201.0, 5608.0], [200.0, 7657.0], [215.0, 3977.0], [214.0, 4157.0], [213.0, 4123.0], [212.0, 4471.5], [210.0, 5427.0], [209.0, 4245.0], [208.0, 3941.0], [223.0, 4869.0], [222.0, 4324.0], [221.0, 5004.0], [220.0, 5885.0], [219.0, 5376.0], [218.0, 7684.0], [217.0, 4986.0], [216.0, 4172.0], [231.0, 5029.0], [230.0, 3688.0], [229.0, 4475.0], [228.0, 4487.0], [226.0, 4335.0], [225.0, 4673.0], [224.0, 4636.0], [239.0, 5015.0], [238.0, 5867.0], [237.0, 5171.0], [236.0, 6761.0], [235.0, 4658.0], [234.0, 4559.0], [233.0, 6000.0], [232.0, 5295.0], [247.0, 4977.0], [246.0, 4971.0], [245.0, 4878.0], [243.0, 5241.0], [242.0, 3757.0], [241.0, 4128.0], [240.0, 4291.0], [255.0, 2549.25], [254.0, 5083.0], [253.0, 4913.5], [251.0, 5631.0], [250.0, 4805.0], [249.0, 4490.0], [248.0, 3811.0], [269.0, 3026.5], [256.0, 3102.0], [263.0, 3801.0], [262.0, 4553.0], [261.0, 4698.0], [260.0, 3646.0], [257.0, 3084.5], [270.0, 5953.0], [268.0, 4883.0], [259.0, 3576.0], [258.0, 5986.0], [267.0, 5230.0], [266.0, 4819.0], [265.0, 4475.0], [264.0, 5065.0], [284.0, 2687.3333333333335], [272.0, 2796.4], [273.0, 3159.0], [275.0, 3601.0], [274.0, 4917.0], [277.0, 3144.5], [276.0, 4370.0], [279.0, 3759.0], [278.0, 4805.0], [282.0, 3364.0], [283.0, 3485.0], [286.0, 3525.0], [285.0, 3985.0], [287.0, 3307.5], [281.0, 4842.0], [280.0, 5263.0], [302.0, 4275.0], [291.0, 3379.5], [290.0, 4914.0], [289.0, 5324.0], [288.0, 4197.0], [293.0, 3244.0], [292.0, 3626.0], [294.0, 5120.0], [295.0, 3013.5], [297.0, 3148.5], [299.0, 2913.0], [298.0, 4021.0], [303.0, 5676.0], [296.0, 3906.0], [301.0, 4647.0], [300.0, 4094.0], [319.0, 3595.5], [305.0, 3367.0], [311.0, 4788.0], [304.0, 5499.0], [310.0, 5002.0], [309.0, 3970.0], [308.0, 4524.0], [314.0, 3450.0], [318.0, 4998.0], [317.0, 4548.0], [316.0, 4739.0], [307.0, 5000.0], [306.0, 4285.0], [315.0, 4648.0], [313.0, 7030.0], [312.0, 4771.0], [334.0, 3114.0], [326.0, 2685.0], [325.0, 2725.6666666666665], [324.0, 4877.0], [327.0, 3167.666666666667], [321.0, 4542.0], [320.0, 4854.0], [323.0, 4572.0], [322.0, 4860.0], [329.0, 3062.0], [333.0, 3593.0], [335.0, 6335.0], [328.0, 5078.0], [332.0, 5171.0], [331.0, 5347.0], [330.0, 5545.0], [351.0, 5746.0], [339.0, 2255.0], [338.0, 5280.0], [337.0, 4990.0], [336.0, 5913.0], [343.0, 5614.0], [342.0, 5287.0], [341.0, 4067.0], [340.0, 4768.0], [346.0, 3626.0], [348.0, 3834.0], [350.0, 5052.0], [349.0, 4055.0], [347.0, 5633.0], [345.0, 6030.0], [344.0, 6909.0], [365.0, 3338.0], [361.0, 2901.0], [352.0, 3643.0], [359.0, 6678.0], [358.0, 5786.5], [356.0, 4963.0], [363.0, 4547.5], [366.0, 2310.5], [367.0, 5171.5], [364.0, 4911.0], [355.0, 5895.0], [354.0, 4921.0], [353.0, 4631.0], [362.0, 4974.0], [360.0, 5167.0], [371.0, 3397.0], [373.0, 2869.25], [372.0, 4682.0], [374.0, 3487.5], [375.0, 3608.0], [368.0, 6278.0], [370.0, 4896.0], [369.0, 6870.0], [376.0, 3713.0], [378.0, 3838.5], [379.0, 4852.0], [377.0, 3982.0], [383.0, 4564.0], [382.0, 6523.0], [381.0, 4330.0], [380.0, 4845.0], [399.0, 5899.0], [392.0, 3784.333333333333], [398.0, 5358.0], [397.0, 5985.0], [396.0, 5256.0], [387.0, 4985.0], [386.0, 5319.0], [385.0, 5055.0], [384.0, 7145.0], [395.0, 4443.0], [394.0, 5380.0], [393.0, 4795.0], [391.0, 6506.0], [390.0, 6494.0], [389.0, 4674.0], [388.0, 4326.0], [415.0, 5246.0], [408.0, 4671.0], [407.0, 4494.5], [406.0, 5464.0], [405.0, 4500.0], [404.0, 5805.0], [413.0, 3286.0], [414.0, 4949.0], [412.0, 4931.0], [403.0, 5145.0], [402.0, 6547.0], [401.0, 4763.0], [400.0, 5474.0], [411.0, 4570.0], [410.0, 5373.0], [409.0, 5524.0], [428.0, 3335.3333333333335], [417.0, 3825.0], [419.0, 6608.0], [418.0, 4266.0], [416.0, 3829.0], [421.0, 3820.5], [420.0, 5867.0], [423.0, 4089.0], [422.0, 4481.0], [426.0, 3067.6666666666665], [427.0, 3576.6666666666665], [431.0, 3516.0], [425.0, 4332.0], [424.0, 4216.0], [430.0, 5363.0], [429.0, 3646.0], [447.0, 5165.0], [437.0, 3991.5], [436.0, 4628.0], [439.0, 4057.0], [433.0, 3905.0], [432.0, 4525.0], [435.0, 5807.0], [434.0, 3965.0], [438.0, 4432.0], [442.0, 3404.5], [444.0, 3669.0], [446.0, 5700.0], [445.0, 5690.0], [443.0, 4172.0], [441.0, 5439.0], [440.0, 5616.0], [462.0, 4047.0], [448.0, 3915.0], [452.0, 3839.0], [453.0, 4270.0], [451.0, 3524.0], [450.0, 3924.0], [449.0, 4054.0], [455.0, 3928.0], [454.0, 4287.0], [463.0, 4257.0], [457.0, 4868.0], [456.0, 4772.0], [461.0, 6118.0], [460.0, 4382.0], [459.0, 3768.0], [458.0, 3912.0], [476.0, 3188.0], [466.0, 3777.0], [467.0, 3535.0], [468.0, 3105.0], [469.0, 3142.0], [471.0, 5060.0], [465.0, 5844.0], [464.0, 5362.0], [470.0, 4635.0], [472.0, 3622.0], [474.0, 3390.75], [475.0, 4049.0], [473.0, 4340.0], [478.0, 4055.5], [477.0, 5342.5], [494.0, 4328.0], [483.0, 2815.3333333333335], [486.0, 3582.25], [485.0, 4003.0], [484.0, 4390.5], [487.0, 5214.0], [480.0, 4449.0], [482.0, 5223.0], [481.0, 3631.0], [489.0, 3523.0], [491.0, 4229.5], [495.0, 5386.0], [488.0, 5205.0], [493.0, 4469.0], [492.0, 3639.0], [490.0, 4646.0], [510.0, 4241.0], [503.0, 3574.5], [498.0, 3874.5], [497.0, 5194.0], [496.0, 4384.0], [499.0, 5626.0], [502.0, 3368.0], [501.0, 4358.0], [500.0, 4083.0], [511.0, 5150.0], [505.0, 4417.0], [504.0, 5079.0], [509.0, 4411.0], [508.0, 4168.0], [507.0, 3965.0], [506.0, 4260.0], [540.0, 4087.5], [528.0, 3187.0], [520.0, 3735.0], [521.0, 4460.0], [523.0, 3066.0], [522.0, 5110.0], [525.0, 3708.0], [524.0, 5014.0], [527.0, 4352.0], [513.0, 4065.0], [512.0, 4823.0], [515.0, 3717.0], [514.0, 5613.0], [517.0, 4071.0], [516.0, 5463.0], [519.0, 4221.0], [518.0, 4731.0], [526.0, 3491.0], [529.0, 3380.0], [530.0, 4581.0], [531.0, 3290.0], [533.0, 3640.0], [532.0, 3241.0], [535.0, 3026.5], [534.0, 4658.0], [536.0, 3510.5], [539.0, 4646.0], [538.0, 5338.0], [537.0, 4218.0], [541.0, 4554.0], [543.0, 4014.0], [542.0, 4474.0], [549.0, 2382.0], [545.0, 3446.5], [544.0, 4353.5], [555.0, 3048.6666666666665], [556.0, 3653.0], [558.0, 4523.0], [557.0, 2794.0], [559.0, 4543.0], [546.0, 3690.3333333333335], [547.0, 3915.5], [548.0, 3623.3333333333335], [552.0, 3217.0], [553.0, 4935.0], [551.0, 3391.0], [550.0, 5292.5], [568.0, 4135.333333333333], [570.0, 3446.0], [569.0, 3291.0], [572.0, 4163.0], [571.0, 4160.0], [573.0, 3884.5], [574.0, 3547.5], [575.0, 5039.0], [561.0, 3603.0], [560.0, 3741.0], [562.0, 3401.0], [563.0, 3994.0], [564.0, 3464.0], [567.0, 3873.5], [566.0, 3712.0], [565.0, 3710.0], [554.0, 3801.6666666666665], [604.0, 4549.0], [579.0, 3866.0], [578.0, 3308.5], [577.0, 3388.0], [576.0, 4091.0], [582.0, 3900.5], [581.0, 3557.0], [580.0, 4955.0], [583.0, 3460.0], [600.0, 3574.0], [601.0, 3430.0], [603.0, 4020.0], [602.0, 4586.0], [605.0, 4647.0], [606.0, 3637.3333333333335], [607.0, 4100.333333333333], [585.0, 3206.5], [584.0, 3342.0], [586.0, 3936.5], [588.0, 4822.0], [587.0, 3250.0], [590.0, 4283.0], [589.0, 3626.0], [592.0, 3161.6666666666665], [591.0, 3679.0], [594.0, 4058.0], [598.0, 3995.0], [599.0, 4048.6666666666665], [597.0, 4110.5], [596.0, 4706.0], [595.0, 3316.0], [593.0, 3804.5], [636.0, 3928.5], [613.0, 3843.6666666666665], [612.0, 3833.0], [614.0, 4156.5], [615.0, 4233.5], [618.0, 4052.5], [617.0, 3253.0], [616.0, 4657.0], [619.0, 2738.0], [621.0, 4990.0], [620.0, 4901.0], [622.0, 3040.5], [623.0, 3721.6666666666665], [608.0, 3576.0], [610.0, 3545.0], [609.0, 3794.0], [611.0, 3737.0], [625.0, 4259.0], [624.0, 3784.0], [627.0, 3675.0], [626.0, 3925.0], [629.0, 4794.0], [628.0, 4391.0], [638.0, 3790.0], [637.0, 3566.0], [639.0, 3730.3333333333335], [632.0, 3303.0], [633.0, 3558.0], [635.0, 4530.0], [634.0, 4110.0], [631.0, 3905.5], [630.0, 3685.0], [643.0, 3537.5], [640.0, 3624.285714285714], [642.0, 3936.5714285714284], [641.0, 3205.5], [646.0, 4467.5], [648.0, 4026.5], [647.0, 3961.0], [645.0, 4371.0], [644.0, 4109.0], [1.0, 4940.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[319.25400000000036, 3775.814999999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 648.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6283.333333333333, "minX": 1.54958352E12, "maxY": 6998.7, "series": [{"data": [[1.54958352E12, 6998.7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958352E12, 6283.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3775.814999999999, "minX": 1.54958352E12, "maxY": 3775.814999999999, "series": [{"data": [[1.54958352E12, 3775.814999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958352E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3775.8040000000015, "minX": 1.54958352E12, "maxY": 3775.8040000000015, "series": [{"data": [[1.54958352E12, 3775.8040000000015]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958352E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 47.345999999999975, "minX": 1.54958352E12, "maxY": 47.345999999999975, "series": [{"data": [[1.54958352E12, 47.345999999999975]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958352E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 272.0, "minX": 1.54958352E12, "maxY": 7842.0, "series": [{"data": [[1.54958352E12, 7842.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958352E12, 272.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958352E12, 5515.2]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958352E12, 6869.4800000000005]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958352E12, 5985.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4232.5, "minX": 16.0, "maxY": 4232.5, "series": [{"data": [[16.0, 4232.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4232.5, "minX": 16.0, "maxY": 4232.5, "series": [{"data": [[16.0, 4232.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958352E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958352E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958352E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958352E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958352E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958352E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958352E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958352E12, "title": "Transactions Per Second"}},
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
