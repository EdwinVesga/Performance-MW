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
        data: {"result": {"minY": 1094.0, "minX": 0.0, "maxY": 24316.0, "series": [{"data": [[0.0, 1094.0], [0.1, 1325.0], [0.2, 1693.0], [0.3, 1806.0], [0.4, 1986.0], [0.5, 2166.0], [0.6, 2235.0], [0.7, 2302.0], [0.8, 2394.0], [0.9, 2452.0], [1.0, 3059.0], [1.1, 3100.0], [1.2, 3125.0], [1.3, 3195.0], [1.4, 3203.0], [1.5, 3220.0], [1.6, 3246.0], [1.7, 3292.0], [1.8, 3328.0], [1.9, 3448.0], [2.0, 3466.0], [2.1, 3490.0], [2.2, 3542.0], [2.3, 3564.0], [2.4, 3575.0], [2.5, 3612.0], [2.6, 3623.0], [2.7, 3651.0], [2.8, 3688.0], [2.9, 3733.0], [3.0, 3764.0], [3.1, 3802.0], [3.2, 3820.0], [3.3, 3839.0], [3.4, 3864.0], [3.5, 3874.0], [3.6, 3913.0], [3.7, 3932.0], [3.8, 3945.0], [3.9, 3953.0], [4.0, 3973.0], [4.1, 4022.0], [4.2, 4043.0], [4.3, 4059.0], [4.4, 4086.0], [4.5, 4104.0], [4.6, 4126.0], [4.7, 4136.0], [4.8, 4148.0], [4.9, 4160.0], [5.0, 4168.0], [5.1, 4186.0], [5.2, 4196.0], [5.3, 4201.0], [5.4, 4206.0], [5.5, 4218.0], [5.6, 4234.0], [5.7, 4244.0], [5.8, 4286.0], [5.9, 4288.0], [6.0, 4290.0], [6.1, 4307.0], [6.2, 4312.0], [6.3, 4327.0], [6.4, 4343.0], [6.5, 4346.0], [6.6, 4359.0], [6.7, 4361.0], [6.8, 4362.0], [6.9, 4368.0], [7.0, 4374.0], [7.1, 4379.0], [7.2, 4385.0], [7.3, 4442.0], [7.4, 4455.0], [7.5, 4483.0], [7.6, 4489.0], [7.7, 4515.0], [7.8, 4526.0], [7.9, 4542.0], [8.0, 4554.0], [8.1, 4573.0], [8.2, 4597.0], [8.3, 4624.0], [8.4, 4635.0], [8.5, 4653.0], [8.6, 4680.0], [8.7, 4701.0], [8.8, 4711.0], [8.9, 4730.0], [9.0, 4768.0], [9.1, 4775.0], [9.2, 4788.0], [9.3, 4803.0], [9.4, 4826.0], [9.5, 4870.0], [9.6, 4880.0], [9.7, 4894.0], [9.8, 4899.0], [9.9, 4906.0], [10.0, 4918.0], [10.1, 4935.0], [10.2, 4957.0], [10.3, 4968.0], [10.4, 4972.0], [10.5, 4978.0], [10.6, 4987.0], [10.7, 5015.0], [10.8, 5055.0], [10.9, 5072.0], [11.0, 5080.0], [11.1, 5104.0], [11.2, 5117.0], [11.3, 5131.0], [11.4, 5148.0], [11.5, 5165.0], [11.6, 5184.0], [11.7, 5214.0], [11.8, 5240.0], [11.9, 5271.0], [12.0, 5280.0], [12.1, 5292.0], [12.2, 5305.0], [12.3, 5316.0], [12.4, 5328.0], [12.5, 5349.0], [12.6, 5378.0], [12.7, 5403.0], [12.8, 5417.0], [12.9, 5446.0], [13.0, 5456.0], [13.1, 5474.0], [13.2, 5482.0], [13.3, 5491.0], [13.4, 5503.0], [13.5, 5513.0], [13.6, 5522.0], [13.7, 5532.0], [13.8, 5555.0], [13.9, 5569.0], [14.0, 5582.0], [14.1, 5595.0], [14.2, 5599.0], [14.3, 5638.0], [14.4, 5658.0], [14.5, 5670.0], [14.6, 5677.0], [14.7, 5702.0], [14.8, 5713.0], [14.9, 5727.0], [15.0, 5740.0], [15.1, 5775.0], [15.2, 5784.0], [15.3, 5810.0], [15.4, 5838.0], [15.5, 5846.0], [15.6, 5872.0], [15.7, 5883.0], [15.8, 5908.0], [15.9, 5929.0], [16.0, 5947.0], [16.1, 5968.0], [16.2, 5973.0], [16.3, 5994.0], [16.4, 6002.0], [16.5, 6012.0], [16.6, 6037.0], [16.7, 6046.0], [16.8, 6068.0], [16.9, 6079.0], [17.0, 6120.0], [17.1, 6148.0], [17.2, 6161.0], [17.3, 6167.0], [17.4, 6192.0], [17.5, 6215.0], [17.6, 6225.0], [17.7, 6245.0], [17.8, 6262.0], [17.9, 6285.0], [18.0, 6320.0], [18.1, 6332.0], [18.2, 6371.0], [18.3, 6378.0], [18.4, 6425.0], [18.5, 6439.0], [18.6, 6452.0], [18.7, 6488.0], [18.8, 6513.0], [18.9, 6533.0], [19.0, 6563.0], [19.1, 6591.0], [19.2, 6603.0], [19.3, 6620.0], [19.4, 6641.0], [19.5, 6658.0], [19.6, 6681.0], [19.7, 6744.0], [19.8, 6747.0], [19.9, 6754.0], [20.0, 6801.0], [20.1, 6857.0], [20.2, 6895.0], [20.3, 6942.0], [20.4, 7003.0], [20.5, 7043.0], [20.6, 7112.0], [20.7, 7202.0], [20.8, 7212.0], [20.9, 7258.0], [21.0, 7281.0], [21.1, 7333.0], [21.2, 7365.0], [21.3, 7380.0], [21.4, 7431.0], [21.5, 7463.0], [21.6, 7493.0], [21.7, 7525.0], [21.8, 7554.0], [21.9, 7581.0], [22.0, 7597.0], [22.1, 7626.0], [22.2, 7643.0], [22.3, 7653.0], [22.4, 7659.0], [22.5, 7668.0], [22.6, 7699.0], [22.7, 7715.0], [22.8, 7721.0], [22.9, 7748.0], [23.0, 7765.0], [23.1, 7799.0], [23.2, 7813.0], [23.3, 7833.0], [23.4, 7854.0], [23.5, 7870.0], [23.6, 7885.0], [23.7, 7905.0], [23.8, 7921.0], [23.9, 7945.0], [24.0, 7959.0], [24.1, 7979.0], [24.2, 7980.0], [24.3, 7997.0], [24.4, 8019.0], [24.5, 8060.0], [24.6, 8080.0], [24.7, 8118.0], [24.8, 8132.0], [24.9, 8145.0], [25.0, 8150.0], [25.1, 8172.0], [25.2, 8187.0], [25.3, 8224.0], [25.4, 8234.0], [25.5, 8247.0], [25.6, 8260.0], [25.7, 8268.0], [25.8, 8279.0], [25.9, 8295.0], [26.0, 8302.0], [26.1, 8313.0], [26.2, 8341.0], [26.3, 8364.0], [26.4, 8374.0], [26.5, 8392.0], [26.6, 8398.0], [26.7, 8413.0], [26.8, 8461.0], [26.9, 8474.0], [27.0, 8488.0], [27.1, 8502.0], [27.2, 8528.0], [27.3, 8541.0], [27.4, 8553.0], [27.5, 8570.0], [27.6, 8592.0], [27.7, 8605.0], [27.8, 8614.0], [27.9, 8623.0], [28.0, 8642.0], [28.1, 8686.0], [28.2, 8690.0], [28.3, 8718.0], [28.4, 8724.0], [28.5, 8749.0], [28.6, 8758.0], [28.7, 8776.0], [28.8, 8794.0], [28.9, 8827.0], [29.0, 8848.0], [29.1, 8858.0], [29.2, 8898.0], [29.3, 8916.0], [29.4, 8925.0], [29.5, 8936.0], [29.6, 8967.0], [29.7, 8993.0], [29.8, 8999.0], [29.9, 9018.0], [30.0, 9041.0], [30.1, 9070.0], [30.2, 9089.0], [30.3, 9110.0], [30.4, 9134.0], [30.5, 9151.0], [30.6, 9165.0], [30.7, 9196.0], [30.8, 9206.0], [30.9, 9235.0], [31.0, 9243.0], [31.1, 9268.0], [31.2, 9274.0], [31.3, 9284.0], [31.4, 9301.0], [31.5, 9316.0], [31.6, 9318.0], [31.7, 9337.0], [31.8, 9355.0], [31.9, 9363.0], [32.0, 9369.0], [32.1, 9417.0], [32.2, 9452.0], [32.3, 9472.0], [32.4, 9491.0], [32.5, 9503.0], [32.6, 9552.0], [32.7, 9575.0], [32.8, 9613.0], [32.9, 9636.0], [33.0, 9691.0], [33.1, 9710.0], [33.2, 9725.0], [33.3, 9749.0], [33.4, 9776.0], [33.5, 9823.0], [33.6, 9841.0], [33.7, 9853.0], [33.8, 9869.0], [33.9, 9892.0], [34.0, 9911.0], [34.1, 9945.0], [34.2, 9957.0], [34.3, 9988.0], [34.4, 10006.0], [34.5, 10022.0], [34.6, 10076.0], [34.7, 10094.0], [34.8, 10122.0], [34.9, 10142.0], [35.0, 10159.0], [35.1, 10178.0], [35.2, 10236.0], [35.3, 10312.0], [35.4, 10316.0], [35.5, 10346.0], [35.6, 10371.0], [35.7, 10397.0], [35.8, 10425.0], [35.9, 10431.0], [36.0, 10444.0], [36.1, 10471.0], [36.2, 10500.0], [36.3, 10536.0], [36.4, 10551.0], [36.5, 10566.0], [36.6, 10590.0], [36.7, 10615.0], [36.8, 10656.0], [36.9, 10689.0], [37.0, 10699.0], [37.1, 10730.0], [37.2, 10755.0], [37.3, 10764.0], [37.4, 10794.0], [37.5, 10844.0], [37.6, 10858.0], [37.7, 10944.0], [37.8, 10964.0], [37.9, 11013.0], [38.0, 11101.0], [38.1, 11128.0], [38.2, 11138.0], [38.3, 11147.0], [38.4, 11156.0], [38.5, 11189.0], [38.6, 11236.0], [38.7, 11279.0], [38.8, 11322.0], [38.9, 11359.0], [39.0, 11378.0], [39.1, 11404.0], [39.2, 11453.0], [39.3, 11522.0], [39.4, 11551.0], [39.5, 11570.0], [39.6, 11582.0], [39.7, 11589.0], [39.8, 11591.0], [39.9, 11605.0], [40.0, 11626.0], [40.1, 11651.0], [40.2, 11678.0], [40.3, 11693.0], [40.4, 11713.0], [40.5, 11733.0], [40.6, 11797.0], [40.7, 11817.0], [40.8, 11831.0], [40.9, 11842.0], [41.0, 11872.0], [41.1, 11889.0], [41.2, 11916.0], [41.3, 11962.0], [41.4, 12004.0], [41.5, 12023.0], [41.6, 12078.0], [41.7, 12092.0], [41.8, 12141.0], [41.9, 12162.0], [42.0, 12200.0], [42.1, 12243.0], [42.2, 12271.0], [42.3, 12304.0], [42.4, 12322.0], [42.5, 12327.0], [42.6, 12372.0], [42.7, 12392.0], [42.8, 12407.0], [42.9, 12412.0], [43.0, 12458.0], [43.1, 12470.0], [43.2, 12501.0], [43.3, 12523.0], [43.4, 12554.0], [43.5, 12648.0], [43.6, 12658.0], [43.7, 12670.0], [43.8, 12699.0], [43.9, 12718.0], [44.0, 12742.0], [44.1, 12762.0], [44.2, 12795.0], [44.3, 12797.0], [44.4, 12829.0], [44.5, 12845.0], [44.6, 12870.0], [44.7, 12883.0], [44.8, 12903.0], [44.9, 12922.0], [45.0, 12935.0], [45.1, 12981.0], [45.2, 12990.0], [45.3, 13012.0], [45.4, 13030.0], [45.5, 13051.0], [45.6, 13067.0], [45.7, 13074.0], [45.8, 13107.0], [45.9, 13117.0], [46.0, 13146.0], [46.1, 13175.0], [46.2, 13194.0], [46.3, 13204.0], [46.4, 13213.0], [46.5, 13230.0], [46.6, 13251.0], [46.7, 13284.0], [46.8, 13317.0], [46.9, 13322.0], [47.0, 13354.0], [47.1, 13375.0], [47.2, 13386.0], [47.3, 13395.0], [47.4, 13424.0], [47.5, 13447.0], [47.6, 13471.0], [47.7, 13495.0], [47.8, 13502.0], [47.9, 13508.0], [48.0, 13522.0], [48.1, 13527.0], [48.2, 13529.0], [48.3, 13551.0], [48.4, 13583.0], [48.5, 13602.0], [48.6, 13631.0], [48.7, 13646.0], [48.8, 13678.0], [48.9, 13686.0], [49.0, 13696.0], [49.1, 13701.0], [49.2, 13721.0], [49.3, 13751.0], [49.4, 13758.0], [49.5, 13766.0], [49.6, 13799.0], [49.7, 13807.0], [49.8, 13822.0], [49.9, 13840.0], [50.0, 13848.0], [50.1, 13868.0], [50.2, 13883.0], [50.3, 13903.0], [50.4, 13909.0], [50.5, 13933.0], [50.6, 13946.0], [50.7, 13962.0], [50.8, 13983.0], [50.9, 14002.0], [51.0, 14037.0], [51.1, 14060.0], [51.2, 14086.0], [51.3, 14093.0], [51.4, 14115.0], [51.5, 14122.0], [51.6, 14146.0], [51.7, 14164.0], [51.8, 14179.0], [51.9, 14192.0], [52.0, 14217.0], [52.1, 14245.0], [52.2, 14258.0], [52.3, 14294.0], [52.4, 14296.0], [52.5, 14307.0], [52.6, 14327.0], [52.7, 14337.0], [52.8, 14360.0], [52.9, 14370.0], [53.0, 14397.0], [53.1, 14416.0], [53.2, 14455.0], [53.3, 14475.0], [53.4, 14493.0], [53.5, 14513.0], [53.6, 14545.0], [53.7, 14561.0], [53.8, 14591.0], [53.9, 14606.0], [54.0, 14623.0], [54.1, 14640.0], [54.2, 14663.0], [54.3, 14671.0], [54.4, 14686.0], [54.5, 14721.0], [54.6, 14762.0], [54.7, 14785.0], [54.8, 14807.0], [54.9, 14834.0], [55.0, 14854.0], [55.1, 14893.0], [55.2, 14897.0], [55.3, 14939.0], [55.4, 14959.0], [55.5, 14989.0], [55.6, 15017.0], [55.7, 15031.0], [55.8, 15047.0], [55.9, 15091.0], [56.0, 15111.0], [56.1, 15124.0], [56.2, 15147.0], [56.3, 15168.0], [56.4, 15184.0], [56.5, 15211.0], [56.6, 15262.0], [56.7, 15280.0], [56.8, 15288.0], [56.9, 15294.0], [57.0, 15323.0], [57.1, 15328.0], [57.2, 15356.0], [57.3, 15366.0], [57.4, 15378.0], [57.5, 15408.0], [57.6, 15428.0], [57.7, 15445.0], [57.8, 15468.0], [57.9, 15484.0], [58.0, 15490.0], [58.1, 15508.0], [58.2, 15524.0], [58.3, 15531.0], [58.4, 15568.0], [58.5, 15590.0], [58.6, 15632.0], [58.7, 15640.0], [58.8, 15662.0], [58.9, 15687.0], [59.0, 15720.0], [59.1, 15732.0], [59.2, 15742.0], [59.3, 15772.0], [59.4, 15837.0], [59.5, 15860.0], [59.6, 15884.0], [59.7, 15969.0], [59.8, 16014.0], [59.9, 16074.0], [60.0, 16086.0], [60.1, 16123.0], [60.2, 16154.0], [60.3, 16263.0], [60.4, 16326.0], [60.5, 16345.0], [60.6, 16376.0], [60.7, 16386.0], [60.8, 16408.0], [60.9, 16421.0], [61.0, 16434.0], [61.1, 16456.0], [61.2, 16485.0], [61.3, 16502.0], [61.4, 16550.0], [61.5, 16576.0], [61.6, 16617.0], [61.7, 16665.0], [61.8, 16699.0], [61.9, 16708.0], [62.0, 16722.0], [62.1, 16741.0], [62.2, 16748.0], [62.3, 16763.0], [62.4, 16771.0], [62.5, 16804.0], [62.6, 16819.0], [62.7, 16836.0], [62.8, 16849.0], [62.9, 16865.0], [63.0, 16887.0], [63.1, 16922.0], [63.2, 16937.0], [63.3, 16968.0], [63.4, 17003.0], [63.5, 17030.0], [63.6, 17045.0], [63.7, 17078.0], [63.8, 17090.0], [63.9, 17117.0], [64.0, 17133.0], [64.1, 17148.0], [64.2, 17161.0], [64.3, 17177.0], [64.4, 17192.0], [64.5, 17210.0], [64.6, 17219.0], [64.7, 17248.0], [64.8, 17275.0], [64.9, 17310.0], [65.0, 17323.0], [65.1, 17349.0], [65.2, 17380.0], [65.3, 17393.0], [65.4, 17455.0], [65.5, 17479.0], [65.6, 17525.0], [65.7, 17547.0], [65.8, 17574.0], [65.9, 17591.0], [66.0, 17603.0], [66.1, 17627.0], [66.2, 17661.0], [66.3, 17706.0], [66.4, 17718.0], [66.5, 17730.0], [66.6, 17766.0], [66.7, 17794.0], [66.8, 17821.0], [66.9, 17829.0], [67.0, 17841.0], [67.1, 17880.0], [67.2, 17903.0], [67.3, 17955.0], [67.4, 17981.0], [67.5, 17997.0], [67.6, 18014.0], [67.7, 18019.0], [67.8, 18036.0], [67.9, 18065.0], [68.0, 18081.0], [68.1, 18110.0], [68.2, 18130.0], [68.3, 18151.0], [68.4, 18167.0], [68.5, 18209.0], [68.6, 18214.0], [68.7, 18270.0], [68.8, 18287.0], [68.9, 18297.0], [69.0, 18322.0], [69.1, 18342.0], [69.2, 18374.0], [69.3, 18384.0], [69.4, 18418.0], [69.5, 18444.0], [69.6, 18458.0], [69.7, 18474.0], [69.8, 18508.0], [69.9, 18536.0], [70.0, 18546.0], [70.1, 18575.0], [70.2, 18585.0], [70.3, 18592.0], [70.4, 18605.0], [70.5, 18607.0], [70.6, 18639.0], [70.7, 18646.0], [70.8, 18682.0], [70.9, 18701.0], [71.0, 18713.0], [71.1, 18741.0], [71.2, 18769.0], [71.3, 18776.0], [71.4, 18790.0], [71.5, 18806.0], [71.6, 18827.0], [71.7, 18843.0], [71.8, 18855.0], [71.9, 18869.0], [72.0, 18872.0], [72.1, 18896.0], [72.2, 18921.0], [72.3, 18947.0], [72.4, 18974.0], [72.5, 18994.0], [72.6, 19009.0], [72.7, 19039.0], [72.8, 19054.0], [72.9, 19064.0], [73.0, 19089.0], [73.1, 19120.0], [73.2, 19137.0], [73.3, 19158.0], [73.4, 19184.0], [73.5, 19201.0], [73.6, 19222.0], [73.7, 19234.0], [73.8, 19248.0], [73.9, 19258.0], [74.0, 19270.0], [74.1, 19302.0], [74.2, 19342.0], [74.3, 19372.0], [74.4, 19377.0], [74.5, 19399.0], [74.6, 19434.0], [74.7, 19444.0], [74.8, 19460.0], [74.9, 19500.0], [75.0, 19514.0], [75.1, 19524.0], [75.2, 19548.0], [75.3, 19569.0], [75.4, 19598.0], [75.5, 19614.0], [75.6, 19636.0], [75.7, 19652.0], [75.8, 19703.0], [75.9, 19715.0], [76.0, 19729.0], [76.1, 19750.0], [76.2, 19784.0], [76.3, 19793.0], [76.4, 19818.0], [76.5, 19834.0], [76.6, 19873.0], [76.7, 19919.0], [76.8, 19931.0], [76.9, 19956.0], [77.0, 19977.0], [77.1, 20012.0], [77.2, 20032.0], [77.3, 20054.0], [77.4, 20091.0], [77.5, 20101.0], [77.6, 20111.0], [77.7, 20145.0], [77.8, 20164.0], [77.9, 20171.0], [78.0, 20182.0], [78.1, 20221.0], [78.2, 20239.0], [78.3, 20261.0], [78.4, 20295.0], [78.5, 20312.0], [78.6, 20347.0], [78.7, 20352.0], [78.8, 20371.0], [78.9, 20390.0], [79.0, 20412.0], [79.1, 20438.0], [79.2, 20452.0], [79.3, 20465.0], [79.4, 20493.0], [79.5, 20535.0], [79.6, 20564.0], [79.7, 20576.0], [79.8, 20630.0], [79.9, 20658.0], [80.0, 20686.0], [80.1, 20738.0], [80.2, 20773.0], [80.3, 20826.0], [80.4, 20917.0], [80.5, 20969.0], [80.6, 21038.0], [80.7, 21096.0], [80.8, 21125.0], [80.9, 21139.0], [81.0, 21156.0], [81.1, 21208.0], [81.2, 21251.0], [81.3, 21283.0], [81.4, 21293.0], [81.5, 21347.0], [81.6, 21361.0], [81.7, 21411.0], [81.8, 21433.0], [81.9, 21462.0], [82.0, 21487.0], [82.1, 21514.0], [82.2, 21533.0], [82.3, 21552.0], [82.4, 21584.0], [82.5, 21615.0], [82.6, 21626.0], [82.7, 21656.0], [82.8, 21686.0], [82.9, 21724.0], [83.0, 21785.0], [83.1, 21808.0], [83.2, 21828.0], [83.3, 21846.0], [83.4, 21869.0], [83.5, 21898.0], [83.6, 21916.0], [83.7, 21930.0], [83.8, 21935.0], [83.9, 21942.0], [84.0, 21961.0], [84.1, 21968.0], [84.2, 21980.0], [84.3, 21993.0], [84.4, 21996.0], [84.5, 22001.0], [84.6, 22012.0], [84.7, 22022.0], [84.8, 22043.0], [84.9, 22051.0], [85.0, 22082.0], [85.1, 22091.0], [85.2, 22115.0], [85.3, 22127.0], [85.4, 22146.0], [85.5, 22155.0], [85.6, 22170.0], [85.7, 22181.0], [85.8, 22219.0], [85.9, 22226.0], [86.0, 22266.0], [86.1, 22282.0], [86.2, 22314.0], [86.3, 22336.0], [86.4, 22349.0], [86.5, 22355.0], [86.6, 22359.0], [86.7, 22376.0], [86.8, 22386.0], [86.9, 22393.0], [87.0, 22399.0], [87.1, 22412.0], [87.2, 22421.0], [87.3, 22437.0], [87.4, 22446.0], [87.5, 22466.0], [87.6, 22475.0], [87.7, 22487.0], [87.8, 22500.0], [87.9, 22507.0], [88.0, 22511.0], [88.1, 22524.0], [88.2, 22552.0], [88.3, 22556.0], [88.4, 22564.0], [88.5, 22571.0], [88.6, 22582.0], [88.7, 22591.0], [88.8, 22597.0], [88.9, 22600.0], [89.0, 22611.0], [89.1, 22620.0], [89.2, 22632.0], [89.3, 22636.0], [89.4, 22644.0], [89.5, 22662.0], [89.6, 22666.0], [89.7, 22683.0], [89.8, 22706.0], [89.9, 22716.0], [90.0, 22717.0], [90.1, 22730.0], [90.2, 22738.0], [90.3, 22743.0], [90.4, 22747.0], [90.5, 22759.0], [90.6, 22766.0], [90.7, 22775.0], [90.8, 22792.0], [90.9, 22798.0], [91.0, 22800.0], [91.1, 22803.0], [91.2, 22823.0], [91.3, 22830.0], [91.4, 22835.0], [91.5, 22842.0], [91.6, 22851.0], [91.7, 22857.0], [91.8, 22867.0], [91.9, 22879.0], [92.0, 22883.0], [92.1, 22887.0], [92.2, 22898.0], [92.3, 22902.0], [92.4, 22913.0], [92.5, 22921.0], [92.6, 22925.0], [92.7, 22927.0], [92.8, 22932.0], [92.9, 22944.0], [93.0, 22948.0], [93.1, 22951.0], [93.2, 22956.0], [93.3, 22962.0], [93.4, 22964.0], [93.5, 22964.0], [93.6, 22971.0], [93.7, 22980.0], [93.8, 22985.0], [93.9, 22990.0], [94.0, 22991.0], [94.1, 22993.0], [94.2, 22996.0], [94.3, 22998.0], [94.4, 23006.0], [94.5, 23019.0], [94.6, 23024.0], [94.7, 23030.0], [94.8, 23046.0], [94.9, 23057.0], [95.0, 23078.0], [95.1, 23083.0], [95.2, 23085.0], [95.3, 23088.0], [95.4, 23097.0], [95.5, 23101.0], [95.6, 23112.0], [95.7, 23119.0], [95.8, 23124.0], [95.9, 23130.0], [96.0, 23135.0], [96.1, 23140.0], [96.2, 23147.0], [96.3, 23154.0], [96.4, 23163.0], [96.5, 23167.0], [96.6, 23171.0], [96.7, 23176.0], [96.8, 23190.0], [96.9, 23194.0], [97.0, 23200.0], [97.1, 23222.0], [97.2, 23226.0], [97.3, 23236.0], [97.4, 23245.0], [97.5, 23248.0], [97.6, 23256.0], [97.7, 23267.0], [97.8, 23275.0], [97.9, 23277.0], [98.0, 23286.0], [98.1, 23290.0], [98.2, 23306.0], [98.3, 23329.0], [98.4, 23335.0], [98.5, 23346.0], [98.6, 23357.0], [98.7, 23372.0], [98.8, 23395.0], [98.9, 23405.0], [99.0, 23417.0], [99.1, 23432.0], [99.2, 23464.0], [99.3, 23511.0], [99.4, 23552.0], [99.5, 23622.0], [99.6, 23662.0], [99.7, 23713.0], [99.8, 23805.0], [99.9, 23975.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 1000.0, "maxY": 61.0, "series": [{"data": [[1000.0, 1.0], [1200.0, 1.0], [1300.0, 2.0], [1400.0, 1.0], [1600.0, 2.0], [1700.0, 2.0], [1800.0, 1.0], [1900.0, 3.0], [2000.0, 2.0], [2100.0, 2.0], [2200.0, 4.0], [2300.0, 4.0], [2400.0, 3.0], [3000.0, 5.0], [3100.0, 7.0], [3200.0, 12.0], [3300.0, 3.0], [3400.0, 8.0], [3500.0, 11.0], [3600.0, 10.0], [3700.0, 9.0], [3800.0, 15.0], [3900.0, 13.0], [4000.0, 14.0], [4200.0, 24.0], [4100.0, 23.0], [4300.0, 35.0], [4400.0, 12.0], [4500.0, 18.0], [4600.0, 13.0], [4700.0, 18.0], [4800.0, 17.0], [4900.0, 26.0], [5000.0, 12.0], [5100.0, 16.0], [5200.0, 16.0], [5300.0, 15.0], [5400.0, 22.0], [5500.0, 25.0], [5600.0, 14.0], [5700.0, 17.0], [5800.0, 16.0], [6000.0, 17.0], [5900.0, 18.0], [6100.0, 14.0], [6200.0, 15.0], [6300.0, 12.0], [6500.0, 13.0], [6600.0, 14.0], [6400.0, 11.0], [6700.0, 11.0], [6900.0, 5.0], [6800.0, 7.0], [7000.0, 6.0], [7100.0, 3.0], [7200.0, 11.0], [7400.0, 9.0], [7300.0, 8.0], [7600.0, 18.0], [7500.0, 12.0], [7700.0, 15.0], [7800.0, 17.0], [7900.0, 20.0], [8000.0, 8.0], [8100.0, 18.0], [8200.0, 23.0], [8300.0, 19.0], [8400.0, 14.0], [8600.0, 18.0], [8500.0, 17.0], [8700.0, 17.0], [8800.0, 12.0], [8900.0, 18.0], [9100.0, 14.0], [9000.0, 13.0], [9200.0, 20.0], [9300.0, 20.0], [9700.0, 13.0], [9500.0, 10.0], [9400.0, 12.0], [9600.0, 8.0], [9800.0, 13.0], [9900.0, 14.0], [10100.0, 12.0], [10000.0, 11.0], [10200.0, 3.0], [10400.0, 14.0], [10300.0, 14.0], [10600.0, 11.0], [10500.0, 14.0], [10700.0, 12.0], [10900.0, 7.0], [11100.0, 16.0], [10800.0, 7.0], [11200.0, 7.0], [11000.0, 3.0], [11300.0, 10.0], [11400.0, 5.0], [11500.0, 19.0], [11600.0, 14.0], [11700.0, 8.0], [11800.0, 17.0], [11900.0, 5.0], [12000.0, 11.0], [12100.0, 8.0], [12200.0, 9.0], [12300.0, 14.0], [12400.0, 13.0], [12700.0, 15.0], [12600.0, 11.0], [12500.0, 8.0], [13200.0, 15.0], [13300.0, 18.0], [13000.0, 15.0], [13100.0, 15.0], [12900.0, 15.0], [12800.0, 14.0], [13400.0, 13.0], [13500.0, 21.0], [13600.0, 18.0], [13800.0, 19.0], [13700.0, 16.0], [14000.0, 15.0], [14100.0, 18.0], [14300.0, 18.0], [13900.0, 17.0], [14200.0, 15.0], [14800.0, 14.0], [14500.0, 12.0], [14400.0, 14.0], [14600.0, 17.0], [14700.0, 9.0], [14900.0, 9.0], [15200.0, 15.0], [15000.0, 13.0], [15100.0, 14.0], [15300.0, 17.0], [15500.0, 13.0], [15400.0, 18.0], [15700.0, 13.0], [15600.0, 12.0], [15800.0, 8.0], [16100.0, 5.0], [16300.0, 11.0], [16000.0, 8.0], [15900.0, 5.0], [16200.0, 4.0], [16400.0, 16.0], [16800.0, 16.0], [17400.0, 7.0], [17000.0, 14.0], [17200.0, 12.0], [16600.0, 7.0], [17600.0, 9.0], [18200.0, 13.0], [17800.0, 14.0], [18000.0, 16.0], [18400.0, 14.0], [18800.0, 20.0], [19000.0, 16.0], [19200.0, 18.0], [18600.0, 16.0], [19400.0, 11.0], [19600.0, 11.0], [19800.0, 8.0], [20200.0, 10.0], [20400.0, 15.0], [20000.0, 12.0], [20600.0, 10.0], [20800.0, 5.0], [21000.0, 4.0], [21200.0, 11.0], [21400.0, 12.0], [22000.0, 20.0], [21600.0, 12.0], [22200.0, 13.0], [21800.0, 13.0], [22400.0, 23.0], [22600.0, 27.0], [23000.0, 35.0], [22800.0, 39.0], [23200.0, 37.0], [23400.0, 13.0], [23800.0, 4.0], [24000.0, 1.0], [23600.0, 7.0], [17300.0, 14.0], [16700.0, 20.0], [16500.0, 10.0], [16900.0, 11.0], [17100.0, 18.0], [18300.0, 12.0], [17500.0, 13.0], [17700.0, 13.0], [17900.0, 11.0], [18100.0, 12.0], [18500.0, 17.0], [18700.0, 17.0], [18900.0, 13.0], [19100.0, 12.0], [19300.0, 13.0], [20300.0, 15.0], [19500.0, 16.0], [20100.0, 19.0], [19700.0, 18.0], [19900.0, 12.0], [20900.0, 6.0], [20500.0, 9.0], [21100.0, 11.0], [20700.0, 5.0], [21300.0, 7.0], [21500.0, 12.0], [21900.0, 29.0], [22300.0, 26.0], [21700.0, 6.0], [22100.0, 17.0], [22500.0, 33.0], [22700.0, 36.0], [23100.0, 44.0], [23300.0, 20.0], [22900.0, 61.0], [23500.0, 5.0], [23700.0, 2.0], [23900.0, 1.0], [24300.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 24300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 5.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2995.0, "series": [{"data": [[1.0, 5.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2995.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 288.5486111111112, "minX": 1.54960842E12, "maxY": 1525.4550330032962, "series": [{"data": [[1.54960842E12, 1525.4550330032962], [1.54960848E12, 288.5486111111112]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960848E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 3825.0, "minX": 1.0, "maxY": 24316.0, "series": [{"data": [[2.0, 23464.0], [3.0, 23024.0], [5.0, 23310.0], [6.0, 23276.0], [7.0, 22964.0], [9.0, 23287.5], [10.0, 23417.0], [11.0, 22991.0], [12.0, 23233.0], [14.0, 23245.0], [15.0, 23140.0], [16.0, 23174.0], [18.0, 23098.5], [19.0, 23357.0], [20.0, 23432.0], [21.0, 23005.0], [23.0, 23247.5], [24.0, 23290.0], [25.0, 23004.0], [26.0, 22991.0], [28.0, 23184.5], [29.0, 23290.0], [30.0, 23278.0], [31.0, 23083.0], [33.0, 23030.0], [32.0, 23576.0], [35.0, 23084.0], [34.0, 23097.0], [37.0, 23017.0], [36.0, 23394.0], [39.0, 23083.0], [38.0, 23543.0], [41.0, 23140.0], [40.0, 23096.0], [43.0, 23038.0], [45.0, 22946.0], [44.0, 22994.0], [47.0, 23151.0], [46.0, 22953.0], [49.0, 22867.0], [48.0, 22993.0], [51.0, 23163.0], [50.0, 23395.0], [53.0, 23229.5], [55.0, 23146.0], [54.0, 23386.0], [56.0, 23088.0], [59.0, 23171.5], [58.0, 22964.0], [60.0, 23088.0], [63.0, 22980.0], [62.0, 23658.0], [67.0, 22972.0], [66.0, 22957.0], [65.0, 23109.0], [64.0, 23362.0], [70.0, 22926.0], [69.0, 23698.0], [68.0, 23251.0], [75.0, 23351.0], [74.0, 23252.0], [73.0, 23082.5], [72.0, 23674.0], [79.0, 23046.0], [78.0, 23166.0], [77.0, 22990.0], [76.0, 22798.0], [83.0, 23190.0], [82.0, 22949.0], [81.0, 23293.0], [80.0, 23256.0], [87.0, 23241.0], [86.0, 22998.0], [85.0, 23136.0], [84.0, 23264.0], [91.0, 22990.0], [90.0, 23294.0], [89.0, 23275.0], [88.0, 22824.0], [95.0, 23115.5], [93.0, 23397.0], [92.0, 23409.0], [99.0, 22746.0], [98.0, 22754.0], [97.0, 23519.0], [96.0, 23273.0], [103.0, 23053.0], [102.0, 22928.0], [101.0, 23024.0], [100.0, 22766.0], [107.0, 22964.0], [106.0, 22837.0], [105.0, 23269.0], [111.0, 22720.0], [110.0, 22743.0], [109.0, 22802.0], [108.0, 22744.0], [114.0, 23107.5], [112.0, 23404.0], [119.0, 23171.0], [118.0, 22738.0], [117.0, 23101.0], [116.0, 22840.0], [123.0, 22840.0], [122.0, 22759.0], [121.0, 23312.0], [120.0, 22716.0], [127.0, 23183.0], [126.0, 23197.0], [125.0, 22736.0], [124.0, 23200.0], [135.0, 23167.0], [134.0, 23713.0], [133.0, 22992.0], [132.0, 22921.0], [131.0, 22846.0], [130.0, 22916.0], [129.0, 23081.0], [128.0, 23447.0], [143.0, 22881.0], [142.0, 23159.0], [141.0, 23335.0], [140.0, 22793.0], [139.0, 23286.0], [138.0, 22640.0], [137.0, 23164.0], [136.0, 23153.0], [151.0, 22717.0], [150.0, 23086.0], [149.0, 23332.0], [148.0, 23092.0], [147.0, 22666.0], [146.0, 22606.0], [145.0, 23147.0], [144.0, 22678.0], [159.0, 23104.0], [157.0, 22981.0], [156.0, 23030.0], [155.0, 22936.0], [154.0, 23075.0], [153.0, 23110.0], [152.0, 23128.0], [167.0, 22842.0], [166.0, 22569.0], [165.0, 22760.0], [164.0, 23278.0], [163.0, 23224.0], [162.0, 23430.0], [161.0, 23662.0], [160.0, 23329.0], [175.0, 22945.0], [174.0, 23356.0], [173.0, 22792.0], [172.0, 23222.0], [171.0, 22759.0], [170.0, 22868.0], [169.0, 22843.0], [168.0, 23019.0], [183.0, 22587.0], [182.0, 22851.0], [181.0, 22628.0], [180.0, 22951.0], [179.0, 22867.0], [178.0, 23053.5], [176.0, 23029.0], [191.0, 23145.0], [190.0, 23859.0], [189.0, 23215.0], [188.0, 23238.0], [187.0, 22996.0], [186.0, 23208.0], [185.0, 22754.0], [184.0, 22997.0], [199.0, 22833.0], [198.0, 22962.0], [197.0, 22493.0], [196.0, 22591.0], [195.0, 22963.0], [194.0, 23637.0], [193.0, 23078.0], [192.0, 23248.0], [207.0, 22393.0], [206.0, 22655.0], [205.0, 22529.0], [204.0, 23053.0], [203.0, 22922.0], [202.0, 22776.0], [201.0, 23610.0], [200.0, 22597.0], [215.0, 23490.0], [214.0, 22890.0], [213.0, 23223.0], [212.0, 22770.0], [211.0, 22740.0], [210.0, 22800.0], [209.0, 23155.0], [223.0, 22345.0], [222.0, 23805.0], [221.0, 22582.0], [220.0, 23132.0], [219.0, 22727.0], [218.0, 23207.333333333332], [231.0, 22695.0], [230.0, 22333.0], [229.0, 22359.0], [228.0, 22662.0], [227.0, 23275.0], [226.0, 22328.0], [225.0, 23245.0], [224.0, 22564.0], [239.0, 22571.0], [238.0, 22803.0], [237.0, 23131.0], [236.0, 23011.0], [235.0, 22620.0], [234.0, 22986.0], [233.0, 22511.0], [232.0, 22492.0], [247.0, 22311.0], [246.0, 22733.0], [245.0, 23027.0], [244.0, 22988.0], [243.0, 23057.0], [242.0, 22412.0], [241.0, 23176.0], [240.0, 23405.0], [255.0, 22925.0], [254.0, 23099.0], [253.0, 23019.0], [252.0, 22632.0], [251.0, 23343.0], [250.0, 23364.0], [249.0, 22913.0], [248.0, 23236.0], [270.0, 22429.0], [271.0, 23178.0], [269.0, 22944.0], [268.0, 22795.0], [267.0, 23112.0], [266.0, 22902.0], [265.0, 23154.0], [264.0, 22805.0], [263.0, 22663.0], [257.0, 24316.0], [256.0, 22870.0], [259.0, 22554.0], [258.0, 23194.0], [262.0, 22415.0], [261.0, 23259.0], [260.0, 22881.0], [286.0, 22001.0], [287.0, 22798.0], [285.0, 22164.0], [284.0, 22969.0], [283.0, 22948.0], [282.0, 22861.0], [281.0, 22432.0], [280.0, 23085.0], [279.0, 23277.0], [273.0, 23306.0], [272.0, 22598.0], [275.0, 22854.0], [274.0, 22884.0], [278.0, 22690.0], [277.0, 22920.0], [276.0, 22568.0], [301.0, 22855.0], [302.0, 22091.0], [300.0, 22899.0], [291.0, 22487.0], [290.0, 22485.0], [289.0, 22937.0], [288.0, 22996.0], [299.0, 22879.0], [298.0, 22618.0], [297.0, 23470.0], [296.0, 22456.0], [295.0, 22471.0], [294.0, 22891.0], [293.0, 22683.0], [292.0, 22414.0], [318.0, 22552.0], [319.0, 24021.0], [317.0, 22950.0], [316.0, 22636.0], [315.0, 23135.0], [314.0, 23006.0], [313.0, 22811.0], [312.0, 22830.0], [311.0, 22798.0], [305.0, 22354.0], [304.0, 22763.5], [307.0, 22048.0], [306.0, 22980.0], [310.0, 22747.0], [309.0, 21923.0], [308.0, 21958.0], [334.0, 22927.0], [335.0, 22171.0], [333.0, 23975.0], [332.0, 22358.0], [331.0, 23119.0], [330.0, 22559.0], [329.0, 23083.0], [328.0, 21975.0], [327.0, 22638.0], [321.0, 22219.0], [320.0, 22835.0], [323.0, 22678.0], [322.0, 22990.0], [326.0, 22285.0], [325.0, 23193.0], [324.0, 22972.0], [350.0, 21912.0], [351.0, 22503.0], [349.0, 22715.0], [348.0, 22907.0], [347.0, 22956.0], [346.0, 22500.0], [345.0, 22173.0], [344.0, 22446.0], [343.0, 22386.0], [337.0, 22466.0], [336.0, 22706.0], [339.0, 22556.0], [338.0, 22962.0], [342.0, 22479.0], [341.0, 22883.0], [340.0, 22717.0], [366.0, 22582.0], [367.0, 22561.0], [365.0, 22441.0], [364.0, 22767.0], [363.0, 22824.0], [362.0, 22665.0], [361.0, 22580.0], [360.0, 22707.0], [359.0, 22508.0], [352.0, 22633.0], [355.0, 22594.0], [354.0, 23538.0], [358.0, 22018.0], [357.0, 22831.0], [356.0, 22376.0], [382.0, 22146.0], [375.0, 11784.5], [369.0, 22595.0], [368.0, 22887.0], [371.0, 22741.0], [370.0, 21965.0], [374.0, 22924.0], [373.0, 22025.0], [372.0, 22516.0], [383.0, 21993.0], [381.0, 22730.0], [380.0, 22927.0], [379.0, 22390.0], [378.0, 22469.0], [377.0, 22336.0], [376.0, 23783.0], [398.0, 22387.0], [397.0, 11956.0], [399.0, 22276.0], [396.0, 22613.0], [395.0, 23267.0], [394.0, 22350.0], [393.0, 22384.0], [392.0, 22170.0], [391.0, 21923.0], [385.0, 22502.0], [384.0, 21987.0], [387.0, 22375.0], [386.0, 22208.0], [390.0, 22338.0], [389.0, 22132.0], [388.0, 22395.0], [414.0, 23339.0], [400.0, 12052.5], [405.0, 12050.0], [404.0, 22153.0], [407.0, 22717.0], [406.0, 22399.0], [415.0, 22507.0], [413.0, 22279.0], [412.0, 22632.0], [403.0, 22162.0], [402.0, 23118.0], [401.0, 22252.0], [411.0, 22115.0], [410.0, 22149.0], [409.0, 22964.0], [408.0, 22439.0], [430.0, 22599.0], [431.0, 23346.0], [429.0, 22402.0], [428.0, 22610.0], [427.0, 21886.0], [426.0, 21628.0], [425.0, 22511.0], [424.0, 22022.0], [423.0, 22155.0], [416.0, 22181.0], [419.0, 22368.0], [417.0, 22314.0], [422.0, 22349.0], [421.0, 22282.0], [420.0, 23157.0], [446.0, 22510.0], [447.0, 22127.0], [445.0, 21968.0], [444.0, 22241.0], [443.0, 21656.0], [442.0, 22116.0], [441.0, 22437.0], [440.0, 22084.0], [439.0, 21894.0], [433.0, 23130.0], [432.0, 22355.0], [435.0, 23097.0], [434.0, 21997.0], [438.0, 23120.0], [437.0, 22202.0], [436.0, 21898.0], [462.0, 21582.0], [463.0, 22645.0], [461.0, 22122.0], [460.0, 22046.0], [459.0, 22111.0], [458.0, 21535.0], [457.0, 21979.0], [456.0, 21980.0], [455.0, 22398.0], [449.0, 22043.0], [448.0, 22003.0], [451.0, 21930.0], [450.0, 22784.0], [454.0, 21935.0], [453.0, 21491.0], [452.0, 22012.0], [478.0, 21865.0], [479.0, 21808.0], [477.0, 21988.0], [476.0, 22005.0], [475.0, 21941.0], [474.0, 21846.0], [473.0, 21411.0], [472.0, 21813.0], [471.0, 21493.0], [465.0, 22611.0], [464.0, 21785.0], [467.0, 21994.0], [466.0, 21697.0], [470.0, 21942.0], [469.0, 22554.0], [468.0, 21862.0], [494.0, 21552.0], [495.0, 21627.0], [493.0, 21565.0], [492.0, 22524.0], [491.0, 21469.0], [490.0, 21547.0], [489.0, 21954.0], [488.0, 21688.0], [487.0, 21933.0], [481.0, 22462.0], [480.0, 22581.0], [483.0, 21616.0], [482.0, 21724.0], [486.0, 22022.0], [485.0, 21361.0], [484.0, 22402.0], [509.0, 21828.0], [511.0, 22168.5], [508.0, 21823.0], [499.0, 21686.0], [498.0, 21755.0], [497.0, 22082.0], [496.0, 21584.0], [507.0, 21487.0], [506.0, 21462.0], [505.0, 21599.0], [504.0, 22600.0], [503.0, 21422.0], [502.0, 21934.0], [501.0, 22090.0], [500.0, 21437.0], [542.0, 21521.0], [516.0, 11886.5], [526.0, 21841.0], [514.0, 21665.0], [512.0, 21514.0], [524.0, 21734.0], [522.0, 22140.0], [520.0, 21252.0], [534.0, 11979.5], [540.0, 22225.0], [538.0, 22091.0], [536.0, 21461.0], [518.0, 22421.0], [532.0, 22369.0], [530.0, 21793.0], [528.0, 21996.0], [570.0, 21096.0], [574.0, 21353.0], [568.0, 21624.0], [550.0, 21915.0], [548.0, 21392.0], [546.0, 21480.0], [544.0, 21208.0], [566.0, 21346.0], [564.0, 21129.0], [562.0, 21416.0], [560.0, 21253.0], [558.0, 21229.0], [556.0, 21190.0], [554.0, 21961.0], [552.0, 21869.0], [604.0, 20870.0], [578.0, 11243.5], [576.0, 22051.0], [582.0, 21285.0], [580.0, 21115.0], [590.0, 20749.0], [588.0, 20687.0], [586.0, 20442.0], [584.0, 20347.0], [606.0, 20493.0], [602.0, 20754.0], [600.0, 20171.0], [598.0, 20178.0], [596.0, 20350.0], [594.0, 20846.0], [592.0, 20671.0], [636.0, 20386.0], [638.0, 20602.0], [634.0, 20235.0], [632.0, 20183.0], [630.0, 20010.0], [628.0, 20452.0], [626.0, 20328.0], [624.0, 19824.0], [622.0, 19923.0], [610.0, 20818.0], [608.0, 20300.0], [614.0, 20563.0], [612.0, 20390.0], [620.0, 20032.0], [618.0, 20182.0], [616.0, 20331.0], [670.0, 19750.0], [660.0, 11151.0], [668.0, 20525.0], [666.0, 20603.0], [664.0, 20027.5], [646.0, 19977.0], [644.0, 20107.0], [642.0, 20030.0], [640.0, 20535.0], [662.0, 20251.0], [658.0, 20347.0], [656.0, 19966.0], [654.0, 20636.0], [652.0, 20438.0], [650.0, 20573.0], [648.0, 20414.0], [700.0, 20239.0], [676.0, 10893.0], [674.0, 20197.0], [672.0, 20405.0], [678.0, 19890.0], [686.0, 20294.0], [684.0, 19712.0], [682.0, 19703.0], [680.0, 19749.0], [702.0, 19402.0], [698.0, 20111.0], [696.0, 19787.0], [694.0, 19376.0], [692.0, 20100.0], [690.0, 19784.0], [688.0, 20295.0], [732.0, 10959.0], [730.0, 10991.0], [734.0, 19873.0], [728.0, 19636.0], [726.0, 19556.0], [724.0, 20054.0], [722.0, 19508.0], [720.0, 19094.0], [718.0, 19434.0], [706.0, 19288.0], [704.0, 19818.0], [710.0, 19268.0], [708.0, 19723.0], [716.0, 19997.0], [714.0, 20412.0], [712.0, 19436.0], [764.0, 19365.0], [766.0, 18945.0], [762.0, 18974.0], [760.0, 18720.0], [758.0, 19063.0], [756.0, 19204.0], [754.0, 19509.0], [752.0, 19477.0], [750.0, 19244.0], [738.0, 20162.0], [736.0, 19793.0], [742.0, 19343.5], [740.0, 19444.0], [748.0, 18987.0], [746.0, 19231.0], [744.0, 19213.0], [796.0, 18670.0], [798.0, 18701.0], [794.0, 19179.0], [792.0, 19064.0], [790.0, 18947.0], [788.0, 19039.0], [786.0, 19090.0], [784.0, 18819.0], [782.0, 19245.0], [770.0, 19558.0], [768.0, 19137.0], [774.0, 19519.0], [772.0, 19123.0], [780.0, 19375.0], [778.0, 19080.0], [776.0, 19081.0], [828.0, 18994.0], [830.0, 19032.0], [826.0, 19614.0], [824.0, 18374.0], [822.0, 18773.0], [820.0, 18681.0], [818.0, 18511.0], [816.0, 18497.0], [814.0, 19158.0], [802.0, 19521.0], [800.0, 18536.0], [806.0, 18705.0], [804.0, 19616.0], [812.0, 18815.0], [810.0, 18377.0], [808.0, 18682.0], [860.0, 17825.0], [848.0, 18582.0], [850.0, 18213.0], [852.0, 18852.0], [862.0, 19001.0], [858.0, 18713.0], [856.0, 18843.0], [846.0, 19047.0], [834.0, 19089.0], [832.0, 18606.0], [838.0, 18474.0], [836.0, 20156.0], [844.0, 19302.0], [842.0, 18871.0], [840.0, 18546.0], [854.0, 18065.0], [892.0, 17591.0], [880.0, 19155.0], [882.0, 19011.0], [884.0, 19120.0], [894.0, 19651.0], [890.0, 18411.0], [888.0, 17574.0], [864.0, 18827.0], [866.0, 18748.0], [868.0, 18061.0], [870.0, 18638.0], [878.0, 18883.0], [876.0, 18776.0], [874.0, 18872.0], [872.0, 18697.0], [886.0, 18585.0], [924.0, 18084.0], [912.0, 18536.0], [914.0, 18296.0], [916.0, 18270.0], [926.0, 18924.0], [922.0, 18035.0], [920.0, 19222.0], [896.0, 19427.0], [898.0, 18617.0], [900.0, 18966.0], [902.0, 19618.5], [910.0, 17804.0], [908.0, 17903.0], [906.0, 18748.0], [904.0, 19009.0], [918.0, 17981.0], [954.0, 18884.5], [958.0, 17985.0], [944.0, 17955.0], [946.0, 17883.0], [948.0, 18036.0], [956.0, 19035.0], [952.0, 19248.0], [934.0, 19256.0], [932.0, 18458.0], [930.0, 18130.0], [928.0, 17831.0], [940.0, 17728.0], [938.0, 18587.0], [936.0, 18072.0], [950.0, 17841.0], [988.0, 17997.0], [976.0, 17525.0], [978.0, 17547.0], [980.0, 18214.0], [990.0, 17794.0], [986.0, 18309.0], [984.0, 18805.0], [960.0, 18342.0], [962.0, 17682.0], [964.0, 17916.0], [966.0, 18209.0], [974.0, 18014.0], [972.0, 17902.5], [970.0, 17804.0], [968.0, 18015.0], [982.0, 18879.0], [1006.0, 6134.2], [1018.0, 17323.0], [1022.0, 18167.0], [1002.0, 10280.0], [1000.0, 17402.0], [1004.0, 18287.0], [992.0, 18074.0], [996.0, 17730.0], [998.0, 18799.0], [1016.0, 17644.0], [1020.0, 17181.0], [1008.0, 8171.0], [1012.0, 15131.0], [1014.0, 17233.0], [1010.0, 10808.0], [1028.0, 18199.0], [1036.0, 17104.0], [1080.0, 17086.0], [1032.0, 17355.0], [1024.0, 17203.0], [1052.0, 17275.0], [1048.0, 17577.0], [1044.0, 17159.0], [1040.0, 17380.0], [1072.0, 7872.666666666667], [1056.0, 17359.0], [1064.0, 17222.0], [1068.0, 16869.0], [1084.0, 17192.0], [1076.0, 16748.0], [1100.0, 9895.0], [1140.0, 16847.0], [1148.0, 16263.0], [1136.0, 16421.0], [1144.0, 16555.0], [1120.0, 17223.5], [1104.0, 16456.0], [1108.0, 9898.5], [1112.0, 10183.0], [1088.0, 17348.0], [1092.0, 16878.0], [1096.0, 17711.0], [1116.0, 17148.0], [1128.0, 10686.5], [1124.0, 16147.0], [1132.0, 16550.0], [1200.0, 6995.25], [1184.0, 8266.333333333334], [1164.0, 16706.0], [1160.0, 16719.0], [1156.0, 16756.0], [1152.0, 17171.0], [1204.0, 16588.0], [1208.0, 16345.0], [1212.0, 15356.0], [1176.0, 10467.0], [1172.0, 16348.0], [1168.0, 16515.0], [1180.0, 8444.666666666668], [1188.0, 10351.0], [1192.0, 10329.5], [1196.0, 7773.0], [1220.0, 16452.0], [1248.0, 9821.5], [1252.0, 15986.0], [1256.0, 15573.0], [1260.0, 14896.0], [1216.0, 15947.0], [1244.0, 15772.0], [1240.0, 15184.0], [1236.0, 15734.0], [1232.0, 16092.0], [1276.0, 15730.0], [1272.0, 15662.0], [1268.0, 15349.0], [1264.0, 15764.0], [1228.0, 15505.0], [1224.0, 15628.0], [1280.0, 14927.0], [1284.0, 14989.0], [1308.0, 15280.0], [1304.0, 15353.0], [1300.0, 15047.0], [1296.0, 15280.0], [1340.0, 9835.0], [1336.0, 14493.0], [1332.0, 15031.0], [1328.0, 9538.5], [1292.0, 15211.0], [1288.0, 14894.0], [1324.0, 14847.0], [1320.0, 9779.5], [1316.0, 14609.5], [1312.0, 15454.0], [1400.0, 9311.5], [1348.0, 9478.0], [1376.0, 7426.333333333334], [1380.0, 14854.0], [1384.0, 14939.0], [1388.0, 14307.0], [1404.0, 14671.0], [1392.0, 14662.0], [1356.0, 15096.0], [1352.0, 14455.0], [1396.0, 14397.0], [1364.0, 9239.0], [1360.0, 15116.0], [1368.0, 9170.0], [1344.0, 15474.0], [1372.0, 14669.0], [1460.0, 13943.0], [1408.0, 6787.5], [1456.0, 14108.0], [1420.0, 14724.0], [1416.0, 14219.0], [1412.0, 14800.0], [1448.0, 14146.0], [1444.0, 14407.0], [1440.0, 14108.0], [1452.0, 13721.0], [1428.0, 14288.0], [1424.0, 14300.0], [1432.0, 13822.0], [1436.0, 9966.5], [1468.0, 14212.0], [1464.0, 14038.0], [1480.0, 9335.0], [1520.0, 7395.333333333334], [1500.0, 9064.0], [1472.0, 14086.0], [1476.0, 7176.666666666666], [1484.0, 13847.0], [1524.0, 9161.5], [1532.0, 10317.333333333334], [1504.0, 13919.0], [1528.0, 13717.0], [1488.0, 13396.0], [1492.0, 13701.0], [1496.0, 13968.0], [1508.0, 9190.0], [1512.0, 13562.0], [1516.0, 9212.5], [1540.0, 13628.0], [1548.0, 6503.25], [1592.0, 8818.0], [1544.0, 14561.0], [1536.0, 13436.0], [1584.0, 13230.0], [1560.0, 13301.0], [1556.0, 13508.0], [1552.0, 13529.0], [1564.0, 14865.0], [1572.0, 8857.5], [1568.0, 13354.0], [1596.0, 13136.0], [1588.0, 7229.75], [1580.0, 13074.0], [1576.0, 13322.0], [1648.0, 12670.0], [1652.0, 9839.0], [1600.0, 13069.0], [1604.0, 13114.0], [1612.0, 12931.0], [1628.0, 12659.0], [1656.0, 9439.0], [1660.0, 8593.5], [1632.0, 12785.0], [1636.0, 6235.8], [1640.0, 8709.5], [1644.0, 12523.0], [1616.0, 8861.5], [1620.0, 7720.333333333334], [1624.0, 7094.666666666666], [1712.0, 8613.5], [1676.0, 12366.0], [1716.0, 7178.75], [1720.0, 13367.0], [1724.0, 8577.0], [1696.0, 12200.0], [1680.0, 12247.0], [1684.0, 8623.0], [1688.0, 8315.5], [1664.0, 14183.0], [1668.0, 14092.0], [1672.0, 12490.0], [1692.0, 12271.0], [1700.0, 9234.0], [1704.0, 9621.0], [1708.0, 12100.0], [1728.0, 12000.0], [1780.0, 9127.0], [1756.0, 8830.0], [1748.0, 13328.0], [1744.0, 11812.0], [1752.0, 11677.0], [1732.0, 11867.0], [1736.0, 8795.5], [1760.0, 12814.0], [1764.0, 12460.0], [1768.0, 13249.0], [1772.0, 11653.0], [1788.0, 11637.0], [1784.0, 5908.0], [1740.0, 11800.0], [1776.0, 11591.0], [1820.0, 10539.0], [1808.0, 11551.0], [1812.0, 10609.0], [1816.0, 10491.0], [1792.0, 11759.0], [1796.0, 7914.0], [1800.0, 7877.666666666666], [1804.0, 7623.0], [1836.0, 8188.0], [1824.0, 7862.5], [1832.0, 11618.0], [1828.0, 10471.0], [1852.0, 10174.0], [1848.0, 6417.5], [1840.0, 11962.0], [1844.0, 11889.0], [1864.0, 11595.0], [1860.0, 8289.0], [1856.0, 11173.0], [1884.0, 11236.0], [1868.0, 7025.75], [1916.0, 6852.0], [1888.0, 9721.0], [1892.0, 11071.0], [1908.0, 7140.333333333333], [1904.0, 10575.0], [1912.0, 8062.0], [1900.0, 11831.0], [1896.0, 8737.0], [1876.0, 7593.0], [1872.0, 10827.0], [1880.0, 8211.5], [1932.0, 10944.0], [1924.0, 7831.5], [1920.0, 10316.0], [1928.0, 9420.0], [1968.0, 10764.0], [1972.0, 9856.0], [1976.0, 8924.0], [1980.0, 8898.0], [1952.0, 9157.0], [1956.0, 9175.0], [1960.0, 10791.0], [1964.0, 7851.5], [1936.0, 10349.0], [1940.0, 9284.5], [1944.0, 7017.0], [1948.0, 7982.333333333333], [1996.0, 10332.0], [2032.0, 6799.666666666667], [1984.0, 8916.0], [1988.0, 10364.0], [1992.0, 6974.333333333333], [2036.0, 9299.5], [2040.0, 10022.0], [2044.0, 10081.0], [2020.0, 8541.0], [2016.0, 9945.0], [2024.0, 9552.0], [2028.0, 7665.0], [2004.0, 9823.0], [2000.0, 8721.0], [2008.0, 10964.0], [2012.0, 9892.0], [2056.0, 9932.0], [2072.0, 9911.0], [2152.0, 8025.5], [2064.0, 7884.5], [2048.0, 9749.0], [2104.0, 9472.0], [2096.0, 9577.0], [2088.0, 9316.0], [2080.0, 6973.0], [2144.0, 5276.0], [2128.0, 8269.0], [2136.0, 8598.5], [2112.0, 9204.0], [2168.0, 8118.0], [2160.0, 7283.0], [2176.0, 6894.0], [2192.0, 6982.0], [2224.0, 7216.666666666667], [2232.0, 7227.5], [2216.0, 8043.0], [2208.0, 8493.0], [2184.0, 7188.5], [2200.0, 7892.5], [2272.0, 8541.0], [2280.0, 7980.0], [2288.0, 8052.0], [2296.0, 7063.0], [2248.0, 8504.0], [2256.0, 8748.0], [2264.0, 8883.0], [2240.0, 7569.0], [2328.0, 8135.0], [2320.0, 7998.0], [2304.0, 7813.0], [2352.0, 7751.0], [2360.0, 7381.0], [2368.0, 7720.0], [2376.0, 6986.5], [2384.0, 7585.0], [2392.0, 7626.0], [2336.0, 7878.0], [2344.0, 7333.0], [2105.0, 8953.0], [2065.0, 8002.5], [2081.0, 9034.0], [2089.0, 9260.0], [2097.0, 8925.0], [2057.0, 9369.0], [2049.0, 8996.0], [2073.0, 7724.0], [2145.0, 9368.0], [2113.0, 8936.0], [2121.0, 9208.0], [2129.0, 9301.0], [2137.0, 9355.0], [2169.0, 7444.0], [2161.0, 9337.0], [2153.0, 8297.0], [2273.0, 6968.0], [2209.0, 7726.0], [2193.0, 8722.0], [2185.0, 7715.0], [2177.0, 8499.0], [2297.0, 6550.0], [2289.0, 8125.0], [2281.0, 8260.0], [2241.0, 7766.5], [2233.0, 8302.0], [2225.0, 7799.0], [2217.0, 8469.0], [2265.0, 6369.0], [2257.0, 8848.0], [2249.0, 8553.0], [2321.0, 7905.0], [2305.0, 7470.5], [2329.0, 6959.333333333333], [2361.0, 7597.0], [2353.0, 7408.0], [2313.0, 8323.5], [2369.0, 7832.0], [2377.0, 8145.0], [2385.0, 8060.0], [2337.0, 8184.0], [2345.0, 7578.5], [1029.0, 18130.0], [1025.0, 10251.5], [1033.0, 17971.0], [1037.0, 17861.0], [1073.0, 17661.0], [1045.0, 10412.5], [1041.0, 17603.0], [1053.0, 17285.0], [1077.0, 17252.0], [1081.0, 16678.0], [1069.0, 17026.0], [1065.0, 17061.0], [1061.0, 16977.5], [1057.0, 17186.0], [1085.0, 16665.0], [1117.0, 16408.0], [1145.0, 10270.5], [1137.0, 17313.0], [1101.0, 17214.0], [1141.0, 16923.0], [1105.0, 17117.0], [1109.0, 16851.0], [1113.0, 9999.5], [1089.0, 17033.0], [1093.0, 16852.0], [1121.0, 16576.0], [1125.0, 16745.0], [1129.0, 17219.0], [1149.0, 16431.0], [1133.0, 10346.0], [1165.0, 10058.0], [1201.0, 7775.0], [1161.0, 16804.0], [1157.0, 16580.0], [1153.0, 16788.0], [1205.0, 15637.0], [1209.0, 16046.0], [1185.0, 16085.0], [1213.0, 15990.0], [1169.0, 6601.6], [1173.0, 10421.0], [1177.0, 10192.5], [1181.0, 10397.0], [1189.0, 15525.0], [1193.0, 10216.5], [1197.0, 9948.5], [1277.0, 15013.0], [1253.0, 15441.0], [1249.0, 15490.0], [1257.0, 16014.0], [1261.0, 16386.0], [1273.0, 15327.0], [1269.0, 15719.0], [1265.0, 15445.0], [1229.0, 15687.0], [1225.0, 15490.0], [1221.0, 15568.0], [1217.0, 15291.0], [1245.0, 15870.0], [1241.0, 15608.0], [1237.0, 15488.0], [1233.0, 15969.0], [1285.0, 14968.0], [1337.0, 14640.0], [1329.0, 15425.0], [1281.0, 15378.0], [1289.0, 15789.0], [1293.0, 15180.0], [1309.0, 15513.0], [1305.0, 15032.0], [1301.0, 15499.0], [1333.0, 14703.0], [1325.0, 9642.0], [1317.0, 14039.0], [1321.0, 14569.0], [1313.0, 15168.0], [1341.0, 15269.0], [1357.0, 14856.0], [1349.0, 9627.5], [1345.0, 14591.0], [1353.0, 9085.0], [1377.0, 13868.0], [1381.0, 14675.0], [1385.0, 14654.0], [1389.0, 15055.0], [1397.0, 9362.0], [1401.0, 14465.0], [1405.0, 14173.0], [1393.0, 13012.0], [1365.0, 14774.0], [1369.0, 14609.0], [1373.0, 14367.0], [1461.0, 13838.0], [1421.0, 9334.0], [1433.0, 13962.0], [1457.0, 13959.0], [1465.0, 9127.0], [1469.0, 13847.0], [1441.0, 9657.5], [1449.0, 13946.0], [1445.0, 14245.0], [1453.0, 13965.0], [1425.0, 9015.5], [1429.0, 9346.5], [1409.0, 14370.0], [1413.0, 14555.0], [1417.0, 14592.0], [1521.0, 13766.0], [1525.0, 13753.0], [1485.0, 13722.0], [1481.0, 14122.0], [1529.0, 13455.0], [1505.0, 15550.0], [1533.0, 13574.0], [1489.0, 13849.0], [1493.0, 13678.0], [1497.0, 13527.0], [1501.0, 9180.5], [1477.0, 14122.0], [1473.0, 13883.0], [1513.0, 9007.5], [1517.0, 9182.0], [1509.0, 8972.5], [1541.0, 13654.0], [1589.0, 8990.0], [1561.0, 9048.5], [1549.0, 9016.0], [1545.0, 13407.0], [1537.0, 13251.0], [1565.0, 13199.0], [1553.0, 14813.0], [1557.0, 13507.0], [1593.0, 13215.0], [1597.0, 12968.0], [1585.0, 12828.0], [1581.0, 13284.0], [1577.0, 13078.0], [1573.0, 13012.0], [1569.0, 13277.0], [1609.0, 10157.333333333334], [1649.0, 8569.5], [1625.0, 9621.5], [1601.0, 13067.0], [1605.0, 13784.0], [1629.0, 12833.0], [1613.0, 7469.0], [1657.0, 12554.0], [1661.0, 8729.0], [1633.0, 13696.0], [1653.0, 8829.5], [1645.0, 12747.0], [1641.0, 12699.0], [1637.0, 12724.0], [1617.0, 13983.0], [1621.0, 12898.0], [1677.0, 12366.0], [1669.0, 8694.0], [1665.0, 12406.0], [1673.0, 12412.0], [1713.0, 9218.0], [1721.0, 12006.0], [1717.0, 12078.0], [1725.0, 8605.5], [1681.0, 12304.0], [1685.0, 12122.0], [1693.0, 13527.0], [1697.0, 8807.5], [1701.0, 12150.0], [1709.0, 12083.0], [1705.0, 13646.0], [1729.0, 8702.0], [1733.0, 6757.75], [1753.0, 11678.0], [1757.0, 12372.0], [1745.0, 8002.666666666666], [1749.0, 6299.142857142857], [1737.0, 11819.0], [1741.0, 11797.0], [1785.0, 10269.333333333334], [1761.0, 11605.0], [1765.0, 12829.0], [1769.0, 11591.0], [1773.0, 11582.0], [1789.0, 11497.0], [1781.0, 7261.333333333334], [1777.0, 11561.0], [1821.0, 7500.666666666667], [1805.0, 7311.0], [1841.0, 10312.0], [1809.0, 12053.0], [1813.0, 10551.0], [1817.0, 10558.0], [1797.0, 7165.0], [1793.0, 11836.0], [1801.0, 11392.0], [1825.0, 6962.333333333333], [1833.0, 8415.0], [1829.0, 11322.0], [1837.0, 11453.0], [1853.0, 8192.5], [1849.0, 7643.0], [1845.0, 8553.0], [1869.0, 10690.0], [1913.0, 10361.0], [1857.0, 10120.0], [1861.0, 8323.0], [1865.0, 8338.5], [1889.0, 8022.5], [1917.0, 11156.0], [1905.0, 10844.0], [1909.0, 10346.0], [1897.0, 8188.5], [1893.0, 10517.0], [1901.0, 11284.0], [1877.0, 8441.5], [1873.0, 11101.0], [1881.0, 7525.0], [1969.0, 7851.5], [1953.0, 7207.0], [1921.0, 9452.0], [1925.0, 10591.0], [1929.0, 9417.0], [1933.0, 9340.0], [1973.0, 10178.0], [1977.0, 8935.0], [1981.0, 10185.0], [1957.0, 6898.0], [1961.0, 9988.0], [1965.0, 7982.0], [1937.0, 9316.0], [1941.0, 10976.0], [1949.0, 10022.0], [1997.0, 8776.0], [2037.0, 7906.0], [1985.0, 9990.0], [1989.0, 10154.0], [1993.0, 9613.0], [2041.0, 9869.0], [2045.0, 6648.333333333333], [2017.0, 9704.0], [2021.0, 8078.0], [2025.0, 9484.0], [2029.0, 7233.5], [2005.0, 8676.0], [2001.0, 9725.0], [2009.0, 7993.5], [2013.0, 6954.0], [2050.0, 8018.5], [2058.0, 8129.0], [2106.0, 9110.0], [2098.0, 7707.0], [2090.0, 8794.0], [2082.0, 8208.0], [2066.0, 7106.0], [2074.0, 7923.5], [2146.0, 9718.0], [2122.0, 8172.5], [2130.0, 7540.5], [2138.0, 8434.0], [2114.0, 7297.5], [2170.0, 8833.0], [2162.0, 8791.0], [2154.0, 8386.0], [2186.0, 6816.5], [2194.0, 6106.0], [2226.0, 9305.0], [2234.0, 7748.0], [2210.0, 8638.0], [2218.0, 7427.0], [2178.0, 7161.5], [2202.0, 8935.5], [2274.0, 8588.0], [2282.0, 8476.0], [2290.0, 7234.0], [2298.0, 7309.0], [2242.0, 7572.0], [2250.0, 8341.0], [2258.0, 8817.0], [2266.0, 8757.0], [2314.0, 8172.0], [2306.0, 7328.0], [2362.0, 7648.0], [2354.0, 7801.0], [2346.0, 8148.0], [2322.0, 7872.0], [2330.0, 6915.0], [2370.0, 7979.0], [2378.0, 7653.0], [2386.0, 7043.0], [2338.0, 7431.0], [2107.0, 9250.0], [2083.0, 9553.0], [2091.0, 9694.0], [2099.0, 9617.0], [2059.0, 6737.5], [2051.0, 10122.0], [2067.0, 7651.5], [2075.0, 7479.0], [2147.0, 9175.0], [2115.0, 7361.666666666667], [2123.0, 8553.0], [2131.0, 9274.0], [2139.0, 8279.0], [2171.0, 7226.0], [2163.0, 9824.0], [2155.0, 9560.0], [2203.0, 8111.0], [2211.0, 7609.0], [2195.0, 7590.25], [2187.0, 7978.0], [2179.0, 9097.0], [2291.0, 8374.0], [2283.0, 7334.0], [2275.0, 8247.0], [2299.0, 7833.0], [2235.0, 9009.0], [2227.0, 7659.0], [2219.0, 8617.0], [2267.0, 6858.5], [2259.0, 8932.0], [2251.0, 8312.0], [2243.0, 9119.0], [2315.0, 7009.0], [2307.0, 7152.0], [2363.0, 7938.0], [2355.0, 7212.0], [2347.0, 6567.0], [2323.0, 7534.5], [2331.0, 6877.666666666667], [2371.0, 7848.0], [2379.0, 7525.0], [2387.0, 6549.0], [2339.0, 7530.0], [543.0, 21243.0], [527.0, 11802.5], [523.0, 11951.5], [521.0, 21289.0], [525.0, 21353.0], [535.0, 11294.0], [541.0, 21251.0], [539.0, 21296.0], [537.0, 21077.0], [519.0, 21433.0], [517.0, 21615.0], [515.0, 21683.0], [513.0, 21527.0], [533.0, 21999.0], [531.0, 21156.0], [529.0, 21125.0], [573.0, 21803.5], [575.0, 21626.0], [571.0, 21142.0], [569.0, 21293.0], [567.0, 21995.0], [565.0, 21283.0], [563.0, 21533.0], [561.0, 21916.0], [559.0, 21347.0], [547.0, 22077.0], [545.0, 20985.0], [551.0, 21185.0], [549.0, 21939.0], [557.0, 21966.0], [555.0, 21379.0], [553.0, 22226.0], [607.0, 20312.0], [581.0, 11316.0], [591.0, 20939.0], [579.0, 20429.0], [577.0, 21087.0], [589.0, 20980.0], [587.0, 21038.0], [585.0, 21153.0], [597.0, 11188.0], [605.0, 20168.0], [603.0, 20773.0], [601.0, 21129.0], [583.0, 20484.0], [599.0, 20261.0], [595.0, 20465.0], [593.0, 20825.0], [637.0, 20738.0], [609.0, 11336.5], [611.0, 20917.0], [615.0, 20352.0], [613.0, 20310.0], [623.0, 20658.0], [621.0, 20012.0], [619.0, 20068.0], [617.0, 20630.0], [639.0, 19931.0], [635.0, 19943.0], [633.0, 20175.0], [631.0, 20686.0], [629.0, 20360.0], [627.0, 20407.0], [625.0, 20487.0], [669.0, 19611.0], [641.0, 11135.0], [649.0, 10902.0], [651.0, 20104.0], [655.0, 20576.0], [653.0, 21139.0], [671.0, 20452.0], [667.0, 19842.0], [665.0, 20546.0], [647.0, 20532.0], [645.0, 20232.0], [643.0, 20671.0], [661.0, 20157.0], [659.0, 20455.0], [657.0, 20636.0], [701.0, 11046.0], [683.0, 10953.0], [681.0, 19715.0], [687.0, 19456.0], [675.0, 19919.0], [673.0, 20285.0], [679.0, 20371.0], [677.0, 19871.0], [685.0, 20072.0], [693.0, 11201.0], [703.0, 8217.0], [699.0, 20564.0], [697.0, 19386.0], [695.0, 19667.0], [691.0, 20050.0], [689.0, 19918.0], [733.0, 19438.0], [729.0, 10705.0], [735.0, 19146.0], [731.0, 19332.0], [727.0, 19830.0], [725.0, 20015.0], [723.0, 19201.0], [719.0, 19514.0], [707.0, 19188.0], [705.0, 20097.0], [711.0, 19505.0], [709.0, 20255.0], [717.0, 19932.0], [715.0, 20164.0], [713.0, 19399.0], [765.0, 19956.0], [747.0, 7980.666666666667], [745.0, 19184.0], [749.0, 10897.0], [767.0, 19569.0], [763.0, 20452.0], [761.0, 19931.0], [751.0, 19708.0], [743.0, 19460.0], [739.0, 20969.0], [759.0, 19758.0], [757.0, 19548.0], [755.0, 19795.0], [753.0, 19054.0], [797.0, 18606.0], [799.0, 19189.0], [795.0, 18860.0], [793.0, 19787.0], [791.0, 19047.0], [789.0, 19304.0], [787.0, 18952.0], [785.0, 19545.0], [783.0, 18790.0], [771.0, 20101.0], [769.0, 19715.0], [775.0, 19500.0], [773.0, 18992.0], [781.0, 19234.0], [779.0, 18838.0], [777.0, 18913.0], [827.0, 18771.0], [831.0, 18217.0], [825.0, 18999.0], [807.0, 20165.0], [805.0, 19475.0], [803.0, 19729.0], [801.0, 19607.0], [823.0, 19377.0], [821.0, 19536.0], [819.0, 19264.0], [817.0, 18869.0], [815.0, 20366.0], [813.0, 18852.0], [811.0, 18605.0], [809.0, 19183.0], [861.0, 19624.0], [849.0, 18564.0], [863.0, 18592.0], [851.0, 18524.0], [853.0, 18869.0], [859.0, 18536.0], [857.0, 19834.0], [847.0, 18288.0], [835.0, 18604.0], [833.0, 18806.0], [839.0, 18418.0], [837.0, 19642.0], [845.0, 18403.0], [843.0, 20145.0], [841.0, 18645.0], [855.0, 17804.0], [893.0, 17759.0], [895.0, 17832.0], [881.0, 18646.0], [883.0, 18788.0], [885.0, 19258.0], [891.0, 18444.0], [889.0, 17772.0], [879.0, 18896.0], [865.0, 18769.0], [867.0, 18297.0], [869.0, 17882.0], [871.0, 18866.0], [877.0, 18682.0], [875.0, 18639.0], [873.0, 18464.0], [887.0, 18563.0], [925.0, 18283.0], [927.0, 17929.0], [913.0, 18016.0], [915.0, 18365.0], [917.0, 19250.0], [923.0, 18448.0], [921.0, 18129.0], [911.0, 18243.0], [897.0, 18359.0], [899.0, 18785.0], [903.0, 18425.0], [907.0, 17821.0], [905.0, 18110.0], [919.0, 18382.0], [957.0, 18322.0], [959.0, 18575.0], [945.0, 18643.0], [947.0, 19132.0], [949.0, 17712.0], [955.0, 18593.0], [935.0, 19372.0], [933.0, 18921.0], [931.0, 18271.0], [929.0, 18098.0], [943.0, 17995.0], [941.0, 18332.0], [939.0, 18467.0], [937.0, 18454.0], [951.0, 18426.0], [989.0, 18081.0], [991.0, 18710.0], [977.0, 17766.0], [979.0, 17829.0], [981.0, 18580.0], [987.0, 17875.0], [985.0, 18009.0], [975.0, 17310.0], [961.0, 17248.0], [963.0, 18508.0], [965.0, 18738.0], [967.0, 18831.0], [973.0, 18167.0], [969.0, 17528.0], [983.0, 18300.0], [1007.0, 6874.0], [1001.0, 17316.0], [1003.0, 18587.0], [1005.0, 18339.0], [995.0, 18229.5], [993.0, 17771.0], [997.0, 17513.0], [999.0, 18134.0], [1017.0, 18158.0], [1019.0, 17251.0], [1021.0, 17669.0], [1009.0, 6086.4], [1011.0, 6720.75], [1013.0, 17730.0], [1015.0, 17964.0], [1023.0, 18384.0], [1030.0, 17393.0], [1034.0, 10179.0], [1026.0, 17499.0], [1038.0, 17608.0], [1054.0, 18019.0], [1050.0, 17171.0], [1046.0, 17078.0], [1042.0, 16968.0], [1086.0, 17072.0], [1058.0, 17012.0], [1062.0, 17424.0], [1070.0, 17142.0], [1082.0, 17167.0], [1078.0, 16699.0], [1074.0, 16759.0], [1118.0, 16434.0], [1142.0, 7975.333333333333], [1138.0, 16302.0], [1102.0, 16701.0], [1146.0, 16735.0], [1150.0, 16836.0], [1106.0, 10154.0], [1110.0, 16959.0], [1114.0, 16400.0], [1090.0, 17573.0], [1094.0, 16937.0], [1098.0, 17340.0], [1122.0, 10153.5], [1126.0, 17041.0], [1130.0, 16771.0], [1134.0, 4140.0], [1162.0, 17194.0], [1166.0, 10554.0], [1158.0, 17217.0], [1154.0, 16865.0], [1202.0, 9955.5], [1206.0, 15471.0], [1210.0, 16218.0], [1214.0, 15646.0], [1178.0, 8336.0], [1174.0, 16263.0], [1170.0, 16376.0], [1182.0, 8396.0], [1190.0, 7798.0], [1186.0, 6275.666666666667], [1194.0, 7064.5], [1198.0, 15742.0], [1218.0, 16100.0], [1274.0, 15632.0], [1250.0, 15660.0], [1254.0, 15907.0], [1258.0, 15822.0], [1262.0, 14623.0], [1246.0, 7711.0], [1242.0, 15173.0], [1238.0, 16340.0], [1234.0, 15428.0], [1222.0, 10563.0], [1278.0, 15058.0], [1270.0, 15520.0], [1266.0, 15384.0], [1230.0, 16080.0], [1226.0, 15408.0], [1282.0, 15294.0], [1330.0, 9655.0], [1342.0, 14844.0], [1286.0, 9825.5], [1310.0, 15369.0], [1306.0, 15033.0], [1302.0, 15468.0], [1298.0, 14856.0], [1338.0, 14943.0], [1334.0, 15288.0], [1294.0, 15556.0], [1290.0, 15262.0], [1326.0, 5504.0], [1322.0, 7907.0], [1318.0, 15293.0], [1314.0, 15206.0], [1406.0, 14333.0], [1378.0, 14576.0], [1382.0, 14598.0], [1386.0, 14147.0], [1390.0, 14721.0], [1402.0, 13751.0], [1394.0, 9492.5], [1358.0, 15305.0], [1354.0, 14893.0], [1350.0, 14636.0], [1398.0, 14258.0], [1362.0, 14679.5], [1366.0, 14439.0], [1370.0, 9478.5], [1374.0, 14834.0], [1346.0, 14686.0], [1422.0, 14086.0], [1466.0, 14063.0], [1438.0, 14513.0], [1418.0, 14246.0], [1414.0, 14360.0], [1410.0, 14115.0], [1458.0, 14368.0], [1470.0, 7961.0], [1454.0, 9068.0], [1450.0, 7625.333333333334], [1446.0, 14388.0], [1442.0, 14002.0], [1430.0, 9163.0], [1426.0, 14663.0], [1434.0, 14294.0], [1462.0, 14235.0], [1482.0, 14013.0], [1502.0, 13627.0], [1474.0, 15251.0], [1478.0, 13651.0], [1486.0, 13878.0], [1522.0, 6816.25], [1534.0, 9184.5], [1506.0, 13490.0], [1526.0, 4384.0], [1530.0, 13551.0], [1490.0, 6978.25], [1494.0, 13708.0], [1498.0, 13902.0], [1510.0, 8921.0], [1514.0, 13447.0], [1518.0, 9088.0], [1542.0, 13635.0], [1546.0, 8885.0], [1538.0, 13378.0], [1550.0, 6646.25], [1562.0, 8953.5], [1558.0, 13495.0], [1554.0, 13194.0], [1566.0, 13449.0], [1570.0, 13381.0], [1598.0, 12981.0], [1594.0, 12666.0], [1590.0, 12922.0], [1574.0, 9245.5], [1582.0, 7038.0], [1614.0, 12918.0], [1602.0, 8972.5], [1610.0, 12933.0], [1606.0, 12985.0], [1650.0, 13503.0], [1626.0, 7544.0], [1630.0, 8489.5], [1654.0, 8945.5], [1658.0, 12531.0], [1662.0, 8613.5], [1634.0, 8998.5], [1638.0, 14166.0], [1642.0, 13528.0], [1646.0, 13744.0], [1618.0, 8370.5], [1622.0, 12871.0], [1714.0, 7257.333333333334], [1674.0, 7086.0], [1686.0, 8582.0], [1678.0, 13686.0], [1718.0, 13095.0], [1722.0, 13317.0], [1726.0, 7368.333333333334], [1698.0, 12141.0], [1682.0, 8815.0], [1694.0, 13513.0], [1666.0, 12468.0], [1670.0, 12426.0], [1690.0, 12878.5], [1702.0, 9167.0], [1706.0, 8353.5], [1710.0, 12081.0], [1734.0, 6649.8], [1730.0, 8407.5], [1754.0, 8218.0], [1758.0, 12648.0], [1750.0, 7253.333333333334], [1746.0, 11727.0], [1762.0, 9146.5], [1766.0, 12983.0], [1770.0, 11589.0], [1774.0, 11588.0], [1790.0, 11582.0], [1786.0, 12383.0], [1782.0, 7895.0], [1778.0, 9289.0], [1742.0, 9126.0], [1738.0, 11897.0], [1794.0, 8265.5], [1798.0, 7572.666666666666], [1810.0, 8986.0], [1814.0, 10590.0], [1818.0, 10536.0], [1822.0, 12170.0], [1802.0, 11916.0], [1834.0, 6853.25], [1838.0, 11817.0], [1826.0, 10444.0], [1854.0, 11152.0], [1850.0, 11215.0], [1846.0, 8425.5], [1842.0, 8145.5], [1806.0, 10707.0], [1866.0, 11698.0], [1870.0, 7724.666666666667], [1858.0, 6995.333333333333], [1886.0, 10582.5], [1882.0, 9853.0], [1862.0, 11143.0], [1918.0, 10315.0], [1890.0, 11414.0], [1894.0, 10704.0], [1914.0, 8249.0], [1906.0, 10804.0], [1910.0, 11279.0], [1902.0, 7948.0], [1898.0, 11177.0], [1874.0, 11357.0], [1878.0, 9881.0], [1934.0, 6853.333333333333], [1922.0, 7698.0], [1926.0, 11150.0], [1930.0, 10649.0], [1974.0, 10032.0], [1970.0, 10538.0], [1978.0, 8923.0], [1982.0, 7873.0], [1954.0, 6072.0], [1958.0, 7377.0], [1962.0, 8102.5], [1966.0, 6362.666666666667], [1938.0, 8378.0], [1942.0, 10131.0], [1946.0, 10627.5], [1950.0, 7878.5], [1998.0, 8757.0], [2034.0, 8273.0], [1990.0, 7115.0], [1986.0, 8889.0], [2014.0, 8570.0], [1994.0, 8775.0], [2042.0, 8021.0], [2038.0, 10330.0], [2046.0, 6508.333333333333], [2018.0, 9921.0], [2022.0, 6827.666666666667], [2026.0, 10131.0], [2030.0, 8472.0], [2006.0, 8348.0], [2002.0, 9849.0], [2010.0, 8642.0], [2052.0, 9484.0], [2060.0, 9463.0], [2108.0, 7655.0], [2100.0, 9200.0], [2092.0, 6874.5], [2084.0, 7855.0], [2068.0, 7072.0], [2076.0, 9794.0], [2148.0, 9151.0], [2116.0, 6990.666666666667], [2124.0, 9284.0], [2132.0, 9356.0], [2172.0, 9710.0], [2164.0, 7258.0], [2156.0, 9110.0], [2180.0, 8967.0], [2188.0, 9339.0], [2220.0, 6934.0], [2228.0, 6357.5], [2236.0, 8745.0], [2212.0, 8749.0], [2196.0, 7374.0], [2204.0, 8724.0], [2276.0, 7051.5], [2284.0, 8371.0], [2292.0, 8608.0], [2300.0, 7959.0], [2244.0, 6563.0], [2252.0, 8976.0], [2260.0, 7427.5], [2268.0, 6654.333333333333], [2324.0, 7765.0], [2332.0, 6918.0], [2308.0, 7060.0], [2364.0, 7202.0], [2356.0, 7664.0], [2348.0, 7666.0], [2316.0, 8364.0], [2372.0, 7317.0], [2380.0, 7428.0], [2388.0, 6425.0], [2340.0, 7945.0], [2109.0, 8322.0], [2085.0, 7805.0], [2093.0, 9691.0], [2101.0, 8758.0], [2053.0, 9776.0], [2061.0, 9396.0], [2069.0, 9005.0], [2077.0, 9018.0], [2149.0, 9073.0], [2117.0, 7590.0], [2125.0, 9235.0], [2133.0, 8133.0], [2141.0, 8648.5], [2173.0, 8080.5], [2165.0, 7260.0], [2157.0, 8696.0], [2197.0, 6638.2], [2189.0, 8690.0], [2293.0, 8243.0], [2181.0, 8262.0], [2205.0, 7846.0], [2285.0, 8224.0], [2277.0, 8279.0], [2301.0, 8488.0], [2237.0, 7292.0], [2229.0, 8352.5], [2221.0, 8656.0], [2213.0, 8276.0], [2261.0, 7081.0], [2253.0, 8243.0], [2245.0, 8365.0], [2269.0, 7624.0], [2309.0, 7683.0], [2365.0, 7364.0], [2357.0, 7986.0], [2349.0, 7434.0], [2317.0, 7615.0], [2325.0, 7072.5], [2333.0, 7870.0], [2373.0, 7715.0], [2381.0, 7427.0], [2389.0, 7112.0], [2341.0, 7484.0], [1031.0, 10499.0], [1075.0, 9882.5], [1027.0, 17627.0], [1035.0, 18034.0], [1039.0, 17731.0], [1043.0, 17467.0], [1047.0, 17306.0], [1051.0, 10408.5], [1055.0, 16988.0], [1079.0, 10444.5], [1083.0, 10333.5], [1087.0, 16920.0], [1071.0, 17156.0], [1067.0, 16970.0], [1063.0, 17997.0], [1059.0, 17045.0], [1095.0, 10220.0], [1111.0, 10455.5], [1139.0, 10347.5], [1103.0, 16641.0], [1099.0, 16617.0], [1143.0, 17133.0], [1107.0, 10271.0], [1091.0, 17880.0], [1115.0, 17161.0], [1131.0, 10596.0], [1151.0, 16929.0], [1123.0, 16950.0], [1127.0, 16418.0], [1147.0, 16849.0], [1135.0, 16544.5], [1163.0, 10377.5], [1179.0, 8308.333333333332], [1167.0, 16541.0], [1183.0, 10139.0], [1159.0, 16922.0], [1155.0, 16086.0], [1203.0, 10093.5], [1207.0, 16123.0], [1211.0, 15590.0], [1215.0, 15865.0], [1171.0, 17386.0], [1175.0, 16326.0], [1191.0, 7096.75], [1187.0, 8247.0], [1195.0, 9510.0], [1199.0, 9598.5], [1275.0, 15204.0], [1255.0, 10335.0], [1251.0, 16064.0], [1259.0, 15450.0], [1263.0, 15489.0], [1279.0, 15151.0], [1271.0, 15531.0], [1267.0, 15671.0], [1231.0, 15884.0], [1223.0, 15837.0], [1219.0, 15024.0], [1247.0, 15116.0], [1243.0, 15231.0], [1239.0, 15327.0], [1235.0, 15860.0], [1283.0, 15524.0], [1315.0, 3825.0], [1331.0, 9523.5], [1311.0, 15363.0], [1287.0, 15851.0], [1291.0, 15366.0], [1295.0, 15017.0], [1307.0, 15144.0], [1303.0, 15508.0], [1299.0, 15091.0], [1335.0, 15027.0], [1327.0, 5411.285714285715], [1323.0, 9371.0], [1319.0, 9739.0], [1343.0, 15101.0], [1339.0, 15390.0], [1359.0, 9297.5], [1355.0, 9448.5], [1347.0, 14780.0], [1351.0, 9333.0], [1407.0, 9491.0], [1379.0, 14295.0], [1383.0, 15111.0], [1387.0, 14125.0], [1391.0, 14334.0], [1399.0, 9210.5], [1403.0, 14448.0], [1395.0, 9531.0], [1363.0, 7329.333333333334], [1367.0, 15269.0], [1371.0, 14627.0], [1375.0, 14897.0], [1463.0, 14296.0], [1431.0, 9249.5], [1423.0, 9537.5], [1459.0, 14327.0], [1467.0, 9015.0], [1471.0, 14093.0], [1451.0, 9219.5], [1447.0, 14313.0], [1443.0, 13916.0], [1455.0, 13939.0], [1427.0, 13859.0], [1439.0, 8985.0], [1411.0, 14785.0], [1415.0, 14762.0], [1419.0, 14745.0], [1435.0, 14179.0], [1487.0, 14060.0], [1527.0, 7636.833333333333], [1507.0, 7733.333333333334], [1479.0, 8774.0], [1523.0, 13764.0], [1483.0, 13933.0], [1535.0, 13588.0], [1491.0, 8976.0], [1495.0, 13807.0], [1499.0, 9212.0], [1503.0, 13801.0], [1475.0, 14000.0], [1519.0, 9322.5], [1515.0, 13502.0], [1511.0, 13631.0], [1543.0, 13498.0], [1547.0, 13590.0], [1539.0, 13175.0], [1551.0, 13524.0], [1567.0, 12990.0], [1563.0, 13119.0], [1555.0, 8977.0], [1559.0, 13472.0], [1591.0, 9826.5], [1595.0, 13117.0], [1587.0, 8106.4], [1583.0, 9021.5], [1579.0, 13167.0], [1575.0, 13348.0], [1571.0, 13365.0], [1599.0, 14211.0], [1611.0, 12935.0], [1631.0, 12797.0], [1603.0, 13030.0], [1607.0, 13051.0], [1627.0, 12870.0], [1655.0, 6849.5], [1659.0, 8473.0], [1663.0, 12470.0], [1651.0, 12681.0], [1635.0, 7258.333333333334], [1647.0, 8408.5], [1643.0, 12711.0], [1639.0, 12705.0], [1619.0, 8595.0], [1623.0, 12861.0], [1671.0, 12412.0], [1715.0, 7281.5], [1667.0, 12409.0], [1675.0, 9329.5], [1679.0, 12382.0], [1723.0, 8719.5], [1719.0, 13273.0], [1683.0, 9006.5], [1687.0, 12272.0], [1691.0, 13113.0], [1695.0, 12199.0], [1699.0, 12142.0], [1727.0, 13395.0], [1703.0, 9032.5], [1711.0, 8503.0], [1707.0, 13204.0], [1731.0, 6677.75], [1783.0, 6913.0], [1751.0, 7181.666666666666], [1755.0, 13060.0], [1759.0, 12648.0], [1747.0, 11718.0], [1735.0, 7536.333333333334], [1739.0, 13197.0], [1743.0, 9478.0], [1787.0, 11745.0], [1791.0, 12490.0], [1763.0, 12694.0], [1767.0, 13148.0], [1771.0, 11577.0], [1775.0, 11625.0], [1779.0, 13319.0], [1795.0, 12242.0], [1807.0, 8115.5], [1819.0, 8986.5], [1811.0, 6665.5], [1815.0, 11872.0], [1823.0, 11594.0], [1803.0, 7985.0], [1799.0, 10677.0], [1831.0, 11685.5], [1827.0, 10425.0], [1835.0, 10417.0], [1839.0, 11733.0], [1851.0, 6948.666666666666], [1855.0, 10094.0], [1847.0, 8749.5], [1843.0, 10310.0], [1863.0, 11682.0], [1859.0, 7198.0], [1887.0, 11423.0], [1883.0, 11404.0], [1867.0, 10876.0], [1871.0, 11314.0], [1919.0, 10951.0], [1915.0, 7558.5], [1907.0, 9575.0], [1911.0, 10433.0], [1895.0, 11139.0], [1891.0, 11135.0], [1899.0, 10556.0], [1903.0, 9645.0], [1875.0, 10854.0], [1879.0, 11099.0], [1931.0, 8528.0], [1923.0, 10748.0], [1951.0, 10142.0], [1927.0, 8276.0], [1975.0, 7642.5], [1971.0, 10167.0], [1979.0, 9904.0], [1983.0, 8912.0], [1955.0, 9812.5], [1959.0, 8285.5], [1963.0, 7962.0], [1967.0, 8642.0], [1943.0, 10754.0], [1947.0, 9229.0], [1995.0, 10152.0], [1987.0, 7534.5], [2015.0, 8591.0], [1991.0, 7834.5], [1999.0, 6870.0], [2039.0, 9305.0], [2043.0, 9830.0], [2047.0, 9845.0], [2019.0, 10091.0], [2023.0, 10316.0], [2027.0, 8502.0], [2031.0, 6778.0], [2003.0, 8688.0], [2007.0, 7801.5], [2011.0, 10688.0], [2054.0, 9491.0], [2062.0, 10431.0], [2110.0, 9636.0], [2102.0, 9242.0], [2094.0, 8482.0], [2086.0, 7442.5], [2070.0, 8855.0], [2078.0, 7888.0], [2150.0, 9018.0], [2118.0, 6823.5], [2126.0, 9237.0], [2134.0, 7080.5], [2142.0, 9080.0], [2174.0, 8293.0], [2166.0, 8633.0], [2158.0, 8080.0], [2182.0, 7940.0], [2190.0, 7733.0], [2222.0, 8786.0], [2230.0, 7511.0], [2238.0, 8853.0], [2214.0, 8342.0], [2198.0, 6917.0], [2206.0, 7582.5], [2286.0, 7024.333333333333], [2278.0, 7375.0], [2294.0, 8186.0], [2302.0, 7768.0], [2246.0, 7380.0], [2254.0, 8393.0], [2262.0, 7236.0], [2270.0, 8398.0], [2310.0, 7493.0], [2366.0, 7370.0], [2358.0, 7258.0], [2350.0, 7554.0], [2318.0, 7149.5], [2326.0, 7339.0], [2334.0, 7370.5], [2374.0, 7333.0], [2382.0, 7044.0], [2390.0, 6801.0], [2342.0, 7162.0], [2055.0, 9126.0], [2151.0, 7253.0], [2071.0, 7493.5], [2087.0, 7854.0], [2095.0, 8998.0], [2103.0, 9497.0], [2063.0, 9316.0], [2111.0, 7607.0], [2079.0, 7764.0], [2119.0, 9268.0], [2127.0, 9458.0], [2143.0, 9761.0], [2175.0, 8230.0], [2167.0, 9157.0], [2159.0, 8620.0], [2207.0, 7732.5], [2191.0, 9362.0], [2183.0, 8834.0], [2199.0, 8520.0], [2295.0, 7979.0], [2287.0, 7958.0], [2279.0, 8690.0], [2303.0, 8295.0], [2239.0, 6920.5], [2231.0, 8612.0], [2223.0, 9228.0], [2263.0, 8552.0], [2255.0, 7707.0], [2247.0, 8600.0], [2271.0, 6999.25], [2319.0, 7830.0], [2367.0, 7457.0], [2351.0, 7699.0], [2359.0, 7258.5], [2311.0, 7715.5], [2327.0, 7658.0], [2335.0, 8260.0], [2375.0, 7748.0], [2383.0, 7154.5], [2391.0, 6242.0], [2343.0, 6799.0], [1.0, 23289.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1287.9689999999975, 13781.936666666676]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2392.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 3600.0, "minX": 1.54960842E12, "maxY": 17006.266666666666, "series": [{"data": [[1.54960842E12, 17006.266666666666], [1.54960848E12, 4041.4666666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960842E12, 15150.0], [1.54960848E12, 3600.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960848E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 11682.554455445566, "minX": 1.54960842E12, "maxY": 22616.836805555526, "series": [{"data": [[1.54960842E12, 11682.554455445566], [1.54960848E12, 22616.836805555526]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960848E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 11682.523102310237, "minX": 1.54960842E12, "maxY": 22616.836805555526, "series": [{"data": [[1.54960842E12, 11682.523102310237], [1.54960848E12, 22616.836805555526]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960848E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.5503472222222221, "minX": 1.54960842E12, "maxY": 117.99463696369654, "series": [{"data": [[1.54960842E12, 117.99463696369654], [1.54960848E12, 0.5503472222222221]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960848E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1094.0, "minX": 1.54960842E12, "maxY": 24316.0, "series": [{"data": [[1.54960842E12, 21285.0], [1.54960848E12, 24316.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960842E12, 1094.0], [1.54960848E12, 20985.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960842E12, 19043.0], [1.54960848E12, 22717.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960842E12, 20682.25], [1.54960848E12, 23416.94]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960842E12, 19929.0], [1.54960848E12, 23077.85]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960848E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 11715.5, "minX": 9.0, "maxY": 22746.5, "series": [{"data": [[9.0, 22746.5], [40.0, 11715.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 40.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 11715.5, "minX": 9.0, "maxY": 22746.5, "series": [{"data": [[9.0, 22746.5], [40.0, 11715.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 40.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 9.6, "minX": 1.54960842E12, "maxY": 40.4, "series": [{"data": [[1.54960842E12, 40.4], [1.54960848E12, 9.6]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960848E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 9.6, "minX": 1.54960842E12, "maxY": 40.4, "series": [{"data": [[1.54960842E12, 40.4], [1.54960848E12, 9.6]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960848E12, "title": "Transactions Per Second"}},
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
