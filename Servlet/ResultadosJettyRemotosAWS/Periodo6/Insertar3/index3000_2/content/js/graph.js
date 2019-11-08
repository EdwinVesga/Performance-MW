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
        data: {"result": {"minY": 227.0, "minX": 0.0, "maxY": 10180.0, "series": [{"data": [[0.0, 227.0], [0.1, 273.0], [0.2, 287.0], [0.3, 318.0], [0.4, 348.0], [0.5, 359.0], [0.6, 384.0], [0.7, 400.0], [0.8, 403.0], [0.9, 406.0], [1.0, 423.0], [1.1, 439.0], [1.2, 449.0], [1.3, 452.0], [1.4, 464.0], [1.5, 477.0], [1.6, 483.0], [1.7, 493.0], [1.8, 497.0], [1.9, 507.0], [2.0, 512.0], [2.1, 518.0], [2.2, 521.0], [2.3, 534.0], [2.4, 547.0], [2.5, 551.0], [2.6, 559.0], [2.7, 562.0], [2.8, 573.0], [2.9, 581.0], [3.0, 587.0], [3.1, 607.0], [3.2, 615.0], [3.3, 628.0], [3.4, 668.0], [3.5, 686.0], [3.6, 701.0], [3.7, 715.0], [3.8, 740.0], [3.9, 781.0], [4.0, 853.0], [4.1, 953.0], [4.2, 1102.0], [4.3, 1140.0], [4.4, 1181.0], [4.5, 1226.0], [4.6, 1275.0], [4.7, 1317.0], [4.8, 1343.0], [4.9, 1355.0], [5.0, 1360.0], [5.1, 1393.0], [5.2, 1406.0], [5.3, 1415.0], [5.4, 1433.0], [5.5, 1443.0], [5.6, 1451.0], [5.7, 1462.0], [5.8, 1484.0], [5.9, 1509.0], [6.0, 1536.0], [6.1, 1548.0], [6.2, 1562.0], [6.3, 1575.0], [6.4, 1580.0], [6.5, 1602.0], [6.6, 1618.0], [6.7, 1622.0], [6.8, 1627.0], [6.9, 1649.0], [7.0, 1655.0], [7.1, 1666.0], [7.2, 1686.0], [7.3, 1707.0], [7.4, 1723.0], [7.5, 1736.0], [7.6, 1746.0], [7.7, 1749.0], [7.8, 1764.0], [7.9, 1774.0], [8.0, 1784.0], [8.1, 1795.0], [8.2, 1801.0], [8.3, 1810.0], [8.4, 1820.0], [8.5, 1822.0], [8.6, 1828.0], [8.7, 1829.0], [8.8, 1838.0], [8.9, 1845.0], [9.0, 1858.0], [9.1, 1867.0], [9.2, 1878.0], [9.3, 1884.0], [9.4, 1897.0], [9.5, 1914.0], [9.6, 1921.0], [9.7, 1923.0], [9.8, 1925.0], [9.9, 1940.0], [10.0, 1955.0], [10.1, 1967.0], [10.2, 1979.0], [10.3, 1988.0], [10.4, 2000.0], [10.5, 2004.0], [10.6, 2007.0], [10.7, 2011.0], [10.8, 2021.0], [10.9, 2029.0], [11.0, 2034.0], [11.1, 2038.0], [11.2, 2057.0], [11.3, 2064.0], [11.4, 2065.0], [11.5, 2071.0], [11.6, 2078.0], [11.7, 2090.0], [11.8, 2095.0], [11.9, 2099.0], [12.0, 2106.0], [12.1, 2108.0], [12.2, 2110.0], [12.3, 2114.0], [12.4, 2117.0], [12.5, 2129.0], [12.6, 2138.0], [12.7, 2157.0], [12.8, 2179.0], [12.9, 2184.0], [13.0, 2197.0], [13.1, 2204.0], [13.2, 2211.0], [13.3, 2224.0], [13.4, 2231.0], [13.5, 2243.0], [13.6, 2254.0], [13.7, 2260.0], [13.8, 2266.0], [13.9, 2267.0], [14.0, 2271.0], [14.1, 2282.0], [14.2, 2292.0], [14.3, 2314.0], [14.4, 2325.0], [14.5, 2336.0], [14.6, 2347.0], [14.7, 2361.0], [14.8, 2368.0], [14.9, 2375.0], [15.0, 2388.0], [15.1, 2394.0], [15.2, 2409.0], [15.3, 2435.0], [15.4, 2442.0], [15.5, 2452.0], [15.6, 2463.0], [15.7, 2483.0], [15.8, 2493.0], [15.9, 2500.0], [16.0, 2501.0], [16.1, 2536.0], [16.2, 2547.0], [16.3, 2553.0], [16.4, 2560.0], [16.5, 2570.0], [16.6, 2573.0], [16.7, 2579.0], [16.8, 2598.0], [16.9, 2608.0], [17.0, 2618.0], [17.1, 2636.0], [17.2, 2647.0], [17.3, 2652.0], [17.4, 2660.0], [17.5, 2671.0], [17.6, 2675.0], [17.7, 2682.0], [17.8, 2684.0], [17.9, 2692.0], [18.0, 2702.0], [18.1, 2705.0], [18.2, 2710.0], [18.3, 2713.0], [18.4, 2717.0], [18.5, 2724.0], [18.6, 2736.0], [18.7, 2738.0], [18.8, 2744.0], [18.9, 2748.0], [19.0, 2749.0], [19.1, 2761.0], [19.2, 2774.0], [19.3, 2782.0], [19.4, 2788.0], [19.5, 2798.0], [19.6, 2807.0], [19.7, 2813.0], [19.8, 2829.0], [19.9, 2835.0], [20.0, 2845.0], [20.1, 2851.0], [20.2, 2856.0], [20.3, 2860.0], [20.4, 2870.0], [20.5, 2879.0], [20.6, 2884.0], [20.7, 2890.0], [20.8, 2896.0], [20.9, 2907.0], [21.0, 2909.0], [21.1, 2920.0], [21.2, 2924.0], [21.3, 2930.0], [21.4, 2933.0], [21.5, 2937.0], [21.6, 2940.0], [21.7, 2942.0], [21.8, 2950.0], [21.9, 2955.0], [22.0, 2960.0], [22.1, 2961.0], [22.2, 2964.0], [22.3, 2972.0], [22.4, 2974.0], [22.5, 2978.0], [22.6, 2981.0], [22.7, 2991.0], [22.8, 2998.0], [22.9, 3006.0], [23.0, 3013.0], [23.1, 3027.0], [23.2, 3032.0], [23.3, 3037.0], [23.4, 3046.0], [23.5, 3049.0], [23.6, 3052.0], [23.7, 3058.0], [23.8, 3070.0], [23.9, 3079.0], [24.0, 3085.0], [24.1, 3092.0], [24.2, 3106.0], [24.3, 3116.0], [24.4, 3119.0], [24.5, 3127.0], [24.6, 3130.0], [24.7, 3142.0], [24.8, 3154.0], [24.9, 3159.0], [25.0, 3169.0], [25.1, 3174.0], [25.2, 3183.0], [25.3, 3188.0], [25.4, 3193.0], [25.5, 3198.0], [25.6, 3203.0], [25.7, 3211.0], [25.8, 3220.0], [25.9, 3224.0], [26.0, 3229.0], [26.1, 3239.0], [26.2, 3244.0], [26.3, 3256.0], [26.4, 3260.0], [26.5, 3268.0], [26.6, 3270.0], [26.7, 3276.0], [26.8, 3278.0], [26.9, 3283.0], [27.0, 3285.0], [27.1, 3295.0], [27.2, 3298.0], [27.3, 3310.0], [27.4, 3315.0], [27.5, 3322.0], [27.6, 3335.0], [27.7, 3343.0], [27.8, 3357.0], [27.9, 3363.0], [28.0, 3381.0], [28.1, 3390.0], [28.2, 3415.0], [28.3, 3420.0], [28.4, 3427.0], [28.5, 3436.0], [28.6, 3445.0], [28.7, 3462.0], [28.8, 3477.0], [28.9, 3487.0], [29.0, 3501.0], [29.1, 3509.0], [29.2, 3527.0], [29.3, 3539.0], [29.4, 3547.0], [29.5, 3558.0], [29.6, 3564.0], [29.7, 3582.0], [29.8, 3599.0], [29.9, 3607.0], [30.0, 3620.0], [30.1, 3621.0], [30.2, 3651.0], [30.3, 3659.0], [30.4, 3686.0], [30.5, 3698.0], [30.6, 3716.0], [30.7, 3735.0], [30.8, 3749.0], [30.9, 3759.0], [31.0, 3769.0], [31.1, 3779.0], [31.2, 3793.0], [31.3, 3794.0], [31.4, 3798.0], [31.5, 3809.0], [31.6, 3817.0], [31.7, 3821.0], [31.8, 3834.0], [31.9, 3836.0], [32.0, 3842.0], [32.1, 3868.0], [32.2, 3881.0], [32.3, 3889.0], [32.4, 3905.0], [32.5, 3913.0], [32.6, 3930.0], [32.7, 3950.0], [32.8, 3956.0], [32.9, 3969.0], [33.0, 3974.0], [33.1, 3984.0], [33.2, 3990.0], [33.3, 3996.0], [33.4, 3999.0], [33.5, 4012.0], [33.6, 4023.0], [33.7, 4027.0], [33.8, 4031.0], [33.9, 4035.0], [34.0, 4042.0], [34.1, 4043.0], [34.2, 4059.0], [34.3, 4067.0], [34.4, 4085.0], [34.5, 4094.0], [34.6, 4108.0], [34.7, 4117.0], [34.8, 4126.0], [34.9, 4132.0], [35.0, 4139.0], [35.1, 4148.0], [35.2, 4150.0], [35.3, 4160.0], [35.4, 4176.0], [35.5, 4181.0], [35.6, 4194.0], [35.7, 4201.0], [35.8, 4209.0], [35.9, 4222.0], [36.0, 4231.0], [36.1, 4235.0], [36.2, 4243.0], [36.3, 4252.0], [36.4, 4254.0], [36.5, 4264.0], [36.6, 4269.0], [36.7, 4286.0], [36.8, 4297.0], [36.9, 4303.0], [37.0, 4313.0], [37.1, 4332.0], [37.2, 4340.0], [37.3, 4349.0], [37.4, 4360.0], [37.5, 4367.0], [37.6, 4376.0], [37.7, 4389.0], [37.8, 4394.0], [37.9, 4408.0], [38.0, 4414.0], [38.1, 4419.0], [38.2, 4442.0], [38.3, 4450.0], [38.4, 4462.0], [38.5, 4466.0], [38.6, 4483.0], [38.7, 4487.0], [38.8, 4493.0], [38.9, 4501.0], [39.0, 4511.0], [39.1, 4517.0], [39.2, 4523.0], [39.3, 4533.0], [39.4, 4547.0], [39.5, 4556.0], [39.6, 4562.0], [39.7, 4570.0], [39.8, 4577.0], [39.9, 4586.0], [40.0, 4587.0], [40.1, 4589.0], [40.2, 4598.0], [40.3, 4609.0], [40.4, 4618.0], [40.5, 4628.0], [40.6, 4632.0], [40.7, 4638.0], [40.8, 4647.0], [40.9, 4653.0], [41.0, 4657.0], [41.1, 4661.0], [41.2, 4667.0], [41.3, 4675.0], [41.4, 4682.0], [41.5, 4689.0], [41.6, 4706.0], [41.7, 4714.0], [41.8, 4718.0], [41.9, 4727.0], [42.0, 4734.0], [42.1, 4757.0], [42.2, 4764.0], [42.3, 4768.0], [42.4, 4785.0], [42.5, 4794.0], [42.6, 4807.0], [42.7, 4812.0], [42.8, 4815.0], [42.9, 4820.0], [43.0, 4828.0], [43.1, 4844.0], [43.2, 4850.0], [43.3, 4867.0], [43.4, 4874.0], [43.5, 4878.0], [43.6, 4881.0], [43.7, 4892.0], [43.8, 4896.0], [43.9, 4909.0], [44.0, 4920.0], [44.1, 4941.0], [44.2, 4950.0], [44.3, 4954.0], [44.4, 4956.0], [44.5, 4964.0], [44.6, 4969.0], [44.7, 4991.0], [44.8, 4995.0], [44.9, 5006.0], [45.0, 5024.0], [45.1, 5030.0], [45.2, 5037.0], [45.3, 5046.0], [45.4, 5054.0], [45.5, 5061.0], [45.6, 5067.0], [45.7, 5086.0], [45.8, 5093.0], [45.9, 5101.0], [46.0, 5108.0], [46.1, 5114.0], [46.2, 5128.0], [46.3, 5132.0], [46.4, 5133.0], [46.5, 5139.0], [46.6, 5146.0], [46.7, 5166.0], [46.8, 5175.0], [46.9, 5181.0], [47.0, 5185.0], [47.1, 5193.0], [47.2, 5200.0], [47.3, 5220.0], [47.4, 5233.0], [47.5, 5245.0], [47.6, 5254.0], [47.7, 5259.0], [47.8, 5263.0], [47.9, 5273.0], [48.0, 5282.0], [48.1, 5292.0], [48.2, 5318.0], [48.3, 5327.0], [48.4, 5330.0], [48.5, 5335.0], [48.6, 5339.0], [48.7, 5349.0], [48.8, 5361.0], [48.9, 5383.0], [49.0, 5389.0], [49.1, 5397.0], [49.2, 5402.0], [49.3, 5409.0], [49.4, 5426.0], [49.5, 5428.0], [49.6, 5439.0], [49.7, 5449.0], [49.8, 5459.0], [49.9, 5467.0], [50.0, 5472.0], [50.1, 5479.0], [50.2, 5496.0], [50.3, 5509.0], [50.4, 5515.0], [50.5, 5526.0], [50.6, 5536.0], [50.7, 5548.0], [50.8, 5572.0], [50.9, 5577.0], [51.0, 5582.0], [51.1, 5597.0], [51.2, 5602.0], [51.3, 5607.0], [51.4, 5611.0], [51.5, 5621.0], [51.6, 5631.0], [51.7, 5637.0], [51.8, 5638.0], [51.9, 5651.0], [52.0, 5662.0], [52.1, 5678.0], [52.2, 5692.0], [52.3, 5706.0], [52.4, 5712.0], [52.5, 5723.0], [52.6, 5730.0], [52.7, 5741.0], [52.8, 5752.0], [52.9, 5761.0], [53.0, 5764.0], [53.1, 5775.0], [53.2, 5786.0], [53.3, 5808.0], [53.4, 5820.0], [53.5, 5827.0], [53.6, 5831.0], [53.7, 5838.0], [53.8, 5848.0], [53.9, 5855.0], [54.0, 5865.0], [54.1, 5885.0], [54.2, 5901.0], [54.3, 5915.0], [54.4, 5925.0], [54.5, 5933.0], [54.6, 5943.0], [54.7, 5959.0], [54.8, 5966.0], [54.9, 5993.0], [55.0, 5998.0], [55.1, 6013.0], [55.2, 6020.0], [55.3, 6030.0], [55.4, 6038.0], [55.5, 6045.0], [55.6, 6051.0], [55.7, 6064.0], [55.8, 6068.0], [55.9, 6071.0], [56.0, 6093.0], [56.1, 6102.0], [56.2, 6111.0], [56.3, 6119.0], [56.4, 6127.0], [56.5, 6131.0], [56.6, 6143.0], [56.7, 6151.0], [56.8, 6162.0], [56.9, 6165.0], [57.0, 6169.0], [57.1, 6174.0], [57.2, 6177.0], [57.3, 6185.0], [57.4, 6189.0], [57.5, 6191.0], [57.6, 6195.0], [57.7, 6200.0], [57.8, 6206.0], [57.9, 6214.0], [58.0, 6222.0], [58.1, 6235.0], [58.2, 6242.0], [58.3, 6246.0], [58.4, 6249.0], [58.5, 6265.0], [58.6, 6267.0], [58.7, 6272.0], [58.8, 6275.0], [58.9, 6282.0], [59.0, 6292.0], [59.1, 6296.0], [59.2, 6299.0], [59.3, 6309.0], [59.4, 6325.0], [59.5, 6331.0], [59.6, 6336.0], [59.7, 6338.0], [59.8, 6348.0], [59.9, 6356.0], [60.0, 6365.0], [60.1, 6368.0], [60.2, 6377.0], [60.3, 6380.0], [60.4, 6382.0], [60.5, 6384.0], [60.6, 6393.0], [60.7, 6404.0], [60.8, 6411.0], [60.9, 6420.0], [61.0, 6434.0], [61.1, 6442.0], [61.2, 6446.0], [61.3, 6450.0], [61.4, 6461.0], [61.5, 6464.0], [61.6, 6470.0], [61.7, 6472.0], [61.8, 6493.0], [61.9, 6498.0], [62.0, 6509.0], [62.1, 6520.0], [62.2, 6524.0], [62.3, 6531.0], [62.4, 6541.0], [62.5, 6552.0], [62.6, 6560.0], [62.7, 6566.0], [62.8, 6585.0], [62.9, 6593.0], [63.0, 6599.0], [63.1, 6606.0], [63.2, 6614.0], [63.3, 6618.0], [63.4, 6628.0], [63.5, 6633.0], [63.6, 6640.0], [63.7, 6650.0], [63.8, 6656.0], [63.9, 6662.0], [64.0, 6666.0], [64.1, 6672.0], [64.2, 6679.0], [64.3, 6688.0], [64.4, 6695.0], [64.5, 6696.0], [64.6, 6699.0], [64.7, 6701.0], [64.8, 6702.0], [64.9, 6708.0], [65.0, 6713.0], [65.1, 6721.0], [65.2, 6727.0], [65.3, 6741.0], [65.4, 6759.0], [65.5, 6763.0], [65.6, 6764.0], [65.7, 6771.0], [65.8, 6781.0], [65.9, 6788.0], [66.0, 6808.0], [66.1, 6817.0], [66.2, 6822.0], [66.3, 6828.0], [66.4, 6833.0], [66.5, 6841.0], [66.6, 6844.0], [66.7, 6854.0], [66.8, 6861.0], [66.9, 6863.0], [67.0, 6873.0], [67.1, 6877.0], [67.2, 6883.0], [67.3, 6891.0], [67.4, 6898.0], [67.5, 6912.0], [67.6, 6916.0], [67.7, 6922.0], [67.8, 6934.0], [67.9, 6950.0], [68.0, 6955.0], [68.1, 6960.0], [68.2, 6964.0], [68.3, 6968.0], [68.4, 6976.0], [68.5, 6979.0], [68.6, 6983.0], [68.7, 6996.0], [68.8, 7001.0], [68.9, 7004.0], [69.0, 7006.0], [69.1, 7013.0], [69.2, 7020.0], [69.3, 7026.0], [69.4, 7027.0], [69.5, 7030.0], [69.6, 7037.0], [69.7, 7048.0], [69.8, 7057.0], [69.9, 7070.0], [70.0, 7076.0], [70.1, 7086.0], [70.2, 7090.0], [70.3, 7094.0], [70.4, 7105.0], [70.5, 7111.0], [70.6, 7125.0], [70.7, 7132.0], [70.8, 7141.0], [70.9, 7151.0], [71.0, 7154.0], [71.1, 7165.0], [71.2, 7175.0], [71.3, 7179.0], [71.4, 7183.0], [71.5, 7186.0], [71.6, 7193.0], [71.7, 7205.0], [71.8, 7211.0], [71.9, 7219.0], [72.0, 7224.0], [72.1, 7241.0], [72.2, 7246.0], [72.3, 7258.0], [72.4, 7273.0], [72.5, 7287.0], [72.6, 7295.0], [72.7, 7302.0], [72.8, 7310.0], [72.9, 7313.0], [73.0, 7322.0], [73.1, 7329.0], [73.2, 7343.0], [73.3, 7358.0], [73.4, 7368.0], [73.5, 7390.0], [73.6, 7395.0], [73.7, 7413.0], [73.8, 7423.0], [73.9, 7424.0], [74.0, 7432.0], [74.1, 7442.0], [74.2, 7454.0], [74.3, 7461.0], [74.4, 7468.0], [74.5, 7475.0], [74.6, 7484.0], [74.7, 7495.0], [74.8, 7501.0], [74.9, 7505.0], [75.0, 7514.0], [75.1, 7528.0], [75.2, 7539.0], [75.3, 7568.0], [75.4, 7593.0], [75.5, 7598.0], [75.6, 7607.0], [75.7, 7620.0], [75.8, 7633.0], [75.9, 7646.0], [76.0, 7667.0], [76.1, 7698.0], [76.2, 7713.0], [76.3, 7735.0], [76.4, 7750.0], [76.5, 7789.0], [76.6, 7812.0], [76.7, 7829.0], [76.8, 7849.0], [76.9, 7872.0], [77.0, 7893.0], [77.1, 7913.0], [77.2, 7932.0], [77.3, 7947.0], [77.4, 7967.0], [77.5, 7987.0], [77.6, 8001.0], [77.7, 8008.0], [77.8, 8019.0], [77.9, 8033.0], [78.0, 8044.0], [78.1, 8049.0], [78.2, 8075.0], [78.3, 8081.0], [78.4, 8086.0], [78.5, 8102.0], [78.6, 8108.0], [78.7, 8119.0], [78.8, 8132.0], [78.9, 8147.0], [79.0, 8157.0], [79.1, 8181.0], [79.2, 8185.0], [79.3, 8196.0], [79.4, 8204.0], [79.5, 8212.0], [79.6, 8218.0], [79.7, 8229.0], [79.8, 8232.0], [79.9, 8242.0], [80.0, 8250.0], [80.1, 8257.0], [80.2, 8268.0], [80.3, 8274.0], [80.4, 8280.0], [80.5, 8288.0], [80.6, 8291.0], [80.7, 8303.0], [80.8, 8308.0], [80.9, 8314.0], [81.0, 8320.0], [81.1, 8329.0], [81.2, 8341.0], [81.3, 8346.0], [81.4, 8363.0], [81.5, 8367.0], [81.6, 8373.0], [81.7, 8383.0], [81.8, 8399.0], [81.9, 8408.0], [82.0, 8417.0], [82.1, 8423.0], [82.2, 8428.0], [82.3, 8439.0], [82.4, 8451.0], [82.5, 8462.0], [82.6, 8469.0], [82.7, 8486.0], [82.8, 8495.0], [82.9, 8508.0], [83.0, 8516.0], [83.1, 8524.0], [83.2, 8535.0], [83.3, 8542.0], [83.4, 8551.0], [83.5, 8554.0], [83.6, 8562.0], [83.7, 8566.0], [83.8, 8577.0], [83.9, 8588.0], [84.0, 8598.0], [84.1, 8607.0], [84.2, 8614.0], [84.3, 8627.0], [84.4, 8637.0], [84.5, 8643.0], [84.6, 8649.0], [84.7, 8653.0], [84.8, 8655.0], [84.9, 8659.0], [85.0, 8664.0], [85.1, 8674.0], [85.2, 8677.0], [85.3, 8681.0], [85.4, 8687.0], [85.5, 8700.0], [85.6, 8707.0], [85.7, 8712.0], [85.8, 8717.0], [85.9, 8721.0], [86.0, 8727.0], [86.1, 8738.0], [86.2, 8741.0], [86.3, 8747.0], [86.4, 8755.0], [86.5, 8757.0], [86.6, 8764.0], [86.7, 8771.0], [86.8, 8772.0], [86.9, 8782.0], [87.0, 8791.0], [87.1, 8799.0], [87.2, 8806.0], [87.3, 8824.0], [87.4, 8828.0], [87.5, 8842.0], [87.6, 8847.0], [87.7, 8851.0], [87.8, 8853.0], [87.9, 8858.0], [88.0, 8867.0], [88.1, 8871.0], [88.2, 8887.0], [88.3, 8893.0], [88.4, 8900.0], [88.5, 8906.0], [88.6, 8916.0], [88.7, 8929.0], [88.8, 8933.0], [88.9, 8946.0], [89.0, 8949.0], [89.1, 8951.0], [89.2, 8957.0], [89.3, 8960.0], [89.4, 8965.0], [89.5, 8970.0], [89.6, 8978.0], [89.7, 8979.0], [89.8, 8984.0], [89.9, 8999.0], [90.0, 9001.0], [90.1, 9005.0], [90.2, 9010.0], [90.3, 9014.0], [90.4, 9021.0], [90.5, 9025.0], [90.6, 9035.0], [90.7, 9036.0], [90.8, 9040.0], [90.9, 9054.0], [91.0, 9059.0], [91.1, 9070.0], [91.2, 9082.0], [91.3, 9093.0], [91.4, 9095.0], [91.5, 9097.0], [91.6, 9108.0], [91.7, 9118.0], [91.8, 9125.0], [91.9, 9131.0], [92.0, 9136.0], [92.1, 9163.0], [92.2, 9166.0], [92.3, 9173.0], [92.4, 9178.0], [92.5, 9182.0], [92.6, 9190.0], [92.7, 9197.0], [92.8, 9202.0], [92.9, 9209.0], [93.0, 9221.0], [93.1, 9225.0], [93.2, 9233.0], [93.3, 9244.0], [93.4, 9257.0], [93.5, 9260.0], [93.6, 9266.0], [93.7, 9269.0], [93.8, 9282.0], [93.9, 9298.0], [94.0, 9306.0], [94.1, 9316.0], [94.2, 9326.0], [94.3, 9335.0], [94.4, 9342.0], [94.5, 9358.0], [94.6, 9365.0], [94.7, 9373.0], [94.8, 9386.0], [94.9, 9388.0], [95.0, 9395.0], [95.1, 9406.0], [95.2, 9411.0], [95.3, 9416.0], [95.4, 9422.0], [95.5, 9436.0], [95.6, 9438.0], [95.7, 9444.0], [95.8, 9453.0], [95.9, 9466.0], [96.0, 9470.0], [96.1, 9503.0], [96.2, 9524.0], [96.3, 9528.0], [96.4, 9531.0], [96.5, 9538.0], [96.6, 9548.0], [96.7, 9553.0], [96.8, 9561.0], [96.9, 9575.0], [97.0, 9580.0], [97.1, 9590.0], [97.2, 9599.0], [97.3, 9602.0], [97.4, 9613.0], [97.5, 9617.0], [97.6, 9639.0], [97.7, 9644.0], [97.8, 9650.0], [97.9, 9655.0], [98.0, 9663.0], [98.1, 9680.0], [98.2, 9696.0], [98.3, 9717.0], [98.4, 9740.0], [98.5, 9757.0], [98.6, 9774.0], [98.7, 9786.0], [98.8, 9796.0], [98.9, 9818.0], [99.0, 9847.0], [99.1, 9854.0], [99.2, 9869.0], [99.3, 9891.0], [99.4, 9907.0], [99.5, 9920.0], [99.6, 9938.0], [99.7, 9957.0], [99.8, 9991.0], [99.9, 10019.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 61.0, "series": [{"data": [[200.0, 9.0], [300.0, 12.0], [400.0, 34.0], [500.0, 36.0], [600.0, 17.0], [700.0, 11.0], [800.0, 3.0], [900.0, 3.0], [1000.0, 1.0], [1100.0, 8.0], [1200.0, 7.0], [1300.0, 13.0], [1400.0, 23.0], [1500.0, 18.0], [1600.0, 24.0], [1700.0, 26.0], [1800.0, 38.0], [1900.0, 29.0], [2000.0, 46.0], [2100.0, 33.0], [2300.0, 26.0], [2200.0, 37.0], [2400.0, 23.0], [2500.0, 30.0], [2600.0, 31.0], [2700.0, 47.0], [2800.0, 39.0], [2900.0, 61.0], [3000.0, 40.0], [3100.0, 40.0], [3200.0, 51.0], [3300.0, 28.0], [3400.0, 25.0], [3500.0, 26.0], [3700.0, 27.0], [3600.0, 20.0], [3800.0, 28.0], [3900.0, 32.0], [4000.0, 33.0], [4200.0, 35.0], [4100.0, 35.0], [4300.0, 30.0], [4400.0, 31.0], [4500.0, 40.0], [4600.0, 40.0], [4800.0, 40.0], [4700.0, 29.0], [5100.0, 40.0], [5000.0, 30.0], [4900.0, 31.0], [5200.0, 29.0], [5300.0, 29.0], [5500.0, 27.0], [5600.0, 33.0], [5400.0, 34.0], [5800.0, 28.0], [5700.0, 30.0], [6100.0, 49.0], [5900.0, 25.0], [6000.0, 31.0], [6200.0, 46.0], [6300.0, 43.0], [6400.0, 39.0], [6600.0, 48.0], [6500.0, 32.0], [6700.0, 39.0], [6800.0, 45.0], [6900.0, 40.0], [7000.0, 48.0], [7100.0, 40.0], [7300.0, 29.0], [7400.0, 34.0], [7200.0, 29.0], [7600.0, 19.0], [7500.0, 23.0], [7700.0, 13.0], [7800.0, 14.0], [7900.0, 16.0], [8000.0, 27.0], [8100.0, 26.0], [8600.0, 43.0], [8200.0, 39.0], [8300.0, 35.0], [8700.0, 50.0], [8500.0, 37.0], [8400.0, 30.0], [8800.0, 37.0], [9000.0, 48.0], [8900.0, 47.0], [9200.0, 35.0], [9100.0, 36.0], [9300.0, 33.0], [9400.0, 32.0], [9500.0, 35.0], [9600.0, 29.0], [9700.0, 18.0], [10000.0, 3.0], [9800.0, 15.0], [9900.0, 15.0], [10100.0, 2.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 10100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 56.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2823.0, "series": [{"data": [[1.0, 121.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 56.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2823.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 267.57677902621725, "minX": 1.5495834E12, "maxY": 1167.9229521492298, "series": [{"data": [[1.5495834E12, 1167.9229521492298], [1.54958346E12, 267.57677902621725]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 247.0, "minX": 1.0, "maxY": 10180.0, "series": [{"data": [[2.0, 9600.0], [3.0, 9452.0], [4.0, 8979.0], [5.0, 9197.0], [6.0, 9848.0], [8.0, 9323.0], [10.0, 9032.0], [11.0, 9748.5], [13.0, 9009.0], [14.0, 9946.0], [15.0, 9414.0], [16.0, 9872.0], [18.0, 9393.0], [19.0, 9847.0], [20.0, 9259.0], [21.0, 9641.0], [23.0, 9528.0], [24.0, 9099.0], [25.0, 9340.0], [26.0, 9171.0], [28.0, 9709.0], [29.0, 9298.0], [30.0, 9503.0], [31.0, 9771.0], [33.0, 9473.5], [35.0, 9891.0], [34.0, 9365.0], [37.0, 9319.0], [36.0, 9782.0], [39.0, 9285.0], [38.0, 9805.0], [41.0, 9957.0], [40.0, 9411.0], [43.0, 9743.0], [45.0, 9555.5], [46.0, 9991.0], [49.0, 9271.0], [48.0, 9730.0], [51.0, 9726.0], [50.0, 9077.0], [52.0, 9335.0], [55.0, 9929.0], [54.0, 9432.0], [57.0, 9614.0], [56.0, 9727.0], [59.0, 9173.0], [58.0, 9199.0], [61.0, 9774.0], [60.0, 9035.0], [63.0, 9176.5], [67.0, 9546.0], [66.0, 9827.5], [64.0, 9177.0], [71.0, 9285.5], [69.0, 9421.5], [75.0, 9665.0], [74.0, 9443.0], [73.0, 9143.0], [72.0, 9225.0], [79.0, 8949.0], [78.0, 9444.0], [77.0, 9005.0], [76.0, 9645.0], [83.0, 9421.0], [82.0, 9828.0], [81.0, 9260.0], [80.0, 9864.0], [87.0, 9650.0], [86.0, 9639.0], [85.0, 9038.0], [84.0, 9786.0], [90.0, 9018.0], [89.0, 9166.0], [88.0, 9852.0], [93.0, 3351.0], [92.0, 6316.0], [95.0, 9621.0], [94.0, 9127.0], [97.0, 6186.0], [96.0, 247.0], [99.0, 9882.0], [98.0, 9307.0], [103.0, 3199.0], [102.0, 8946.0], [101.0, 9579.0], [105.0, 2639.75], [106.0, 5130.5], [104.0, 4612.5], [107.0, 8970.0], [110.0, 4796.0], [111.0, 9692.0], [109.0, 9121.0], [108.0, 9307.0], [115.0, 426.0], [114.0, 3335.6666666666665], [113.0, 3409.6666666666665], [112.0, 9407.0], [118.0, 2218.6], [119.0, 1952.8333333333335], [117.0, 4724.0], [116.0, 6341.0], [122.0, 5041.0], [123.0, 484.5], [121.0, 9342.0], [120.0, 9854.0], [125.0, 3339.0], [126.0, 3481.6666666666665], [124.0, 6511.333333333333], [127.0, 519.0], [129.0, 2730.0], [132.0, 5061.0], [135.0, 3443.3333333333335], [134.0, 9748.0], [133.0, 8871.0], [131.0, 9526.0], [130.0, 9469.0], [128.0, 8899.0], [138.0, 4972.0], [141.0, 2216.8], [140.0, 4676.0], [143.0, 4911.0], [142.0, 5224.5], [139.0, 9466.0], [137.0, 9222.0], [136.0, 9653.0], [145.0, 1612.0], [144.0, 3334.6666666666665], [151.0, 2383.8], [150.0, 2822.0], [149.0, 1910.1666666666667], [147.0, 4822.0], [146.0, 5022.0], [148.0, 2790.5], [159.0, 8756.0], [158.0, 9121.5], [156.0, 9245.5], [154.0, 8739.0], [153.0, 9370.0], [152.0, 8844.0], [161.0, 6226.333333333333], [162.0, 4950.5], [166.0, 8797.0], [165.0, 9655.0], [164.0, 9268.5], [169.0, 5052.0], [170.0, 4914.0], [175.0, 9036.0], [174.0, 9533.0], [173.0, 9282.0], [172.0, 8957.0], [171.0, 9228.0], [168.0, 9521.5], [177.0, 468.0], [178.0, 6307.333333333333], [179.0, 5011.5], [182.0, 4750.5], [183.0, 9611.0], [181.0, 9414.0], [180.0, 9264.0], [176.0, 9632.0], [185.0, 4870.5], [188.0, 2439.6], [190.0, 4888.0], [191.0, 9573.0], [189.0, 9147.0], [187.0, 9004.0], [186.0, 9537.0], [184.0, 9043.0], [193.0, 4637.0], [194.0, 4695.0], [196.0, 4933.5], [199.0, 4717.0], [198.0, 9599.0], [197.0, 9269.0], [195.0, 9470.0], [192.0, 9553.0], [206.0, 3696.0], [207.0, 9010.0], [205.0, 8714.0], [204.0, 9406.0], [203.0, 8906.0], [202.0, 9083.0], [201.0, 9165.0], [200.0, 9184.0], [215.0, 8892.0], [214.0, 8850.5], [212.0, 9267.0], [211.0, 9696.0], [210.0, 8649.0], [209.0, 9717.0], [208.0, 8948.0], [223.0, 9387.0], [222.0, 9125.0], [221.0, 9031.0], [219.0, 9325.0], [218.0, 9212.0], [217.0, 9287.5], [225.0, 4668.5], [231.0, 4616.5], [230.0, 9482.0], [229.0, 8724.0], [228.0, 9037.0], [227.0, 8717.0], [226.0, 9461.0], [224.0, 8828.0], [239.0, 9524.0], [238.0, 9392.0], [237.0, 8957.0], [236.0, 9503.0], [235.0, 8933.0], [234.0, 8799.0], [233.0, 8765.0], [232.0, 9187.0], [241.0, 5022.5], [245.0, 3257.0], [247.0, 8979.0], [246.0, 9581.0], [244.0, 8916.0], [243.0, 9344.0], [242.0, 8960.0], [240.0, 8851.0], [248.0, 4907.0], [249.0, 5102.5], [250.0, 4746.0], [251.0, 978.0], [253.0, 5150.0], [255.0, 4759.0], [254.0, 9340.0], [252.0, 8992.0], [268.0, 4716.5], [257.0, 5129.5], [259.0, 4812.5], [258.0, 8979.0], [261.0, 3359.0], [260.0, 8854.0], [263.0, 9001.0], [256.0, 8576.0], [262.0, 8727.0], [266.0, 5035.5], [267.0, 4952.0], [270.0, 3606.3333333333335], [271.0, 8977.0], [265.0, 8874.0], [264.0, 9553.0], [269.0, 9271.0], [286.0, 8907.0], [275.0, 4870.5], [274.0, 5195.5], [273.0, 10019.0], [272.0, 9558.0], [279.0, 9406.0], [278.0, 8742.0], [277.0, 8771.0], [276.0, 9575.0], [287.0, 8662.0], [284.0, 8554.0], [283.0, 9538.0], [282.0, 9404.0], [281.0, 8551.0], [280.0, 8525.0], [302.0, 9225.0], [303.0, 8968.0], [301.0, 8971.5], [291.0, 9269.0], [290.0, 9395.0], [289.0, 9177.0], [288.0, 9453.0], [299.0, 8462.0], [298.0, 8486.0], [297.0, 9000.0], [296.0, 8674.0], [295.0, 9036.0], [294.0, 9240.0], [293.0, 8887.0], [292.0, 9369.0], [318.0, 9010.0], [319.0, 8671.0], [317.0, 8536.0], [316.0, 9260.0], [315.0, 8535.0], [314.0, 9356.0], [313.0, 8738.0], [312.0, 8514.0], [311.0, 8508.0], [305.0, 8673.0], [304.0, 8479.0], [307.0, 8428.0], [306.0, 8607.0], [310.0, 9388.0], [309.0, 8656.0], [308.0, 8822.0], [334.0, 9059.0], [335.0, 8865.0], [333.0, 8848.0], [332.0, 8951.0], [331.0, 9093.0], [330.0, 8336.0], [329.0, 9191.0], [328.0, 8584.0], [327.0, 9386.0], [321.0, 8476.0], [320.0, 8431.0], [323.0, 8868.0], [322.0, 8388.0], [326.0, 8933.0], [325.0, 9219.0], [324.0, 8522.0], [350.0, 9945.0], [351.0, 8439.0], [349.0, 9021.0], [348.0, 8610.0], [347.0, 8469.0], [346.0, 9363.0], [345.0, 9202.0], [344.0, 8867.0], [343.0, 8757.0], [337.0, 9306.0], [336.0, 8296.0], [339.0, 9529.0], [338.0, 8709.0], [342.0, 8807.0], [341.0, 8764.0], [340.0, 8852.0], [366.0, 9293.0], [367.0, 8361.0], [365.0, 9118.0], [364.0, 9166.0], [363.0, 8647.0], [362.0, 8367.0], [361.0, 8829.0], [360.0, 8688.0], [359.0, 8800.0], [353.0, 9178.0], [352.0, 8772.0], [355.0, 8853.0], [354.0, 8569.0], [358.0, 9164.5], [356.0, 8229.0], [381.0, 10113.0], [383.0, 8807.0], [380.0, 8965.0], [371.0, 8949.0], [370.0, 8825.0], [369.0, 8462.0], [368.0, 8280.0], [379.0, 9266.0], [378.0, 8893.0], [377.0, 8642.0], [376.0, 8664.0], [375.0, 8196.0], [374.0, 8983.0], [373.0, 8654.0], [372.0, 10180.0], [398.0, 9125.0], [399.0, 8454.0], [397.0, 8857.0], [396.0, 8231.0], [395.0, 8999.0], [394.0, 8261.0], [393.0, 8894.0], [392.0, 9067.0], [391.0, 8517.0], [385.0, 8155.0], [384.0, 8136.0], [387.0, 9182.0], [386.0, 8797.0], [390.0, 9117.0], [389.0, 8755.0], [388.0, 8516.0], [414.0, 8761.5], [415.0, 8263.0], [412.0, 8242.0], [403.0, 8931.0], [402.0, 8851.0], [401.0, 9064.0], [400.0, 9094.0], [411.0, 8310.0], [410.0, 8227.0], [409.0, 9680.0], [408.0, 8220.0], [407.0, 8081.0], [406.0, 8425.0], [405.0, 9969.0], [404.0, 9001.0], [430.0, 9436.0], [431.0, 9190.0], [429.0, 9207.0], [428.0, 8539.0], [427.0, 9025.0], [426.0, 8453.0], [425.0, 8131.0], [424.0, 8130.0], [423.0, 8551.0], [417.0, 8627.0], [416.0, 9869.0], [419.0, 8712.0], [418.0, 8677.0], [422.0, 8341.0], [421.0, 8861.0], [420.0, 8637.0], [446.0, 8599.0], [447.0, 9922.0], [445.0, 8188.0], [444.0, 8769.0], [443.0, 8197.5], [441.0, 8700.0], [440.0, 8046.0], [439.0, 9604.0], [433.0, 7966.0], [432.0, 8308.0], [435.0, 8489.0], [434.0, 8606.0], [438.0, 8009.0], [437.0, 8274.0], [436.0, 8524.0], [462.0, 8679.0], [463.0, 8843.0], [461.0, 8677.0], [460.0, 8614.0], [459.0, 8984.0], [458.0, 8145.0], [457.0, 8363.0], [456.0, 9373.0], [455.0, 8250.0], [449.0, 9910.0], [448.0, 8240.0], [451.0, 8346.0], [450.0, 8364.0], [454.0, 9136.0], [453.0, 8075.0], [452.0, 9700.0], [478.0, 8328.0], [479.0, 8963.0], [476.0, 8348.0], [467.0, 9861.0], [466.0, 8316.0], [465.0, 8044.0], [464.0, 8108.0], [475.0, 8702.0], [474.0, 9663.0], [473.0, 8998.0], [472.0, 8250.0], [471.0, 9113.0], [470.0, 10006.0], [469.0, 9556.0], [468.0, 8182.0], [494.0, 8739.0], [495.0, 8380.0], [493.0, 9709.0], [492.0, 9054.0], [491.0, 9073.0], [490.0, 8088.0], [489.0, 8184.0], [488.0, 8733.0], [487.0, 7849.0], [481.0, 8503.0], [480.0, 9674.0], [483.0, 8403.0], [482.0, 8659.0], [486.0, 7789.0], [485.0, 8373.0], [484.0, 7781.0], [510.0, 8421.0], [511.0, 5469.5], [509.0, 7883.0], [508.0, 8654.0], [507.0, 7598.0], [506.0, 8241.0], [505.0, 8556.0], [504.0, 8687.0], [503.0, 9646.0], [497.0, 8232.0], [496.0, 7829.0], [499.0, 8561.0], [498.0, 8653.0], [502.0, 8279.0], [501.0, 7596.0], [500.0, 8662.0], [514.0, 1254.6666666666667], [512.0, 3796.6666666666665], [516.0, 8051.0], [518.0, 7967.0], [536.0, 7528.0], [538.0, 8154.0], [520.0, 4554.5], [522.0, 8675.0], [524.0, 8710.0], [526.0, 5155.5], [528.0, 8314.0], [530.0, 8824.0], [532.0, 8528.0], [534.0, 8742.0], [542.0, 9548.0], [540.0, 8588.0], [546.0, 8748.0], [544.0, 3844.6666666666665], [548.0, 9204.0], [550.0, 8185.0], [568.0, 8423.0], [556.0, 8207.0], [554.0, 7852.0], [552.0, 8951.0], [558.0, 8506.0], [564.0, 5366.0], [562.0, 9246.0], [560.0, 9306.0], [566.0, 8649.0], [572.0, 3221.75], [570.0, 8204.0], [574.0, 7680.0], [580.0, 8345.0], [582.0, 4552.5], [578.0, 9425.0], [600.0, 8411.0], [590.0, 5427.5], [588.0, 8289.0], [586.0, 7501.0], [584.0, 8723.0], [576.0, 8303.0], [598.0, 9025.0], [602.0, 3723.6666666666665], [604.0, 8578.0], [592.0, 8562.0], [594.0, 8551.0], [596.0, 7152.0], [606.0, 8408.0], [608.0, 7937.0], [622.0, 1317.0], [616.0, 4822.5], [620.0, 4433.0], [618.0, 8704.0], [610.0, 7356.0], [612.0, 9040.0], [614.0, 8364.0], [632.0, 7321.0], [634.0, 8320.0], [624.0, 4942.0], [626.0, 7896.0], [628.0, 8102.0], [630.0, 8039.0], [636.0, 3843.0], [638.0, 6977.0], [640.0, 3947.3333333333335], [642.0, 8337.0], [654.0, 8302.0], [652.0, 7090.0], [650.0, 8041.0], [648.0, 8607.0], [644.0, 5032.5], [656.0, 5001.0], [658.0, 9031.0], [660.0, 8563.0], [662.0, 8549.0], [664.0, 3841.6666666666665], [646.0, 8004.0], [666.0, 8022.0], [668.0, 4895.5], [670.0, 8698.0], [678.0, 8316.0], [686.0, 5051.5], [682.0, 4168.8], [672.0, 5188.0], [696.0, 8329.0], [676.0, 7998.0], [674.0, 8080.0], [698.0, 4917.0], [700.0, 7469.0], [702.0, 8088.0], [680.0, 5185.5], [684.0, 4804.5], [688.0, 4932.5], [690.0, 3816.6666666666665], [692.0, 3881.3333333333335], [694.0, 8132.0], [718.0, 7797.0], [712.0, 7205.0], [714.0, 7194.0], [716.0, 7183.0], [726.0, 8257.0], [724.0, 8181.0], [728.0, 6071.0], [710.0, 7937.0], [708.0, 7735.0], [706.0, 7464.0], [704.0, 7606.0], [730.0, 7436.5], [722.0, 7268.0], [720.0, 7368.0], [734.0, 7232.0], [732.0, 7733.0], [738.0, 3479.333333333333], [744.0, 3289.75], [760.0, 7030.0], [762.0, 7442.0], [764.0, 3029.2], [766.0, 3753.0], [752.0, 7113.0], [742.0, 3747.333333333333], [740.0, 7287.0], [746.0, 3778.333333333333], [736.0, 7593.0], [750.0, 7292.0], [754.0, 4646.0], [756.0, 7343.0], [758.0, 7029.0], [792.0, 4722.5], [774.0, 4697.5], [798.0, 4476.5], [796.0, 6997.0], [794.0, 7495.0], [784.0, 6916.0], [776.0, 3853.666666666667], [778.0, 7000.0], [772.0, 7424.0], [770.0, 7423.0], [768.0, 7879.0], [780.0, 4807.5], [788.0, 7324.0], [786.0, 7185.0], [790.0, 7037.0], [802.0, 4697.5], [800.0, 4498.5], [804.0, 7027.0], [806.0, 7985.0], [824.0, 7141.0], [808.0, 3486.333333333333], [810.0, 7026.0], [812.0, 7597.0], [814.0, 7454.0], [818.0, 3032.5], [820.0, 7503.0], [822.0, 7203.0], [826.0, 7798.0], [828.0, 6787.0], [816.0, 6976.0], [830.0, 6771.0], [834.0, 5788.333333333333], [836.0, 3307.333333333333], [832.0, 7128.0], [838.0, 3188.5], [840.0, 7639.0], [844.0, 2234.0], [842.0, 7004.0], [846.0, 7539.0], [854.0, 4534.5], [852.0, 6996.0], [850.0, 6540.0], [848.0, 7612.0], [862.0, 7423.0], [860.0, 6727.0], [858.0, 4559.5], [856.0, 6962.0], [866.0, 7603.0], [892.0, 6833.0], [864.0, 3786.333333333333], [870.0, 4067.333333333333], [868.0, 7245.0], [888.0, 7143.0], [890.0, 7211.0], [876.0, 6892.0], [874.0, 7102.5], [872.0, 7076.0], [878.0, 7329.0], [880.0, 7082.0], [882.0, 7322.0], [884.0, 7313.0], [886.0, 6632.0], [894.0, 6918.0], [900.0, 6567.0], [920.0, 3580.333333333333], [896.0, 5027.0], [910.0, 7165.0], [898.0, 4755.5], [902.0, 3286.6], [906.0, 3171.0], [904.0, 2580.8571428571427], [922.0, 4197.0], [926.0, 4932.5], [912.0, 7424.0], [924.0, 4260.666666666667], [914.0, 3711.25], [918.0, 3797.0], [916.0, 6829.0], [930.0, 6499.0], [956.0, 6818.0], [928.0, 4462.0], [940.0, 6774.0], [938.0, 7094.0], [936.0, 6680.0], [934.0, 2965.1666666666665], [932.0, 2595.6511627906975], [944.0, 7021.0], [946.0, 6658.0], [948.0, 7490.0], [950.0, 7016.0], [958.0, 6875.0], [954.0, 6456.0], [952.0, 6552.0], [990.0, 6622.0], [978.0, 2846.7500000000005], [976.0, 7206.0], [980.0, 6976.0], [982.0, 6889.0], [988.0, 6872.0], [986.0, 6965.0], [984.0, 7176.0], [966.0, 6863.0], [964.0, 6781.0], [962.0, 6964.0], [960.0, 6524.0], [974.0, 6651.0], [972.0, 6761.0], [970.0, 6382.0], [968.0, 6504.0], [994.0, 4264.5], [992.0, 6356.0], [1016.0, 6404.0], [998.0, 6981.0], [996.0, 6800.0], [1006.0, 4713.5], [1004.0, 6966.0], [1002.0, 6241.0], [1000.0, 7186.0], [1008.0, 6446.0], [1010.0, 7750.0], [1012.0, 7030.0], [1014.0, 6931.0], [1022.0, 6746.0], [1020.0, 6650.0], [1018.0, 6069.0], [1072.0, 4617.5], [1080.0, 6042.0], [1024.0, 2183.0], [1052.0, 6688.0], [1036.0, 6628.0], [1032.0, 6391.0], [1028.0, 6716.0], [1076.0, 5830.0], [1084.0, 2918.75], [1056.0, 6191.0], [1060.0, 6695.0], [1064.0, 6741.0], [1068.0, 6235.0], [1048.0, 6697.0], [1044.0, 4529.0], [1040.0, 6292.0], [1092.0, 4251.5], [1088.0, 4504.5], [1112.0, 6975.0], [1108.0, 3419.5], [1104.0, 3683.666666666667], [1096.0, 3954.5], [1120.0, 3450.0], [1148.0, 6678.5], [1144.0, 3887.666666666667], [1136.0, 5305.0], [1140.0, 6272.0], [1124.0, 3255.625], [1128.0, 6015.0], [1132.0, 3810.333333333333], [1100.0, 3582.5], [1152.0, 3671.666666666667], [1164.0, 4007.5], [1176.0, 4451.0], [1180.0, 6676.0], [1172.0, 5178.5], [1168.0, 4812.5], [1156.0, 3982.0], [1160.0, 4496.5], [1196.0, 3509.0], [1184.0, 4201.0], [1188.0, 6105.0], [1192.0, 6199.0], [1204.0, 6818.0], [1208.0, 6881.0], [1212.0, 6380.0], [1216.0, 3868.666666666667], [1268.0, 6531.0], [1240.0, 6740.0], [1236.0, 6512.5], [1244.0, 4047.666666666667], [1232.0, 4725.5], [1220.0, 6283.5], [1248.0, 4439.0], [1272.0, 4358.666666666667], [1276.0, 5678.0], [1252.0, 6326.0], [1260.0, 3773.333333333333], [1256.0, 6012.0], [1228.0, 6763.0], [1224.0, 5998.0], [1264.0, 6322.0], [1280.0, 5398.666666666667], [1332.0, 4894.0], [1288.0, 4223.0], [1284.0, 5776.0], [1308.0, 8649.0], [1304.0, 6248.0], [1300.0, 3934.0], [1296.0, 5940.0], [1292.0, 4452.0], [1328.0, 5865.0], [1336.0, 3951.333333333333], [1316.0, 6174.0], [1312.0, 5921.0], [1340.0, 7090.0], [1320.0, 6309.0], [1324.0, 5761.0], [1348.0, 6218.0], [1372.0, 4072.0], [1364.0, 3852.0], [1344.0, 6246.0], [1368.0, 6129.0], [1352.0, 5466.0], [1356.0, 6079.0], [1392.0, 5512.0], [1396.0, 4088.4], [1404.0, 4053.0], [1400.0, 5996.0], [1376.0, 4563.666666666667], [1380.0, 4616.5], [1384.0, 4554.5], [1388.0, 4307.0], [1360.0, 4662.0], [1412.0, 5597.0], [1408.0, 4775.5], [1436.0, 5349.0], [1432.0, 5325.0], [1428.0, 4199.0], [1424.0, 4744.5], [1416.0, 4416.0], [1420.0, 6933.0], [1468.0, 5063.0], [1464.0, 5428.0], [1460.0, 5626.0], [1456.0, 5281.0], [1452.0, 4883.0], [1448.0, 5776.0], [1444.0, 5493.0], [1440.0, 5469.0], [1480.0, 5175.0], [1528.0, 3781.5], [1472.0, 4715.0], [1500.0, 3651.0], [1496.0, 4153.0], [1476.0, 5100.0], [1484.0, 3635.3333333333335], [1504.0, 4508.0], [1532.0, 5259.0], [1524.0, 3443.0], [1520.0, 5133.0], [1508.0, 4069.5], [1512.0, 3896.5], [1516.0, 6599.0], [1492.0, 5181.0], [1488.0, 5579.0], [1548.0, 4854.5], [1588.0, 5962.0], [1536.0, 5265.0], [1540.0, 4815.0], [1544.0, 5274.0], [1564.0, 4205.5], [1584.0, 5129.0], [1592.0, 4366.0], [1596.0, 4983.0], [1568.0, 4955.0], [1580.0, 3922.0], [1576.0, 4805.0], [1572.0, 5184.0], [1560.0, 4317.5], [1556.0, 5107.0], [1552.0, 6031.0], [1612.0, 3908.0], [1648.0, 4767.0], [1604.0, 5184.5], [1600.0, 5061.0], [1628.0, 4785.0], [1608.0, 4909.0], [1656.0, 4628.0], [1652.0, 4706.0], [1660.0, 4628.0], [1632.0, 3371.0], [1640.0, 4394.0], [1644.0, 4810.5], [1636.0, 4727.5], [1616.0, 4768.0], [1620.0, 4831.0], [1624.0, 3997.5], [1720.0, 4389.0], [1672.0, 4678.0], [1700.0, 5041.5], [1696.0, 4559.0], [1724.0, 4414.0], [1716.0, 5032.5], [1712.0, 3794.0], [1704.0, 3975.5], [1708.0, 4014.0], [1676.0, 4586.0], [1680.0, 4041.5], [1684.0, 4332.0], [1692.0, 4030.0], [1688.0, 4526.0], [1728.0, 5003.0], [1732.0, 4228.666666666667], [1756.0, 4556.5], [1752.0, 4603.0], [1748.0, 4106.75], [1744.0, 4366.0], [1736.0, 3452.6666666666665], [1740.0, 4793.666666666667], [1776.0, 5386.0], [1784.0, 4878.0], [1788.0, 4088.0], [1760.0, 4218.0], [1780.0, 4150.0], [1772.0, 4522.5], [1768.0, 5292.0], [1764.0, 4234.0], [1840.0, 4436.333333333333], [1792.0, 4969.0], [1804.0, 4662.0], [1800.0, 4042.0], [1796.0, 4727.0], [1848.0, 4873.0], [1852.0, 4089.0], [1844.0, 4270.5], [1828.0, 4025.0], [1832.0, 3976.0], [1836.0, 4000.0], [1824.0, 4028.0], [1808.0, 4298.0], [1812.0, 4034.0], [1816.0, 4211.0], [1820.0, 3487.0], [1860.0, 4059.5], [1856.0, 5339.0], [1864.0, 4289.0], [1868.0, 5825.0], [1872.0, 5467.0], [1876.0, 3288.0], [1880.0, 4132.0], [1884.0, 3613.0], [1085.0, 6444.0], [1041.0, 6524.0], [1045.0, 6617.0], [1081.0, 6048.0], [1057.0, 6702.0], [1077.0, 3319.0], [1065.0, 5798.0], [1061.0, 6766.0], [1069.0, 6461.0], [1073.0, 3326.25], [1025.0, 7162.5], [1029.0, 6844.0], [1033.0, 6570.0], [1037.0, 7033.0], [1053.0, 6696.0], [1049.0, 7531.0], [1093.0, 6010.0], [1097.0, 3338.25], [1117.0, 4991.666666666667], [1109.0, 4741.0], [1113.0, 4191.5], [1105.0, 3171.666666666667], [1089.0, 4122.0], [1101.0, 3819.25], [1149.0, 6377.0], [1145.0, 3620.0], [1137.0, 4302.5], [1141.0, 7105.0], [1121.0, 3836.25], [1125.0, 6599.0], [1129.0, 6099.0], [1133.0, 4670.0], [1157.0, 5281.5], [1161.0, 4277.0], [1181.0, 3736.666666666667], [1177.0, 6679.0], [1173.0, 6195.0], [1169.0, 4798.0], [1153.0, 6131.0], [1165.0, 5946.0], [1185.0, 4313.5], [1189.0, 4655.0], [1193.0, 6348.0], [1197.0, 5966.0], [1213.0, 5861.0], [1209.0, 6294.0], [1201.0, 4522.75], [1205.0, 6822.0], [1221.0, 4712.5], [1265.0, 5892.0], [1245.0, 4326.0], [1233.0, 6470.0], [1237.0, 6190.0], [1241.0, 6526.0], [1217.0, 4555.0], [1229.0, 5991.0], [1225.0, 6059.0], [1269.0, 7511.0], [1273.0, 5046.0], [1277.0, 4409.0], [1249.0, 3795.666666666667], [1257.0, 4369.5], [1261.0, 5692.0], [1281.0, 5915.0], [1293.0, 4038.666666666667], [1289.0, 4231.0], [1297.0, 4678.5], [1285.0, 4852.0], [1309.0, 5753.0], [1305.0, 5915.0], [1301.0, 5602.0], [1341.0, 4543.0], [1337.0, 5786.0], [1333.0, 6298.0], [1329.0, 6293.0], [1313.0, 4646.5], [1317.0, 5576.0], [1321.0, 6051.0], [1325.0, 4378.0], [1353.0, 5538.0], [1349.0, 4798.5], [1345.0, 4544.5], [1373.0, 4218.25], [1365.0, 4167.0], [1369.0, 6952.0], [1357.0, 6047.0], [1393.0, 5318.0], [1397.0, 4143.0], [1405.0, 5965.0], [1401.0, 5385.0], [1377.0, 4319.75], [1381.0, 5452.0], [1385.0, 6071.0], [1389.0, 5496.0], [1361.0, 6102.0], [1413.0, 4181.0], [1461.0, 4404.5], [1425.0, 5529.0], [1429.0, 5771.0], [1433.0, 5114.0], [1409.0, 4659.0], [1437.0, 5439.0], [1417.0, 7004.0], [1421.0, 4839.5], [1457.0, 5689.0], [1441.0, 4093.5], [1445.0, 5254.0], [1469.0, 5606.0], [1465.0, 5205.0], [1449.0, 5449.0], [1453.0, 6808.0], [1485.0, 4372.5], [1473.0, 3850.0], [1477.0, 5133.0], [1481.0, 4995.0], [1497.0, 4142.2], [1501.0, 5030.0], [1529.0, 5068.0], [1533.0, 4897.0], [1525.0, 4626.5], [1521.0, 4868.0], [1505.0, 3769.6666666666665], [1513.0, 3638.6666666666665], [1517.0, 4723.5], [1509.0, 5364.0], [1489.0, 4880.0], [1493.0, 4584.0], [1589.0, 4955.0], [1585.0, 5093.0], [1549.0, 3764.6666666666665], [1545.0, 7484.0], [1537.0, 5397.0], [1541.0, 5330.0], [1593.0, 4518.5], [1597.0, 4599.5], [1569.0, 4350.666666666667], [1577.0, 5818.0], [1573.0, 4717.0], [1581.0, 5043.0], [1557.0, 7461.0], [1553.0, 5232.0], [1561.0, 5236.0], [1565.0, 5003.0], [1609.0, 4219.5], [1605.0, 4098.0], [1601.0, 4984.0], [1629.0, 4679.5], [1613.0, 4918.0], [1649.0, 4553.0], [1657.0, 4635.0], [1653.0, 4721.0], [1661.0, 4572.5], [1633.0, 4741.0], [1637.0, 3880.6666666666665], [1641.0, 3675.5], [1645.0, 4236.0], [1617.0, 4388.0], [1621.0, 4810.0], [1625.0, 3406.25], [1721.0, 3757.3333333333335], [1665.0, 3704.3333333333335], [1669.0, 5012.5], [1673.0, 4247.0], [1697.0, 4556.0], [1725.0, 4367.0], [1717.0, 4004.5], [1713.0, 4302.0], [1701.0, 4248.333333333333], [1705.0, 4450.0], [1709.0, 6696.0], [1677.0, 4633.0], [1681.0, 4416.0], [1685.0, 4562.0], [1693.0, 3506.75], [1689.0, 4628.0], [1729.0, 4081.0], [1757.0, 4267.0], [1749.0, 5536.0], [1753.0, 4039.0], [1745.0, 4626.0], [1737.0, 4427.5], [1733.0, 4408.0], [1741.0, 4738.0], [1777.0, 5011.0], [1785.0, 4048.75], [1789.0, 4786.0], [1761.0, 4269.0], [1781.0, 5151.0], [1773.0, 4385.0], [1769.0, 4181.0], [1765.0, 6442.0], [1801.0, 4055.0], [1805.0, 5113.0], [1793.0, 5329.0], [1821.0, 4128.25], [1797.0, 5193.0], [1841.0, 3537.5], [1845.0, 3390.0], [1853.0, 3981.5], [1849.0, 5152.0], [1829.0, 4950.0], [1833.0, 4086.0], [1837.0, 4366.666666666667], [1825.0, 3990.5], [1809.0, 3885.9999999999995], [1813.0, 4654.0], [1817.0, 4968.0], [1861.0, 4466.0], [1857.0, 5054.0], [1865.0, 4720.333333333333], [1869.0, 5648.5], [1873.0, 3913.0], [1877.0, 3239.0], [1881.0, 3226.0], [1885.0, 4722.0], [515.0, 8692.0], [539.0, 1161.0], [513.0, 3543.0], [517.0, 7475.0], [519.0, 8934.0], [537.0, 8594.0], [521.0, 9244.0], [523.0, 9384.0], [525.0, 4901.5], [527.0, 8437.0], [543.0, 3235.75], [529.0, 9108.0], [531.0, 8108.0], [533.0, 8806.0], [535.0, 8707.0], [541.0, 8544.0], [547.0, 8218.0], [569.0, 4430.0], [545.0, 7812.0], [549.0, 8411.0], [551.0, 8466.0], [557.0, 4507.5], [555.0, 8598.0], [553.0, 8655.0], [559.0, 4925.5], [563.0, 7288.0], [561.0, 8779.0], [565.0, 8577.0], [567.0, 8495.0], [571.0, 8396.0], [573.0, 4949.5], [575.0, 3782.0], [577.0, 5157.5], [601.0, 3895.6666666666665], [581.0, 7917.0], [579.0, 7505.0], [583.0, 8106.0], [589.0, 8417.0], [587.0, 8405.0], [585.0, 8383.0], [591.0, 8759.0], [597.0, 3892.0], [599.0, 5065.0], [603.0, 8271.0], [605.0, 8288.0], [607.0, 9233.0], [593.0, 8246.0], [595.0, 8782.0], [623.0, 5710.333333333333], [635.0, 4499.0], [617.0, 3582.0], [619.0, 9096.0], [621.0, 8158.0], [609.0, 9131.0], [611.0, 7432.0], [613.0, 8903.0], [615.0, 9224.0], [633.0, 8119.0], [625.0, 8207.0], [627.0, 8257.0], [629.0, 8598.0], [631.0, 8045.0], [637.0, 7070.0], [639.0, 4006.0], [643.0, 9082.0], [665.0, 4875.0], [641.0, 8276.0], [655.0, 8147.0], [653.0, 8790.0], [651.0, 8115.0], [649.0, 8284.0], [657.0, 8086.0], [659.0, 8588.0], [661.0, 8428.0], [663.0, 8959.0], [647.0, 8304.0], [645.0, 8616.0], [667.0, 3355.25], [669.0, 1575.0], [671.0, 8636.0], [677.0, 8019.0], [679.0, 8289.0], [687.0, 8055.0], [675.0, 8566.0], [673.0, 8197.0], [697.0, 3761.6666666666665], [699.0, 7468.0], [701.0, 4507.0], [703.0, 8008.0], [681.0, 1741.3333333333333], [685.0, 5174.5], [683.0, 8075.0], [689.0, 9006.0], [691.0, 8230.0], [695.0, 8824.0], [693.0, 8750.0], [729.0, 2034.0], [733.0, 4536.0], [713.0, 4773.0], [715.0, 7607.0], [717.0, 7709.0], [719.0, 4614.5], [723.0, 4466.5], [727.0, 3667.0], [725.0, 7455.0], [711.0, 7446.0], [709.0, 7918.0], [707.0, 7868.0], [705.0, 8327.0], [735.0, 4635.0], [721.0, 8157.0], [731.0, 7951.0], [761.0, 7620.0], [743.0, 3493.5], [763.0, 7090.0], [767.0, 7336.0], [753.0, 7208.0], [765.0, 3992.0], [741.0, 5012.5], [739.0, 7913.0], [745.0, 3026.4], [747.0, 4957.0], [751.0, 7219.0], [737.0, 7679.0], [749.0, 7439.0], [755.0, 4786.5], [757.0, 3438.333333333333], [759.0, 4521.0], [775.0, 4500.0], [797.0, 7179.0], [795.0, 7048.0], [793.0, 7140.0], [799.0, 7514.0], [777.0, 4723.5], [779.0, 3358.25], [781.0, 4754.0], [783.0, 7461.0], [773.0, 7968.0], [771.0, 7463.0], [769.0, 7174.0], [785.0, 4560.0], [789.0, 4510.0], [787.0, 7066.0], [791.0, 3913.0], [803.0, 6955.0], [825.0, 4493.0], [801.0, 7154.0], [805.0, 7275.0], [807.0, 7109.0], [809.0, 6912.0], [811.0, 7699.0], [813.0, 7362.0], [815.0, 7364.0], [817.0, 4607.5], [819.0, 7153.0], [823.0, 7482.0], [827.0, 4588.5], [829.0, 7655.0], [831.0, 6702.0], [837.0, 3803.666666666667], [859.0, 3772.0], [835.0, 6859.0], [841.0, 4904.0], [843.0, 4269.5], [847.0, 4551.5], [845.0, 7046.0], [853.0, 7097.0], [851.0, 7092.0], [849.0, 6841.0], [855.0, 7273.0], [863.0, 7001.0], [861.0, 7188.0], [857.0, 4540.5], [839.0, 7376.0], [867.0, 6987.0], [865.0, 3388.333333333333], [869.0, 7191.0], [871.0, 5478.0], [889.0, 7286.0], [891.0, 7300.0], [877.0, 4603.0], [875.0, 6968.0], [879.0, 4920.5], [895.0, 3803.333333333333], [881.0, 7224.0], [883.0, 6612.0], [885.0, 6448.0], [887.0, 7059.0], [893.0, 6419.0], [899.0, 6826.0], [897.0, 4588.5], [911.0, 6705.0], [909.0, 7637.5], [907.0, 7326.0], [901.0, 6722.0], [905.0, 3355.4], [903.0, 3066.0], [925.0, 3221.5], [927.0, 3785.25], [913.0, 7246.0], [923.0, 4509.5], [921.0, 4191.0], [917.0, 6721.0], [915.0, 6922.0], [919.0, 6918.0], [933.0, 2851.181818181818], [935.0, 4459.0], [929.0, 6509.0], [943.0, 7058.0], [941.0, 7947.0], [939.0, 6937.0], [937.0, 7020.0], [931.0, 2641.3902439024387], [959.0, 6541.0], [945.0, 6837.0], [947.0, 6450.0], [949.0, 6560.0], [951.0, 6897.0], [957.0, 6891.0], [955.0, 6817.0], [953.0, 7072.0], [989.0, 6377.0], [977.0, 7193.0], [979.0, 6646.0], [981.0, 6461.0], [983.0, 6713.0], [991.0, 7827.0], [987.0, 6471.0], [985.0, 6732.0], [967.0, 7179.0], [965.0, 6384.0], [963.0, 6169.0], [961.0, 6631.0], [975.0, 6291.0], [973.0, 6983.0], [971.0, 7002.0], [969.0, 7713.0], [993.0, 6193.0], [1019.0, 6851.0], [1007.0, 6845.0], [999.0, 7310.0], [997.0, 6854.0], [995.0, 7646.0], [1005.0, 4895.0], [1003.0, 6246.0], [1001.0, 6614.0], [1023.0, 6493.0], [1009.0, 6618.0], [1011.0, 6226.0], [1013.0, 6336.0], [1015.0, 6832.0], [1017.0, 6336.0], [1034.0, 6874.0], [1026.0, 4710.5], [1054.0, 6702.0], [1038.0, 6862.0], [1030.0, 6877.0], [1074.0, 4969.5], [1078.0, 3397.0], [1082.0, 6552.0], [1086.0, 6335.0], [1058.0, 7475.0], [1062.0, 6493.0], [1066.0, 6410.0], [1050.0, 5159.5], [1046.0, 4889.0], [1042.0, 6384.0], [1094.0, 4500.0], [1118.0, 4332.5], [1114.0, 3291.5], [1110.0, 6883.0], [1106.0, 3653.333333333333], [1090.0, 3931.0], [1098.0, 5204.5], [1102.0, 3307.5], [1122.0, 7221.0], [1150.0, 4145.666666666667], [1146.0, 3078.8], [1138.0, 7159.0], [1142.0, 5832.0], [1130.0, 4862.0], [1126.0, 6549.0], [1134.0, 4914.5], [1186.0, 5993.0], [1182.0, 4676.0], [1154.0, 6249.0], [1178.0, 6723.0], [1174.0, 3437.0], [1170.0, 6449.0], [1194.0, 3841.333333333333], [1198.0, 5885.0], [1190.0, 6196.0], [1206.0, 4807.5], [1202.0, 6701.0], [1166.0, 6380.0], [1210.0, 6712.0], [1214.0, 6112.0], [1162.0, 3989.666666666667], [1218.0, 4220.333333333333], [1242.0, 4979.5], [1238.0, 6681.0], [1246.0, 2215.0], [1234.0, 3492.0], [1222.0, 3933.666666666667], [1278.0, 5901.0], [1274.0, 5951.0], [1250.0, 3420.8], [1254.0, 5122.0], [1258.0, 6633.0], [1262.0, 5025.5], [1230.0, 3964.333333333333], [1226.0, 6346.0], [1266.0, 5845.0], [1270.0, 6476.0], [1282.0, 6018.0], [1286.0, 5808.0], [1310.0, 5855.0], [1306.0, 6064.0], [1302.0, 6417.0], [1298.0, 4174.0], [1290.0, 4341.5], [1294.0, 5000.5], [1330.0, 6127.0], [1334.0, 5755.0], [1338.0, 3784.6666666666665], [1342.0, 4038.0], [1314.0, 5814.0], [1322.0, 4676.0], [1326.0, 6169.0], [1318.0, 3654.333333333333], [1354.0, 4449.333333333333], [1394.0, 4200.333333333333], [1346.0, 4489.5], [1374.0, 4303.333333333333], [1370.0, 4023.25], [1366.0, 6125.0], [1350.0, 5530.0], [1358.0, 5931.0], [1406.0, 4918.5], [1398.0, 4435.0], [1402.0, 5296.0], [1378.0, 3989.25], [1386.0, 6042.0], [1390.0, 5479.0], [1362.0, 2542.0], [1410.0, 4104.5], [1466.0, 6842.0], [1438.0, 5666.0], [1434.0, 5472.0], [1430.0, 4459.0], [1426.0, 5338.0], [1414.0, 5335.0], [1418.0, 5383.0], [1422.0, 4945.0], [1470.0, 5343.5], [1462.0, 5655.0], [1458.0, 5609.0], [1450.0, 5708.0], [1446.0, 5347.0], [1442.0, 5775.0], [1454.0, 5637.0], [1478.0, 5611.0], [1474.0, 4520.0], [1502.0, 4345.0], [1498.0, 4349.333333333333], [1482.0, 5198.0], [1534.0, 4881.0], [1530.0, 4961.0], [1526.0, 4280.0], [1522.0, 5112.0], [1486.0, 6675.0], [1506.0, 4254.0], [1510.0, 4681.0], [1514.0, 3762.6], [1518.0, 4172.25], [1494.0, 4509.0], [1490.0, 5572.0], [1546.0, 5273.5], [1538.0, 3992.0], [1542.0, 5315.0], [1566.0, 4701.0], [1562.0, 4347.333333333333], [1550.0, 4393.0], [1590.0, 4589.0], [1594.0, 4734.0], [1598.0, 4910.0], [1586.0, 4355.4], [1570.0, 3436.0], [1578.0, 6100.0], [1574.0, 7395.0], [1582.0, 4954.0], [1558.0, 6093.0], [1554.0, 5194.0], [1614.0, 4886.0], [1602.0, 4943.0], [1626.0, 4199.333333333333], [1630.0, 4212.5], [1606.0, 4605.75], [1650.0, 4763.0], [1658.0, 3943.5], [1662.0, 4019.3333333333335], [1634.0, 4452.0], [1638.0, 4766.0], [1646.0, 3386.6666666666665], [1642.0, 4760.0], [1610.0, 4400.666666666667], [1618.0, 4815.0], [1622.0, 4862.0], [1722.0, 4410.0], [1666.0, 4544.0], [1694.0, 3984.0], [1670.0, 4511.0], [1698.0, 4464.0], [1726.0, 3954.6666666666665], [1714.0, 6665.0], [1718.0, 5198.666666666667], [1702.0, 4157.0], [1706.0, 3941.0], [1710.0, 5360.0], [1674.0, 4586.0], [1678.0, 5729.0], [1682.0, 4576.0], [1686.0, 4153.5], [1690.0, 4577.0], [1730.0, 4179.5], [1758.0, 4235.0], [1754.0, 5290.0], [1750.0, 4349.0], [1746.0, 4111.666666666667], [1734.0, 4214.5], [1738.0, 3599.6666666666665], [1778.0, 4195.333333333333], [1782.0, 3989.5], [1790.0, 4127.25], [1762.0, 4230.0], [1786.0, 4799.0], [1774.0, 5304.5], [1770.0, 4562.0], [1766.0, 2106.0], [1742.0, 4662.5], [1802.0, 5539.0], [1806.0, 6337.0], [1822.0, 3885.3333333333335], [1794.0, 4133.0], [1798.0, 4108.0], [1842.0, 4035.0], [1846.0, 6155.0], [1850.0, 4471.5], [1826.0, 4195.0], [1830.0, 5054.0], [1834.0, 3918.0], [1838.0, 4253.333333333333], [1810.0, 3549.2], [1814.0, 4647.0], [1818.0, 4061.0], [1886.0, 3927.5], [1882.0, 4654.0], [1862.0, 3854.3333333333335], [1858.0, 4848.0], [1866.0, 4202.0], [1870.0, 3259.0], [1874.0, 3858.0], [1878.0, 3188.0], [1087.0, 6585.0], [1079.0, 4085.5], [1043.0, 4512.5], [1059.0, 4147.333333333333], [1083.0, 2878.333333333333], [1075.0, 6393.0], [1067.0, 4095.5], [1063.0, 7303.0], [1071.0, 6036.5], [1047.0, 4755.0], [1055.0, 6146.0], [1027.0, 6898.0], [1031.0, 7390.0], [1035.0, 6704.0], [1039.0, 6814.0], [1051.0, 7004.0], [1095.0, 4049.0], [1091.0, 4678.5], [1119.0, 4150.666666666667], [1115.0, 5892.0], [1111.0, 7213.0], [1107.0, 3843.25], [1099.0, 6143.0], [1103.0, 4120.333333333333], [1147.0, 2687.6666666666665], [1151.0, 7071.0], [1139.0, 6460.0], [1143.0, 6266.0], [1123.0, 3949.666666666667], [1127.0, 6269.0], [1131.0, 4141.0], [1135.0, 2659.0], [1183.0, 6911.0], [1179.0, 4420.0], [1175.0, 3944.0], [1171.0, 4241.0], [1155.0, 4385.5], [1159.0, 4249.25], [1163.0, 4458.0], [1167.0, 6523.0], [1187.0, 6207.0], [1191.0, 6365.0], [1195.0, 6467.0], [1199.0, 6863.0], [1215.0, 4138.5], [1211.0, 6781.0], [1207.0, 3734.666666666667], [1203.0, 4600.0], [1223.0, 4292.0], [1219.0, 2561.0], [1247.0, 4980.666666666667], [1243.0, 4824.0], [1235.0, 2517.6666666666665], [1239.0, 6672.0], [1231.0, 4535.5], [1227.0, 5828.0], [1267.0, 5928.0], [1271.0, 5761.0], [1279.0, 2832.0], [1275.0, 4465.0], [1251.0, 3969.333333333333], [1255.0, 5854.0], [1263.0, 4366.333333333333], [1259.0, 4479.5], [1283.0, 5714.0], [1299.0, 4113.0], [1287.0, 4144.333333333333], [1311.0, 5582.0], [1307.0, 6308.0], [1303.0, 6106.0], [1291.0, 4431.666666666667], [1339.0, 5706.0], [1335.0, 6271.0], [1331.0, 6013.0], [1295.0, 5724.0], [1343.0, 5522.0], [1319.0, 4030.0], [1315.0, 5619.0], [1323.0, 7002.0], [1327.0, 4575.5], [1359.0, 3783.2], [1399.0, 4475.5], [1347.0, 5634.0], [1375.0, 3893.0], [1371.0, 4651.0], [1367.0, 5712.0], [1355.0, 6194.0], [1351.0, 5841.0], [1395.0, 4283.0], [1407.0, 4414.666666666667], [1403.0, 5324.0], [1379.0, 4614.333333333333], [1383.0, 5560.5], [1387.0, 5476.0], [1391.0, 5499.0], [1363.0, 4614.75], [1439.0, 5262.0], [1435.0, 5482.5], [1427.0, 4672.5], [1431.0, 6463.0], [1411.0, 5400.0], [1415.0, 4086.6666666666665], [1419.0, 5876.0], [1423.0, 5085.5], [1443.0, 5741.0], [1471.0, 6764.0], [1467.0, 5656.0], [1463.0, 5741.0], [1447.0, 3883.0], [1451.0, 4879.5], [1455.0, 5712.0], [1527.0, 4036.5], [1475.0, 5393.0], [1479.0, 5046.0], [1483.0, 5433.0], [1503.0, 4860.5], [1499.0, 5062.0], [1531.0, 4826.0], [1535.0, 6601.0], [1523.0, 4527.0], [1487.0, 5468.0], [1511.0, 4737.0], [1515.0, 3949.0], [1519.0, 4920.0], [1507.0, 4949.333333333333], [1491.0, 5132.0], [1495.0, 4990.0], [1587.0, 4072.5], [1547.0, 5185.0], [1551.0, 5576.5], [1539.0, 6212.0], [1543.0, 3551.25], [1591.0, 3720.6666666666665], [1595.0, 5037.0], [1599.0, 4115.5], [1571.0, 3546.5], [1579.0, 5116.0], [1575.0, 4733.0], [1583.0, 5029.0], [1559.0, 4818.0], [1555.0, 4714.0], [1563.0, 4712.0], [1567.0, 6339.0], [1651.0, 3937.0], [1615.0, 4535.0], [1607.0, 4440.4], [1603.0, 4623.0], [1627.0, 4695.0], [1631.0, 3849.0], [1655.0, 4498.5], [1659.0, 4675.0], [1663.0, 4614.0], [1635.0, 4676.5], [1639.0, 4609.0], [1647.0, 4462.0], [1643.0, 5663.0], [1611.0, 4329.0], [1619.0, 4069.0], [1623.0, 5831.0], [1719.0, 5389.0], [1671.0, 4393.666666666667], [1679.0, 3832.0], [1667.0, 5226.5], [1695.0, 4509.0], [1699.0, 4397.0], [1723.0, 5330.0], [1715.0, 5236.0], [1703.0, 4378.5], [1707.0, 4447.5], [1711.0, 4693.0], [1675.0, 4638.0], [1683.0, 4649.0], [1687.0, 5389.0], [1735.0, 4256.666666666667], [1759.0, 5233.0], [1755.0, 3495.0], [1751.0, 4299.0], [1747.0, 3971.5], [1731.0, 5577.0], [1739.0, 4249.166666666667], [1743.0, 3518.0], [1783.0, 4142.0], [1787.0, 4127.0], [1791.0, 4303.0], [1779.0, 4905.0], [1763.0, 4334.0], [1771.0, 4640.0], [1775.0, 4816.0], [1767.0, 4254.0], [1799.0, 4718.0], [1815.0, 4318.333333333333], [1823.0, 5266.5], [1795.0, 5202.5], [1803.0, 4043.0], [1807.0, 4991.0], [1843.0, 4031.0], [1847.0, 4012.0], [1851.0, 4746.0], [1855.0, 4712.5], [1827.0, 4611.5], [1831.0, 3984.0], [1835.0, 6177.0], [1839.0, 4926.333333333333], [1811.0, 5308.0], [1819.0, 6214.0], [1863.0, 4512.0], [1859.0, 6151.0], [1867.0, 4455.0], [1871.0, 4194.0], [1875.0, 4160.0], [1879.0, 3602.6666666666665], [1883.0, 4067.0], [1.0, 9136.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1007.6613333333328, 5425.958666666659]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1886.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 2260.6, "minX": 1.5495834E12, "maxY": 17257.966666666667, "series": [{"data": [[1.5495834E12, 17257.966666666667], [1.54958346E12, 3737.2]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495834E12, 10439.4], [1.54958346E12, 2260.6]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 4643.991889699917, "minX": 1.5495834E12, "maxY": 9037.063670411992, "series": [{"data": [[1.5495834E12, 4643.991889699917], [1.54958346E12, 9037.063670411992]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958346E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 4643.982562854826, "minX": 1.5495834E12, "maxY": 9037.063670411992, "series": [{"data": [[1.5495834E12, 4643.982562854826], [1.54958346E12, 9037.063670411992]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958346E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.25842696629213474, "minX": 1.5495834E12, "maxY": 79.01175993511741, "series": [{"data": [[1.5495834E12, 79.01175993511741], [1.54958346E12, 0.25842696629213474]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958346E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 227.0, "minX": 1.5495834E12, "maxY": 10180.0, "series": [{"data": [[1.5495834E12, 9548.0], [1.54958346E12, 10180.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495834E12, 227.0], [1.54958346E12, 7475.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495834E12, 7431.3], [1.54958346E12, 9000.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495834E12, 8841.819999999996], [1.54958346E12, 9846.829999999996]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495834E12, 8157.65], [1.54958346E12, 9394.9]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4661.5, "minX": 8.0, "maxY": 9035.0, "series": [{"data": [[8.0, 9035.0], [41.0, 4661.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 41.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4661.5, "minX": 8.0, "maxY": 9035.0, "series": [{"data": [[8.0, 9035.0], [41.0, 4661.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 41.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5495834E12, "maxY": 50.0, "series": [{"data": [[1.5495834E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 8.9, "minX": 1.5495834E12, "maxY": 41.1, "series": [{"data": [[1.5495834E12, 41.1], [1.54958346E12, 8.9]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958346E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 8.9, "minX": 1.5495834E12, "maxY": 41.1, "series": [{"data": [[1.5495834E12, 41.1], [1.54958346E12, 8.9]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958346E12, "title": "Transactions Per Second"}},
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
