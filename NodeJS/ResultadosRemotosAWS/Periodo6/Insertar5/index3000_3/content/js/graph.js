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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 13363.0, "series": [{"data": [[0.0, 1.0], [0.1, 1.0], [0.2, 1.0], [0.3, 2.0], [0.4, 2.0], [0.5, 2.0], [0.6, 2.0], [0.7, 2.0], [0.8, 2.0], [0.9, 2.0], [1.0, 2.0], [1.1, 2.0], [1.2, 2.0], [1.3, 2.0], [1.4, 2.0], [1.5, 2.0], [1.6, 2.0], [1.7, 2.0], [1.8, 2.0], [1.9, 2.0], [2.0, 2.0], [2.1, 2.0], [2.2, 2.0], [2.3, 2.0], [2.4, 2.0], [2.5, 2.0], [2.6, 2.0], [2.7, 2.0], [2.8, 2.0], [2.9, 2.0], [3.0, 2.0], [3.1, 2.0], [3.2, 2.0], [3.3, 2.0], [3.4, 2.0], [3.5, 2.0], [3.6, 2.0], [3.7, 2.0], [3.8, 2.0], [3.9, 2.0], [4.0, 2.0], [4.1, 2.0], [4.2, 2.0], [4.3, 2.0], [4.4, 2.0], [4.5, 2.0], [4.6, 2.0], [4.7, 2.0], [4.8, 2.0], [4.9, 2.0], [5.0, 2.0], [5.1, 2.0], [5.2, 2.0], [5.3, 2.0], [5.4, 2.0], [5.5, 2.0], [5.6, 2.0], [5.7, 2.0], [5.8, 2.0], [5.9, 2.0], [6.0, 2.0], [6.1, 2.0], [6.2, 2.0], [6.3, 2.0], [6.4, 2.0], [6.5, 2.0], [6.6, 2.0], [6.7, 2.0], [6.8, 2.0], [6.9, 2.0], [7.0, 2.0], [7.1, 2.0], [7.2, 2.0], [7.3, 2.0], [7.4, 2.0], [7.5, 2.0], [7.6, 2.0], [7.7, 2.0], [7.8, 2.0], [7.9, 2.0], [8.0, 2.0], [8.1, 2.0], [8.2, 2.0], [8.3, 2.0], [8.4, 2.0], [8.5, 2.0], [8.6, 2.0], [8.7, 2.0], [8.8, 2.0], [8.9, 2.0], [9.0, 2.0], [9.1, 2.0], [9.2, 2.0], [9.3, 2.0], [9.4, 2.0], [9.5, 2.0], [9.6, 2.0], [9.7, 2.0], [9.8, 2.0], [9.9, 2.0], [10.0, 2.0], [10.1, 2.0], [10.2, 2.0], [10.3, 2.0], [10.4, 2.0], [10.5, 2.0], [10.6, 2.0], [10.7, 2.0], [10.8, 2.0], [10.9, 2.0], [11.0, 2.0], [11.1, 2.0], [11.2, 2.0], [11.3, 2.0], [11.4, 2.0], [11.5, 2.0], [11.6, 2.0], [11.7, 2.0], [11.8, 2.0], [11.9, 2.0], [12.0, 2.0], [12.1, 2.0], [12.2, 2.0], [12.3, 2.0], [12.4, 2.0], [12.5, 2.0], [12.6, 2.0], [12.7, 2.0], [12.8, 2.0], [12.9, 2.0], [13.0, 2.0], [13.1, 2.0], [13.2, 2.0], [13.3, 2.0], [13.4, 2.0], [13.5, 2.0], [13.6, 2.0], [13.7, 2.0], [13.8, 2.0], [13.9, 2.0], [14.0, 2.0], [14.1, 2.0], [14.2, 2.0], [14.3, 2.0], [14.4, 2.0], [14.5, 2.0], [14.6, 2.0], [14.7, 2.0], [14.8, 2.0], [14.9, 2.0], [15.0, 2.0], [15.1, 2.0], [15.2, 2.0], [15.3, 2.0], [15.4, 2.0], [15.5, 2.0], [15.6, 2.0], [15.7, 2.0], [15.8, 2.0], [15.9, 2.0], [16.0, 2.0], [16.1, 2.0], [16.2, 2.0], [16.3, 2.0], [16.4, 2.0], [16.5, 2.0], [16.6, 2.0], [16.7, 2.0], [16.8, 2.0], [16.9, 2.0], [17.0, 2.0], [17.1, 2.0], [17.2, 2.0], [17.3, 2.0], [17.4, 2.0], [17.5, 2.0], [17.6, 2.0], [17.7, 2.0], [17.8, 2.0], [17.9, 2.0], [18.0, 2.0], [18.1, 2.0], [18.2, 2.0], [18.3, 2.0], [18.4, 2.0], [18.5, 2.0], [18.6, 2.0], [18.7, 2.0], [18.8, 2.0], [18.9, 2.0], [19.0, 2.0], [19.1, 2.0], [19.2, 2.0], [19.3, 2.0], [19.4, 2.0], [19.5, 2.0], [19.6, 2.0], [19.7, 2.0], [19.8, 2.0], [19.9, 2.0], [20.0, 2.0], [20.1, 2.0], [20.2, 2.0], [20.3, 2.0], [20.4, 2.0], [20.5, 2.0], [20.6, 2.0], [20.7, 2.0], [20.8, 2.0], [20.9, 2.0], [21.0, 2.0], [21.1, 2.0], [21.2, 2.0], [21.3, 2.0], [21.4, 2.0], [21.5, 2.0], [21.6, 2.0], [21.7, 2.0], [21.8, 2.0], [21.9, 2.0], [22.0, 2.0], [22.1, 2.0], [22.2, 2.0], [22.3, 2.0], [22.4, 2.0], [22.5, 2.0], [22.6, 2.0], [22.7, 2.0], [22.8, 2.0], [22.9, 2.0], [23.0, 2.0], [23.1, 2.0], [23.2, 2.0], [23.3, 2.0], [23.4, 2.0], [23.5, 2.0], [23.6, 2.0], [23.7, 2.0], [23.8, 2.0], [23.9, 2.0], [24.0, 2.0], [24.1, 2.0], [24.2, 2.0], [24.3, 2.0], [24.4, 2.0], [24.5, 3.0], [24.6, 3.0], [24.7, 3.0], [24.8, 3.0], [24.9, 3.0], [25.0, 3.0], [25.1, 3.0], [25.2, 3.0], [25.3, 3.0], [25.4, 3.0], [25.5, 3.0], [25.6, 3.0], [25.7, 3.0], [25.8, 3.0], [25.9, 3.0], [26.0, 3.0], [26.1, 3.0], [26.2, 3.0], [26.3, 3.0], [26.4, 3.0], [26.5, 3.0], [26.6, 3.0], [26.7, 3.0], [26.8, 3.0], [26.9, 3.0], [27.0, 3.0], [27.1, 3.0], [27.2, 3.0], [27.3, 3.0], [27.4, 3.0], [27.5, 3.0], [27.6, 3.0], [27.7, 3.0], [27.8, 3.0], [27.9, 3.0], [28.0, 3.0], [28.1, 3.0], [28.2, 3.0], [28.3, 3.0], [28.4, 3.0], [28.5, 3.0], [28.6, 3.0], [28.7, 3.0], [28.8, 3.0], [28.9, 3.0], [29.0, 3.0], [29.1, 3.0], [29.2, 3.0], [29.3, 3.0], [29.4, 3.0], [29.5, 3.0], [29.6, 3.0], [29.7, 3.0], [29.8, 3.0], [29.9, 3.0], [30.0, 3.0], [30.1, 3.0], [30.2, 3.0], [30.3, 3.0], [30.4, 3.0], [30.5, 3.0], [30.6, 3.0], [30.7, 3.0], [30.8, 3.0], [30.9, 3.0], [31.0, 3.0], [31.1, 3.0], [31.2, 3.0], [31.3, 3.0], [31.4, 3.0], [31.5, 3.0], [31.6, 3.0], [31.7, 3.0], [31.8, 3.0], [31.9, 3.0], [32.0, 3.0], [32.1, 3.0], [32.2, 3.0], [32.3, 3.0], [32.4, 3.0], [32.5, 3.0], [32.6, 3.0], [32.7, 3.0], [32.8, 3.0], [32.9, 3.0], [33.0, 3.0], [33.1, 3.0], [33.2, 3.0], [33.3, 3.0], [33.4, 3.0], [33.5, 3.0], [33.6, 3.0], [33.7, 3.0], [33.8, 3.0], [33.9, 3.0], [34.0, 3.0], [34.1, 3.0], [34.2, 3.0], [34.3, 3.0], [34.4, 3.0], [34.5, 3.0], [34.6, 3.0], [34.7, 3.0], [34.8, 3.0], [34.9, 3.0], [35.0, 3.0], [35.1, 3.0], [35.2, 3.0], [35.3, 3.0], [35.4, 3.0], [35.5, 3.0], [35.6, 3.0], [35.7, 3.0], [35.8, 3.0], [35.9, 3.0], [36.0, 3.0], [36.1, 3.0], [36.2, 3.0], [36.3, 3.0], [36.4, 3.0], [36.5, 3.0], [36.6, 3.0], [36.7, 3.0], [36.8, 3.0], [36.9, 3.0], [37.0, 3.0], [37.1, 3.0], [37.2, 3.0], [37.3, 3.0], [37.4, 3.0], [37.5, 3.0], [37.6, 3.0], [37.7, 3.0], [37.8, 3.0], [37.9, 3.0], [38.0, 3.0], [38.1, 3.0], [38.2, 3.0], [38.3, 3.0], [38.4, 3.0], [38.5, 3.0], [38.6, 3.0], [38.7, 3.0], [38.8, 3.0], [38.9, 3.0], [39.0, 3.0], [39.1, 3.0], [39.2, 3.0], [39.3, 3.0], [39.4, 3.0], [39.5, 3.0], [39.6, 3.0], [39.7, 3.0], [39.8, 4.0], [39.9, 4.0], [40.0, 4.0], [40.1, 4.0], [40.2, 4.0], [40.3, 4.0], [40.4, 4.0], [40.5, 4.0], [40.6, 4.0], [40.7, 4.0], [40.8, 4.0], [40.9, 4.0], [41.0, 4.0], [41.1, 4.0], [41.2, 4.0], [41.3, 4.0], [41.4, 4.0], [41.5, 4.0], [41.6, 4.0], [41.7, 5.0], [41.8, 5.0], [41.9, 5.0], [42.0, 5.0], [42.1, 5.0], [42.2, 5.0], [42.3, 5.0], [42.4, 5.0], [42.5, 5.0], [42.6, 5.0], [42.7, 5.0], [42.8, 5.0], [42.9, 5.0], [43.0, 5.0], [43.1, 5.0], [43.2, 5.0], [43.3, 6.0], [43.4, 6.0], [43.5, 6.0], [43.6, 6.0], [43.7, 6.0], [43.8, 6.0], [43.9, 6.0], [44.0, 7.0], [44.1, 7.0], [44.2, 7.0], [44.3, 7.0], [44.4, 7.0], [44.5, 7.0], [44.6, 8.0], [44.7, 8.0], [44.8, 9.0], [44.9, 9.0], [45.0, 10.0], [45.1, 11.0], [45.2, 13.0], [45.3, 15.0], [45.4, 16.0], [45.5, 17.0], [45.6, 19.0], [45.7, 22.0], [45.8, 24.0], [45.9, 25.0], [46.0, 27.0], [46.1, 32.0], [46.2, 35.0], [46.3, 42.0], [46.4, 49.0], [46.5, 64.0], [46.6, 67.0], [46.7, 79.0], [46.8, 86.0], [46.9, 89.0], [47.0, 98.0], [47.1, 104.0], [47.2, 113.0], [47.3, 120.0], [47.4, 123.0], [47.5, 128.0], [47.6, 142.0], [47.7, 152.0], [47.8, 169.0], [47.9, 174.0], [48.0, 176.0], [48.1, 177.0], [48.2, 178.0], [48.3, 181.0], [48.4, 182.0], [48.5, 182.0], [48.6, 184.0], [48.7, 185.0], [48.8, 187.0], [48.9, 189.0], [49.0, 192.0], [49.1, 193.0], [49.2, 197.0], [49.3, 200.0], [49.4, 209.0], [49.5, 214.0], [49.6, 250.0], [49.7, 291.0], [49.8, 311.0], [49.9, 328.0], [50.0, 439.0], [50.1, 470.0], [50.2, 556.0], [50.3, 613.0], [50.4, 664.0], [50.5, 695.0], [50.6, 742.0], [50.7, 765.0], [50.8, 831.0], [50.9, 867.0], [51.0, 898.0], [51.1, 938.0], [51.2, 955.0], [51.3, 958.0], [51.4, 960.0], [51.5, 962.0], [51.6, 963.0], [51.7, 965.0], [51.8, 967.0], [51.9, 968.0], [52.0, 969.0], [52.1, 971.0], [52.2, 974.0], [52.3, 974.0], [52.4, 976.0], [52.5, 978.0], [52.6, 979.0], [52.7, 981.0], [52.8, 982.0], [52.9, 984.0], [53.0, 986.0], [53.1, 989.0], [53.2, 992.0], [53.3, 994.0], [53.4, 995.0], [53.5, 996.0], [53.6, 996.0], [53.7, 999.0], [53.8, 1000.0], [53.9, 1002.0], [54.0, 1003.0], [54.1, 1004.0], [54.2, 1005.0], [54.3, 1006.0], [54.4, 1009.0], [54.5, 1010.0], [54.6, 1011.0], [54.7, 1014.0], [54.8, 1018.0], [54.9, 1024.0], [55.0, 1026.0], [55.1, 1027.0], [55.2, 1030.0], [55.3, 1035.0], [55.4, 1058.0], [55.5, 1062.0], [55.6, 1064.0], [55.7, 1080.0], [55.8, 1087.0], [55.9, 1089.0], [56.0, 1095.0], [56.1, 1101.0], [56.2, 1121.0], [56.3, 1174.0], [56.4, 1177.0], [56.5, 1199.0], [56.6, 1216.0], [56.7, 1230.0], [56.8, 1233.0], [56.9, 1254.0], [57.0, 1265.0], [57.1, 1288.0], [57.2, 1304.0], [57.3, 1328.0], [57.4, 1354.0], [57.5, 1416.0], [57.6, 1453.0], [57.7, 1457.0], [57.8, 1466.0], [57.9, 1498.0], [58.0, 1506.0], [58.1, 1552.0], [58.2, 1622.0], [58.3, 1631.0], [58.4, 1663.0], [58.5, 1678.0], [58.6, 1690.0], [58.7, 1713.0], [58.8, 1761.0], [58.9, 1766.0], [59.0, 1786.0], [59.1, 1812.0], [59.2, 1835.0], [59.3, 1843.0], [59.4, 1858.0], [59.5, 1892.0], [59.6, 1952.0], [59.7, 1962.0], [59.8, 1975.0], [59.9, 1985.0], [60.0, 1997.0], [60.1, 2010.0], [60.2, 2026.0], [60.3, 2080.0], [60.4, 2104.0], [60.5, 2118.0], [60.6, 2170.0], [60.7, 2195.0], [60.8, 2224.0], [60.9, 2246.0], [61.0, 2286.0], [61.1, 2333.0], [61.2, 2364.0], [61.3, 2383.0], [61.4, 2416.0], [61.5, 2438.0], [61.6, 2465.0], [61.7, 2497.0], [61.8, 2552.0], [61.9, 2589.0], [62.0, 2631.0], [62.1, 2640.0], [62.2, 2715.0], [62.3, 2725.0], [62.4, 2797.0], [62.5, 2807.0], [62.6, 2843.0], [62.7, 2856.0], [62.8, 2932.0], [62.9, 2945.0], [63.0, 2961.0], [63.1, 2993.0], [63.2, 3026.0], [63.3, 3050.0], [63.4, 3080.0], [63.5, 3094.0], [63.6, 3120.0], [63.7, 3142.0], [63.8, 3146.0], [63.9, 3159.0], [64.0, 3170.0], [64.1, 3180.0], [64.2, 3209.0], [64.3, 3296.0], [64.4, 3337.0], [64.5, 3359.0], [64.6, 3407.0], [64.7, 3428.0], [64.8, 3480.0], [64.9, 3542.0], [65.0, 3645.0], [65.1, 3707.0], [65.2, 3714.0], [65.3, 3725.0], [65.4, 3799.0], [65.5, 3834.0], [65.6, 3849.0], [65.7, 3889.0], [65.8, 3974.0], [65.9, 4008.0], [66.0, 4048.0], [66.1, 4115.0], [66.2, 4131.0], [66.3, 4170.0], [66.4, 4222.0], [66.5, 4241.0], [66.6, 4268.0], [66.7, 4301.0], [66.8, 4327.0], [66.9, 4364.0], [67.0, 4383.0], [67.1, 4396.0], [67.2, 4402.0], [67.3, 4438.0], [67.4, 4480.0], [67.5, 4552.0], [67.6, 4562.0], [67.7, 4579.0], [67.8, 4607.0], [67.9, 4622.0], [68.0, 4674.0], [68.1, 4699.0], [68.2, 4730.0], [68.3, 4758.0], [68.4, 4771.0], [68.5, 4809.0], [68.6, 4817.0], [68.7, 4847.0], [68.8, 4868.0], [68.9, 4879.0], [69.0, 4933.0], [69.1, 4936.0], [69.2, 4976.0], [69.3, 4979.0], [69.4, 4982.0], [69.5, 4991.0], [69.6, 5042.0], [69.7, 5065.0], [69.8, 5106.0], [69.9, 5190.0], [70.0, 5250.0], [70.1, 5287.0], [70.2, 5348.0], [70.3, 5382.0], [70.4, 5419.0], [70.5, 5436.0], [70.6, 5454.0], [70.7, 5465.0], [70.8, 5485.0], [70.9, 5532.0], [71.0, 5562.0], [71.1, 5570.0], [71.2, 5590.0], [71.3, 5606.0], [71.4, 5648.0], [71.5, 5655.0], [71.6, 5659.0], [71.7, 5665.0], [71.8, 5702.0], [71.9, 5716.0], [72.0, 5733.0], [72.1, 5758.0], [72.2, 5778.0], [72.3, 5793.0], [72.4, 5802.0], [72.5, 5857.0], [72.6, 5875.0], [72.7, 5897.0], [72.8, 5972.0], [72.9, 5997.0], [73.0, 6044.0], [73.1, 6052.0], [73.2, 6095.0], [73.3, 6102.0], [73.4, 6120.0], [73.5, 6146.0], [73.6, 6258.0], [73.7, 6282.0], [73.8, 6322.0], [73.9, 6329.0], [74.0, 6334.0], [74.1, 6335.0], [74.2, 6388.0], [74.3, 6429.0], [74.4, 6440.0], [74.5, 6443.0], [74.6, 6450.0], [74.7, 6462.0], [74.8, 6482.0], [74.9, 6486.0], [75.0, 6488.0], [75.1, 6505.0], [75.2, 6510.0], [75.3, 6517.0], [75.4, 6522.0], [75.5, 6523.0], [75.6, 6530.0], [75.7, 6538.0], [75.8, 6539.0], [75.9, 6543.0], [76.0, 6552.0], [76.1, 6565.0], [76.2, 6587.0], [76.3, 6623.0], [76.4, 6663.0], [76.5, 6683.0], [76.6, 6738.0], [76.7, 6746.0], [76.8, 6781.0], [76.9, 6818.0], [77.0, 6853.0], [77.1, 6865.0], [77.2, 6983.0], [77.3, 7072.0], [77.4, 7114.0], [77.5, 7156.0], [77.6, 7215.0], [77.7, 7248.0], [77.8, 7308.0], [77.9, 7357.0], [78.0, 7397.0], [78.1, 7416.0], [78.2, 7456.0], [78.3, 7474.0], [78.4, 7477.0], [78.5, 7477.0], [78.6, 7479.0], [78.7, 7481.0], [78.8, 7485.0], [78.9, 7494.0], [79.0, 7496.0], [79.1, 7531.0], [79.2, 7570.0], [79.3, 7596.0], [79.4, 7607.0], [79.5, 7663.0], [79.6, 7685.0], [79.7, 7716.0], [79.8, 7730.0], [79.9, 7757.0], [80.0, 7768.0], [80.1, 7793.0], [80.2, 7848.0], [80.3, 7877.0], [80.4, 7921.0], [80.5, 7977.0], [80.6, 7983.0], [80.7, 8000.0], [80.8, 8025.0], [80.9, 8073.0], [81.0, 8174.0], [81.1, 8195.0], [81.2, 8246.0], [81.3, 8306.0], [81.4, 8374.0], [81.5, 8403.0], [81.6, 8412.0], [81.7, 8440.0], [81.8, 8446.0], [81.9, 8565.0], [82.0, 8610.0], [82.1, 8653.0], [82.2, 8680.0], [82.3, 8704.0], [82.4, 8755.0], [82.5, 8817.0], [82.6, 8842.0], [82.7, 8890.0], [82.8, 8947.0], [82.9, 8949.0], [83.0, 8952.0], [83.1, 8983.0], [83.2, 9004.0], [83.3, 9059.0], [83.4, 9117.0], [83.5, 9123.0], [83.6, 9135.0], [83.7, 9142.0], [83.8, 9146.0], [83.9, 9158.0], [84.0, 9164.0], [84.1, 9171.0], [84.2, 9187.0], [84.3, 9198.0], [84.4, 9212.0], [84.5, 9231.0], [84.6, 9241.0], [84.7, 9279.0], [84.8, 9293.0], [84.9, 9310.0], [85.0, 9332.0], [85.1, 9346.0], [85.2, 9368.0], [85.3, 9383.0], [85.4, 9410.0], [85.5, 9425.0], [85.6, 9461.0], [85.7, 9488.0], [85.8, 9502.0], [85.9, 9504.0], [86.0, 9520.0], [86.1, 9550.0], [86.2, 9558.0], [86.3, 9602.0], [86.4, 9661.0], [86.5, 9681.0], [86.6, 9715.0], [86.7, 9753.0], [86.8, 9809.0], [86.9, 9837.0], [87.0, 9856.0], [87.1, 9860.0], [87.2, 9865.0], [87.3, 9874.0], [87.4, 9887.0], [87.5, 9908.0], [87.6, 9921.0], [87.7, 9935.0], [87.8, 9947.0], [87.9, 10003.0], [88.0, 10043.0], [88.1, 10053.0], [88.2, 10074.0], [88.3, 10105.0], [88.4, 10115.0], [88.5, 10127.0], [88.6, 10150.0], [88.7, 10174.0], [88.8, 10187.0], [88.9, 10190.0], [89.0, 10200.0], [89.1, 10216.0], [89.2, 10239.0], [89.3, 10259.0], [89.4, 10261.0], [89.5, 10278.0], [89.6, 10298.0], [89.7, 10309.0], [89.8, 10324.0], [89.9, 10330.0], [90.0, 10363.0], [90.1, 10405.0], [90.2, 10439.0], [90.3, 10493.0], [90.4, 10534.0], [90.5, 10581.0], [90.6, 10603.0], [90.7, 10629.0], [90.8, 10658.0], [90.9, 10682.0], [91.0, 10695.0], [91.1, 10703.0], [91.2, 10738.0], [91.3, 10761.0], [91.4, 10771.0], [91.5, 10776.0], [91.6, 10782.0], [91.7, 10831.0], [91.8, 10869.0], [91.9, 10895.0], [92.0, 10945.0], [92.1, 10994.0], [92.2, 11012.0], [92.3, 11063.0], [92.4, 11097.0], [92.5, 11118.0], [92.6, 11120.0], [92.7, 11144.0], [92.8, 11177.0], [92.9, 11196.0], [93.0, 11217.0], [93.1, 11252.0], [93.2, 11311.0], [93.3, 11324.0], [93.4, 11340.0], [93.5, 11352.0], [93.6, 11366.0], [93.7, 11382.0], [93.8, 11402.0], [93.9, 11437.0], [94.0, 11457.0], [94.1, 11470.0], [94.2, 11476.0], [94.3, 11484.0], [94.4, 11506.0], [94.5, 11512.0], [94.6, 11545.0], [94.7, 11562.0], [94.8, 11581.0], [94.9, 11590.0], [95.0, 11594.0], [95.1, 11631.0], [95.2, 11665.0], [95.3, 11678.0], [95.4, 11698.0], [95.5, 11713.0], [95.6, 11719.0], [95.7, 11767.0], [95.8, 11818.0], [95.9, 11835.0], [96.0, 11882.0], [96.1, 11885.0], [96.2, 11887.0], [96.3, 11889.0], [96.4, 11891.0], [96.5, 11894.0], [96.6, 11904.0], [96.7, 11909.0], [96.8, 11944.0], [96.9, 11965.0], [97.0, 12018.0], [97.1, 12068.0], [97.2, 12111.0], [97.3, 12126.0], [97.4, 12139.0], [97.5, 12178.0], [97.6, 12243.0], [97.7, 12280.0], [97.8, 12334.0], [97.9, 12463.0], [98.0, 12481.0], [98.1, 12546.0], [98.2, 12596.0], [98.3, 12622.0], [98.4, 12670.0], [98.5, 12720.0], [98.6, 12819.0], [98.7, 12850.0], [98.8, 12855.0], [98.9, 12869.0], [99.0, 12946.0], [99.1, 12963.0], [99.2, 13006.0], [99.3, 13046.0], [99.4, 13084.0], [99.5, 13094.0], [99.6, 13103.0], [99.7, 13167.0], [99.8, 13259.0], [99.9, 13354.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 1411.0, "series": [{"data": [[0.0, 1411.0], [100.0, 67.0], [200.0, 14.0], [300.0, 7.0], [400.0, 6.0], [500.0, 4.0], [600.0, 7.0], [700.0, 6.0], [800.0, 9.0], [900.0, 83.0], [1000.0, 68.0], [1100.0, 14.0], [1200.0, 20.0], [1300.0, 9.0], [1400.0, 13.0], [1500.0, 7.0], [1600.0, 16.0], [1700.0, 11.0], [1800.0, 14.0], [1900.0, 16.0], [2000.0, 9.0], [2100.0, 12.0], [2200.0, 9.0], [2300.0, 10.0], [2400.0, 11.0], [2500.0, 6.0], [2600.0, 6.0], [2700.0, 9.0], [2800.0, 9.0], [2900.0, 11.0], [3000.0, 12.0], [3100.0, 19.0], [3200.0, 5.0], [3300.0, 7.0], [3400.0, 8.0], [3500.0, 5.0], [3700.0, 10.0], [3600.0, 3.0], [3800.0, 9.0], [3900.0, 5.0], [4000.0, 5.0], [4100.0, 9.0], [4200.0, 10.0], [4300.0, 14.0], [4400.0, 8.0], [4500.0, 11.0], [4600.0, 11.0], [4700.0, 9.0], [4800.0, 15.0], [4900.0, 17.0], [5000.0, 8.0], [5100.0, 4.0], [5200.0, 6.0], [5300.0, 6.0], [5400.0, 16.0], [5500.0, 13.0], [5600.0, 14.0], [5700.0, 19.0], [5800.0, 10.0], [5900.0, 6.0], [6000.0, 10.0], [6100.0, 10.0], [6200.0, 4.0], [6300.0, 16.0], [6400.0, 25.0], [6500.0, 35.0], [6600.0, 8.0], [6700.0, 10.0], [6800.0, 9.0], [6900.0, 2.0], [7000.0, 5.0], [7100.0, 6.0], [7200.0, 5.0], [7400.0, 30.0], [7300.0, 8.0], [7600.0, 9.0], [7500.0, 9.0], [7700.0, 15.0], [7800.0, 8.0], [7900.0, 9.0], [8000.0, 8.0], [8100.0, 5.0], [8200.0, 5.0], [8300.0, 6.0], [8400.0, 11.0], [8600.0, 11.0], [8500.0, 2.0], [8700.0, 4.0], [8800.0, 10.0], [9100.0, 30.0], [8900.0, 13.0], [9000.0, 4.0], [9200.0, 17.0], [9300.0, 14.0], [9400.0, 13.0], [9500.0, 15.0], [9600.0, 8.0], [9700.0, 7.0], [9800.0, 20.0], [9900.0, 13.0], [10000.0, 11.0], [10100.0, 22.0], [10200.0, 19.0], [10300.0, 13.0], [10400.0, 8.0], [10500.0, 8.0], [10600.0, 14.0], [10700.0, 17.0], [10800.0, 9.0], [10900.0, 6.0], [11000.0, 10.0], [11100.0, 14.0], [11200.0, 7.0], [11300.0, 19.0], [11500.0, 20.0], [11400.0, 18.0], [11600.0, 11.0], [11700.0, 10.0], [11800.0, 23.0], [11900.0, 14.0], [12000.0, 6.0], [12100.0, 10.0], [12200.0, 8.0], [12300.0, 2.0], [12400.0, 6.0], [12500.0, 6.0], [12700.0, 5.0], [12600.0, 5.0], [12800.0, 12.0], [12900.0, 6.0], [13000.0, 10.0], [13100.0, 7.0], [13300.0, 4.0], [13200.0, 3.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 13300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 233.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1505.0, "series": [{"data": [[1.0, 233.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1505.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1262.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 290.346, "minX": 1.54958682E12, "maxY": 290.346, "series": [{"data": [[1.54958682E12, 290.346]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958682E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 17.2317880794702, "minX": 1.0, "maxY": 13111.0, "series": [{"data": [[2.0, 17.2317880794702], [3.0, 169.03703703703704], [4.0, 421.5], [5.0, 899.9333333333334], [6.0, 795.1176470588235], [7.0, 1323.3], [8.0, 1656.875], [9.0, 1908.2857142857144], [10.0, 2191.166666666667], [11.0, 1358.5], [12.0, 4371.666666666667], [13.0, 4370.333333333333], [14.0, 13094.0], [15.0, 2639.6], [16.0, 4359.0], [17.0, 13041.0], [18.0, 13053.0], [19.0, 13084.0], [20.0, 4362.0], [21.0, 6560.5], [22.0, 12996.0], [23.0, 13111.0], [24.0, 12985.0], [25.0, 13109.0], [26.0, 3299.25], [27.0, 6563.0], [28.0, 4451.333333333333], [29.0, 4415.666666666667], [30.0, 4353.666666666667], [31.0, 6490.0], [33.0, 12821.0], [32.0, 12835.0], [35.0, 4347.0], [34.0, 4345.0], [37.0, 6564.5], [36.0, 12855.0], [39.0, 3325.75], [38.0, 6479.0], [41.0, 4381.0], [40.0, 12850.0], [43.0, 3355.75], [42.0, 6480.0], [45.0, 3308.0], [44.0, 4324.666666666667], [47.0, 6407.0], [46.0, 4389.0], [49.0, 6359.0], [48.0, 3300.5], [51.0, 4317.0], [50.0, 4288.333333333333], [53.0, 3249.25], [52.0, 6430.5], [55.0, 6381.0], [54.0, 6424.0], [57.0, 6339.5], [56.0, 6330.0], [59.0, 6325.0], [58.0, 6375.5], [61.0, 6329.0], [60.0, 6322.5], [63.0, 4258.0], [62.0, 4246.0], [67.0, 6238.5], [66.0, 4169.0], [65.0, 6289.0], [64.0, 6253.0], [71.0, 6178.5], [69.0, 4195.333333333334], [70.0, 6259.5], [68.0, 12243.0], [75.0, 3146.5], [74.0, 4162.666666666666], [73.0, 6201.0], [72.0, 6191.0], [78.0, 4082.6666666666665], [79.0, 12233.0], [77.0, 12139.0], [76.0, 12137.0], [82.0, 4169.333333333334], [80.0, 4113.666666666666], [83.0, 12093.0], [81.0, 12171.0], [85.0, 6148.5], [87.0, 2527.6], [86.0, 12068.0], [84.0, 12111.0], [88.0, 1621.625], [91.0, 11915.0], [90.0, 12018.0], [89.0, 12032.0], [95.0, 11887.0], [94.0, 11882.0], [93.0, 11889.0], [92.0, 11893.0], [98.0, 4110.333333333334], [99.0, 6062.5], [97.0, 11903.0], [96.0, 11888.0], [100.0, 6050.5], [103.0, 11902.0], [102.0, 11904.0], [101.0, 11889.0], [107.0, 11968.0], [106.0, 11961.0], [105.0, 11944.0], [104.0, 11969.0], [111.0, 11891.0], [110.0, 11891.0], [109.0, 11952.0], [108.0, 11965.0], [115.0, 11885.0], [114.0, 11921.0], [113.0, 11908.0], [112.0, 11884.0], [119.0, 11858.0], [118.0, 11909.0], [117.0, 11887.0], [116.0, 11887.0], [123.0, 6042.0], [122.0, 11839.0], [121.0, 11894.0], [120.0, 11883.0], [124.0, 6036.0], [127.0, 11800.0], [126.0, 11835.0], [125.0, 11822.0], [135.0, 11711.0], [134.0, 11694.0], [133.0, 11713.0], [132.0, 11701.0], [131.0, 11719.0], [130.0, 11767.0], [129.0, 11783.0], [128.0, 11729.0], [136.0, 5981.5], [137.0, 5995.0], [143.0, 4111.333333333334], [142.0, 6004.0], [141.0, 11673.0], [140.0, 11713.0], [139.0, 11665.0], [138.0, 11684.0], [146.0, 4070.6666666666665], [145.0, 5943.5], [151.0, 11631.0], [150.0, 11617.0], [149.0, 11581.0], [148.0, 11562.0], [147.0, 11594.0], [144.0, 11636.0], [159.0, 11548.0], [158.0, 11590.0], [157.0, 11594.0], [156.0, 11582.0], [155.0, 11593.0], [154.0, 11759.0], [153.0, 11598.0], [152.0, 11551.0], [167.0, 11437.0], [166.0, 11476.0], [165.0, 11519.0], [164.0, 11512.0], [163.0, 11509.0], [162.0, 11484.0], [161.0, 11486.0], [160.0, 11580.0], [169.0, 6015.5], [175.0, 11457.0], [174.0, 11529.0], [173.0, 11508.0], [172.0, 11476.0], [171.0, 11474.0], [170.0, 11478.0], [168.0, 11437.0], [179.0, 5945.5], [183.0, 11366.0], [182.0, 11362.0], [181.0, 11488.0], [180.0, 11449.0], [178.0, 11484.0], [177.0, 11470.0], [176.0, 11466.0], [191.0, 5988.0], [190.0, 4110.0], [189.0, 11382.0], [188.0, 11455.0], [187.0, 11423.0], [186.0, 11399.0], [185.0, 11350.0], [184.0, 11545.0], [199.0, 11321.0], [198.0, 11368.0], [197.0, 11311.0], [196.0, 11324.0], [195.0, 11392.0], [194.0, 11340.0], [193.0, 11381.0], [192.0, 11336.0], [200.0, 5905.0], [207.0, 11319.0], [206.0, 11267.0], [205.0, 11252.0], [204.0, 11310.0], [203.0, 11354.0], [202.0, 11352.0], [201.0, 11335.0], [210.0, 5825.5], [215.0, 11230.0], [214.0, 11187.0], [213.0, 11166.0], [212.0, 11211.0], [211.0, 11217.0], [209.0, 11212.0], [208.0, 11242.0], [218.0, 5837.0], [223.0, 11120.0], [222.0, 11120.0], [221.0, 11097.0], [220.0, 11113.0], [219.0, 11129.0], [217.0, 11177.0], [216.0, 11181.0], [229.0, 5849.5], [231.0, 11005.0], [230.0, 11119.0], [228.0, 11084.0], [227.0, 11063.0], [226.0, 11097.0], [225.0, 11149.0], [224.0, 11144.0], [239.0, 10964.0], [238.0, 10994.0], [237.0, 11006.0], [236.0, 11012.0], [235.0, 11037.0], [234.0, 10983.0], [233.0, 11068.0], [232.0, 11040.0], [240.0, 5712.5], [241.0, 5732.0], [247.0, 10891.0], [246.0, 10851.0], [245.0, 10931.0], [244.0, 10945.0], [243.0, 10906.0], [242.0, 10866.0], [255.0, 10776.0], [254.0, 10782.0], [253.0, 10744.0], [252.0, 10831.0], [251.0, 10813.0], [250.0, 10778.0], [249.0, 10761.0], [248.0, 10895.0], [270.0, 10699.0], [271.0, 10681.0], [269.0, 10709.0], [268.0, 10661.0], [267.0, 10695.0], [266.0, 10767.0], [265.0, 10763.0], [264.0, 10738.0], [263.0, 10774.0], [257.0, 10782.0], [256.0, 10821.0], [259.0, 10703.0], [258.0, 10703.0], [262.0, 10771.0], [261.0, 10776.0], [260.0, 10729.0], [287.0, 10582.0], [279.0, 5658.5], [278.0, 3990.3333333333335], [277.0, 10682.0], [276.0, 10683.0], [281.0, 5621.0], [280.0, 10658.0], [286.0, 10592.0], [285.0, 10581.0], [284.0, 10527.0], [275.0, 10649.0], [274.0, 10629.0], [273.0, 10683.0], [272.0, 10753.0], [283.0, 10556.0], [282.0, 10611.0], [302.0, 10439.0], [292.0, 5586.5], [294.0, 10433.0], [293.0, 10419.0], [295.0, 5533.0], [303.0, 10449.0], [301.0, 10298.0], [300.0, 10401.0], [291.0, 10493.0], [290.0, 10534.0], [289.0, 10517.0], [288.0, 10557.0], [299.0, 10309.0], [298.0, 10309.0], [297.0, 10324.0], [296.0, 10330.0], [317.0, 10260.0], [304.0, 5485.5], [305.0, 5491.5], [306.0, 10362.0], [310.0, 5522.5], [309.0, 10329.0], [308.0, 10375.0], [311.0, 10363.0], [315.0, 5501.5], [319.0, 10278.0], [318.0, 10273.0], [316.0, 10259.0], [307.0, 10347.0], [314.0, 10255.0], [313.0, 10263.0], [312.0, 10322.0], [333.0, 5542.0], [330.0, 5479.5], [331.0, 5495.5], [332.0, 5569.0], [323.0, 10190.0], [322.0, 10210.0], [321.0, 10259.0], [320.0, 10282.0], [334.0, 5476.5], [335.0, 10196.0], [329.0, 10227.5], [327.0, 10189.0], [326.0, 10211.0], [325.0, 10187.0], [324.0, 10229.0], [350.0, 10053.0], [337.0, 5510.0], [341.0, 5497.0], [340.0, 10099.0], [343.0, 10133.0], [336.0, 10183.0], [342.0, 10103.0], [351.0, 10109.0], [349.0, 10109.0], [348.0, 10051.0], [339.0, 10189.0], [338.0, 10181.0], [347.0, 10057.0], [346.0, 10149.0], [345.0, 10174.0], [344.0, 10162.0], [367.0, 9925.0], [352.0, 823.0], [359.0, 10043.0], [358.0, 10043.0], [357.0, 10120.0], [356.0, 10119.0], [362.0, 5414.5], [366.0, 9926.0], [365.0, 9920.0], [364.0, 10005.0], [355.0, 10045.0], [354.0, 10150.0], [353.0, 10089.0], [363.0, 10003.0], [361.0, 10074.0], [360.0, 10115.0], [382.0, 9889.0], [383.0, 9856.0], [381.0, 9872.0], [380.0, 9885.0], [379.0, 9938.0], [378.0, 9878.0], [377.0, 9908.0], [376.0, 9918.0], [375.0, 9856.0], [369.0, 9935.0], [368.0, 9921.0], [371.0, 9859.0], [370.0, 9867.0], [374.0, 9865.0], [373.0, 9860.0], [372.0, 9860.0], [398.0, 9776.0], [386.0, 3161.75], [385.0, 5385.5], [384.0, 9901.0], [391.0, 9809.0], [390.0, 9874.0], [389.0, 9949.0], [388.0, 9947.0], [399.0, 9750.0], [397.0, 9831.0], [396.0, 9762.0], [387.0, 9865.0], [395.0, 9832.0], [394.0, 9847.0], [393.0, 9837.0], [392.0, 9838.0], [415.0, 9564.0], [405.0, 5335.5], [404.0, 9701.0], [406.0, 9639.0], [409.0, 3847.6666666666665], [414.0, 9602.0], [413.0, 9557.0], [412.0, 9558.0], [403.0, 9715.0], [402.0, 9699.0], [401.0, 9675.0], [400.0, 9753.0], [407.0, 9661.0], [411.0, 9557.0], [410.0, 9681.0], [408.0, 9627.0], [430.0, 2047.75], [431.0, 1695.4166666666667], [429.0, 1563.6875], [428.0, 2235.5714285714284], [427.0, 2065.5], [426.0, 9538.0], [425.0, 9525.0], [424.0, 9517.0], [423.0, 9461.0], [417.0, 9483.0], [416.0, 9578.0], [419.0, 9503.0], [418.0, 9488.0], [422.0, 9502.0], [421.0, 9504.0], [420.0, 9507.0], [445.0, 2395.0], [432.0, 2023.875], [435.0, 1862.3000000000002], [434.0, 3818.666666666667], [433.0, 979.5], [438.0, 1647.6923076923078], [439.0, 3760.0], [437.0, 1799.0], [436.0, 3098.75], [441.0, 2201.5714285714284], [443.0, 2420.1666666666665], [442.0, 2669.0], [446.0, 3816.6666666666665], [447.0, 2693.6], [440.0, 2701.6], [444.0, 3843.0], [449.0, 3104.25], [453.0, 3060.75], [452.0, 1869.6000000000001], [454.0, 3096.0], [456.0, 5104.5], [457.0, 9194.0], [459.0, 9212.0], [458.0, 9248.0], [463.0, 9170.0], [462.0, 9221.0], [461.0, 9171.0], [460.0, 9206.0], [455.0, 5155.0], [451.0, 2693.0], [450.0, 2687.0], [448.0, 5142.0], [478.0, 5166.0], [464.0, 5228.5], [465.0, 5192.0], [467.0, 9279.0], [466.0, 9198.0], [477.0, 9131.0], [476.0, 9138.0], [468.0, 5189.5], [469.0, 9293.0], [470.0, 5186.5], [471.0, 5106.5], [473.0, 5187.0], [475.0, 5168.5], [474.0, 9231.0], [479.0, 5115.0], [472.0, 9215.0], [495.0, 9046.0], [491.0, 5145.5], [494.0, 9059.0], [493.0, 9121.0], [492.0, 9131.0], [483.0, 9195.0], [482.0, 9166.0], [481.0, 9161.0], [480.0, 9135.0], [490.0, 9119.0], [489.0, 9112.0], [488.0, 9109.0], [487.0, 9142.0], [486.0, 9187.0], [485.0, 9164.0], [484.0, 9146.0], [510.0, 8949.0], [511.0, 8971.0], [509.0, 8971.0], [508.0, 8950.0], [507.0, 9182.0], [506.0, 8986.0], [505.0, 8947.0], [504.0, 8948.0], [503.0, 8951.0], [497.0, 9503.0], [496.0, 9464.0], [499.0, 9015.0], [498.0, 9499.0], [502.0, 8948.0], [501.0, 8952.0], [500.0, 9004.0], [517.0, 5181.5], [540.0, 4980.0], [518.0, 5265.5], [519.0, 8870.0], [537.0, 8604.0], [536.0, 8605.0], [539.0, 8680.0], [538.0, 8643.0], [524.0, 5037.5], [523.0, 8801.0], [522.0, 8817.0], [521.0, 8863.0], [520.0, 8890.0], [525.0, 8838.0], [527.0, 8832.0], [512.0, 8988.0], [514.0, 9143.0], [513.0, 8983.0], [516.0, 8908.0], [515.0, 8893.0], [526.0, 8801.0], [529.0, 3747.3333333333335], [533.0, 3741.0], [535.0, 8670.0], [534.0, 8653.0], [532.0, 4992.5], [531.0, 8694.0], [530.0, 8690.0], [543.0, 3087.75], [528.0, 8755.0], [542.0, 8565.0], [541.0, 8623.0], [572.0, 8078.0], [547.0, 3737.6666666666665], [546.0, 8446.0], [545.0, 8445.0], [544.0, 8445.0], [559.0, 8374.0], [558.0, 8355.0], [557.0, 8393.0], [556.0, 8403.0], [555.0, 8406.0], [554.0, 8410.0], [553.0, 8412.0], [552.0, 8395.0], [548.0, 4857.0], [573.0, 4875.5], [574.0, 3100.5], [575.0, 4683.0], [561.0, 8306.0], [560.0, 8327.0], [563.0, 8246.0], [562.0, 8294.0], [565.0, 8259.0], [564.0, 8236.0], [567.0, 8183.0], [566.0, 8228.0], [571.0, 8195.0], [570.0, 8174.0], [569.0, 8135.0], [568.0, 8174.0], [551.0, 8462.0], [550.0, 8440.0], [549.0, 8422.0], [603.0, 4597.0], [577.0, 4685.0], [580.0, 3008.25], [579.0, 7980.0], [578.0, 7977.0], [582.0, 7998.0], [581.0, 7984.0], [600.0, 7793.0], [583.0, 7979.0], [585.0, 4711.5], [584.0, 8000.0], [587.0, 7935.0], [586.0, 7924.0], [589.0, 7888.0], [588.0, 7891.0], [591.0, 7921.0], [576.0, 8026.0], [590.0, 7877.0], [607.0, 7713.0], [593.0, 7848.0], [592.0, 7863.0], [595.0, 7791.0], [594.0, 7836.0], [597.0, 7768.0], [596.0, 7790.0], [599.0, 7757.0], [598.0, 7852.0], [606.0, 7716.0], [605.0, 7728.0], [604.0, 7726.0], [602.0, 7837.0], [601.0, 7764.0], [634.0, 4473.5], [610.0, 4584.0], [609.0, 7679.0], [608.0, 7685.0], [612.0, 7757.0], [611.0, 7759.0], [614.0, 7653.0], [613.0, 7671.0], [623.0, 7604.0], [622.0, 7570.0], [621.0, 7531.0], [620.0, 7572.0], [619.0, 7547.0], [618.0, 7549.0], [617.0, 7663.0], [616.0, 7660.0], [615.0, 4535.0], [625.0, 3728.666666666667], [624.0, 7596.0], [626.0, 2986.5], [628.0, 2977.0], [627.0, 7481.0], [629.0, 3465.666666666667], [631.0, 7477.0], [630.0, 7479.0], [633.0, 4471.5], [632.0, 7481.0], [639.0, 4500.0], [638.0, 4489.5], [637.0, 7487.0], [636.0, 7477.0], [635.0, 7482.0], [668.0, 7253.0], [649.0, 4492.0], [648.0, 7706.0], [650.0, 7416.0], [651.0, 4459.0], [671.0, 4395.0], [657.0, 7353.0], [656.0, 7387.0], [659.0, 7456.0], [658.0, 7357.0], [661.0, 7454.0], [660.0, 7350.0], [663.0, 7397.0], [662.0, 7360.0], [670.0, 7248.0], [669.0, 7245.0], [667.0, 7477.0], [666.0, 7306.0], [665.0, 7496.0], [664.0, 7308.0], [655.0, 7473.0], [641.0, 7465.0], [640.0, 7495.0], [643.0, 7475.0], [642.0, 7479.0], [645.0, 7477.0], [644.0, 7495.0], [647.0, 7501.0], [646.0, 7494.0], [654.0, 7607.0], [653.0, 7413.0], [652.0, 7453.0], [697.0, 6743.0], [701.0, 4200.0], [676.0, 4391.5], [677.0, 4370.0], [678.0, 7099.0], [696.0, 6746.0], [679.0, 7114.0], [698.0, 6738.0], [700.0, 6683.0], [699.0, 6732.0], [684.0, 4420.5], [683.0, 7041.0], [682.0, 7072.0], [681.0, 7056.0], [680.0, 7072.0], [685.0, 6951.0], [687.0, 6818.0], [673.0, 7185.0], [672.0, 7215.0], [675.0, 7159.0], [674.0, 7125.0], [686.0, 6889.0], [688.0, 4245.5], [693.0, 4208.5], [692.0, 6850.0], [691.0, 6853.0], [690.0, 6853.0], [689.0, 6835.0], [695.0, 4206.0], [694.0, 6855.0], [703.0, 6647.0], [702.0, 6664.0], [730.0, 6483.0], [734.0, 3072.0], [726.0, 4115.0], [727.0, 6484.0], [725.0, 3280.0], [728.0, 4089.5], [719.0, 6540.0], [705.0, 6746.0], [704.0, 6746.0], [707.0, 6663.0], [706.0, 6750.0], [709.0, 6490.0], [708.0, 6530.0], [711.0, 6623.0], [710.0, 6488.0], [718.0, 6539.0], [717.0, 6538.0], [716.0, 6542.0], [715.0, 6605.0], [714.0, 6663.0], [713.0, 6543.0], [712.0, 6522.0], [729.0, 6488.0], [735.0, 4105.5], [720.0, 6545.0], [722.0, 6538.0], [721.0, 6538.0], [724.0, 6488.0], [723.0, 6539.0], [733.0, 6481.0], [732.0, 6523.0], [731.0, 6487.0], [764.0, 6510.0], [739.0, 2887.25], [737.0, 4093.0], [738.0, 6523.0], [740.0, 4118.0], [741.0, 4127.0], [748.0, 4099.0], [747.0, 6581.0], [745.0, 6514.0], [744.0, 6470.0], [749.0, 6459.0], [750.0, 4099.5], [751.0, 3343.333333333333], [736.0, 6521.0], [767.0, 6393.0], [753.0, 6506.0], [752.0, 6580.0], [755.0, 6628.0], [754.0, 6587.0], [757.0, 6706.0], [756.0, 6586.0], [759.0, 6547.0], [758.0, 6554.0], [766.0, 6450.0], [765.0, 6512.0], [763.0, 6442.0], [762.0, 6440.0], [761.0, 6440.0], [760.0, 6447.0], [743.0, 6552.0], [742.0, 6523.0], [794.0, 6120.0], [798.0, 3990.5], [770.0, 4044.0], [783.0, 3309.0], [769.0, 6403.0], [768.0, 6482.0], [784.0, 2967.0], [785.0, 4032.5], [787.0, 6443.0], [786.0, 6329.0], [789.0, 6430.0], [788.0, 6431.0], [791.0, 6272.0], [790.0, 6279.0], [782.0, 2583.1666666666665], [781.0, 6429.0], [780.0, 6334.0], [779.0, 6327.0], [778.0, 6388.0], [777.0, 6346.0], [776.0, 6335.0], [797.0, 4002.0], [799.0, 6143.0], [796.0, 6119.0], [795.0, 6114.0], [793.0, 6258.0], [792.0, 6199.0], [775.0, 6334.0], [774.0, 6334.0], [773.0, 6326.0], [772.0, 6321.0], [771.0, 6318.0], [829.0, 5864.0], [814.0, 3960.0], [813.0, 5997.0], [812.0, 5987.0], [811.0, 5983.0], [810.0, 6014.0], [809.0, 6061.0], [808.0, 6095.0], [815.0, 6087.0], [801.0, 6096.0], [800.0, 6142.0], [803.0, 6044.0], [802.0, 6102.0], [805.0, 6102.0], [804.0, 6049.0], [807.0, 6046.0], [806.0, 6052.0], [816.0, 3943.5], [817.0, 5972.0], [819.0, 5857.0], [818.0, 5875.0], [821.0, 5907.0], [820.0, 5857.0], [823.0, 5848.0], [822.0, 5796.0], [824.0, 3893.5], [831.0, 3221.0], [830.0, 5876.0], [828.0, 5826.0], [826.0, 5773.0], [825.0, 5877.0], [861.0, 5570.0], [838.0, 3884.0], [847.0, 5662.0], [833.0, 5765.0], [832.0, 5740.0], [835.0, 5702.0], [834.0, 5702.0], [837.0, 5802.0], [836.0, 5733.0], [846.0, 5659.0], [845.0, 5654.0], [844.0, 5648.0], [843.0, 5795.0], [842.0, 5647.0], [841.0, 5655.0], [840.0, 5655.0], [856.0, 5720.0], [839.0, 5793.0], [848.0, 3237.0], [849.0, 5658.0], [851.0, 5711.0], [850.0, 5781.0], [853.0, 5712.0], [852.0, 5758.0], [855.0, 5666.0], [854.0, 5657.0], [857.0, 3839.0], [863.0, 5616.0], [862.0, 5592.0], [860.0, 5576.0], [859.0, 5566.0], [858.0, 5562.0], [892.0, 3726.5], [868.0, 2580.1666666666665], [869.0, 3193.333333333333], [871.0, 5534.0], [870.0, 5570.0], [889.0, 5354.0], [888.0, 5447.0], [891.0, 5407.0], [890.0, 5419.0], [874.0, 2027.0], [873.0, 5454.0], [872.0, 5536.0], [875.0, 5464.0], [876.0, 3747.5], [878.0, 3734.0], [877.0, 5491.0], [879.0, 3171.0], [865.0, 5661.0], [864.0, 5665.0], [867.0, 5606.0], [866.0, 5596.0], [881.0, 2080.0], [880.0, 5532.0], [883.0, 5423.0], [882.0, 5481.5], [885.0, 5382.0], [884.0, 5428.0], [887.0, 5439.0], [886.0, 5436.0], [895.0, 5329.0], [894.0, 5381.0], [893.0, 5348.0], [924.0, 4985.0], [899.0, 3666.0], [900.0, 3695.5], [901.0, 5278.0], [903.0, 5214.0], [902.0, 5190.0], [921.0, 4982.0], [920.0, 4977.0], [910.0, 3564.0], [909.0, 5065.0], [908.0, 5080.0], [907.0, 5140.0], [906.0, 5106.0], [905.0, 5070.0], [904.0, 5145.0], [911.0, 5046.0], [896.0, 5332.0], [898.0, 5250.0], [897.0, 5254.0], [915.0, 3538.0], [919.0, 4956.0], [918.0, 5020.0], [917.0, 4980.0], [916.0, 4979.0], [926.0, 3070.3333333333335], [927.0, 3574.5], [912.0, 5042.0], [914.0, 4980.0], [913.0, 5053.0], [925.0, 4936.0], [923.0, 4991.0], [922.0, 4986.0], [956.0, 4730.0], [935.0, 3491.0], [943.0, 4840.0], [934.0, 4813.0], [933.0, 4933.0], [932.0, 4935.0], [931.0, 4888.0], [930.0, 4875.0], [929.0, 4914.0], [928.0, 4953.0], [942.0, 4847.0], [953.0, 4708.5], [937.0, 3493.5], [936.0, 4816.0], [938.0, 4879.0], [940.0, 4878.0], [939.0, 4859.0], [941.0, 3469.5], [959.0, 4699.0], [945.0, 4838.0], [944.0, 4864.0], [947.0, 4758.0], [946.0, 4806.0], [949.0, 4771.0], [948.0, 4758.0], [951.0, 4759.0], [950.0, 4784.0], [958.0, 4734.0], [957.0, 4719.0], [955.0, 4677.0], [954.0, 4674.0], [987.0, 4402.0], [966.0, 2848.0], [970.0, 3390.5], [971.0, 2843.5], [969.0, 3379.0], [968.0, 3374.5], [967.0, 3022.3333333333335], [984.0, 4398.0], [986.0, 4386.0], [985.0, 4438.0], [988.0, 4401.0], [972.0, 3434.5], [975.0, 4520.0], [961.0, 4579.0], [960.0, 4699.0], [963.0, 4575.0], [962.0, 4575.0], [965.0, 4607.0], [964.0, 4598.0], [974.0, 4615.0], [973.0, 4619.0], [989.0, 3339.5], [991.0, 4383.0], [983.0, 4409.0], [982.0, 4396.0], [981.0, 4389.0], [980.0, 4461.0], [979.0, 4480.0], [978.0, 4510.0], [977.0, 4474.0], [976.0, 4562.0], [990.0, 4331.0], [1018.0, 3262.5], [997.0, 3291.0], [996.0, 4273.0], [995.0, 4317.0], [994.0, 4317.0], [993.0, 4331.0], [992.0, 4327.0], [1007.0, 4241.0], [1006.0, 4257.0], [1005.0, 4241.0], [1004.0, 4222.0], [1003.0, 4364.0], [1002.0, 4364.0], [1001.0, 4268.0], [1000.0, 4262.0], [998.0, 3369.0], [1009.0, 3274.0], [1008.0, 4301.0], [1010.0, 2977.3333333333335], [1011.0, 3261.0], [1013.0, 4120.0], [1012.0, 4204.0], [1015.0, 4126.0], [1014.0, 4115.0], [1017.0, 3239.0], [1016.0, 4095.0], [999.0, 4268.0], [1021.0, 3198.5], [1020.0, 4048.0], [1019.0, 4163.0], [1022.0, 3974.0], [1023.0, 4022.0], [1034.0, 2880.6666666666665], [1038.0, 3783.0], [1084.0, 2736.6666666666665], [1074.0, 2817.5], [1032.0, 3844.0], [1030.0, 3887.0], [1028.0, 3985.0], [1026.0, 3970.0], [1024.0, 3951.0], [1036.0, 3849.0], [1054.0, 3531.0], [1052.0, 3542.0], [1050.0, 3711.0], [1072.0, 3180.0], [1040.0, 3714.0], [1042.0, 3838.0], [1044.0, 3809.0], [1046.0, 3716.0], [1048.0, 3044.5], [1060.0, 3355.0], [1062.0, 3419.0], [1064.0, 3411.0], [1066.0, 2921.0], [1070.0, 3310.0], [1068.0, 3296.0], [1082.0, 2830.0], [1080.0, 3145.0], [1078.0, 3173.0], [1076.0, 3146.0], [1056.0, 3462.0], [1058.0, 3428.0], [1086.0, 3220.0], [1090.0, 3160.0], [1104.0, 3023.0], [1106.0, 3050.0], [1108.0, 2978.0], [1110.0, 2742.0], [1112.0, 2920.0], [1114.0, 2945.0], [1088.0, 3091.0], [1092.0, 3129.0], [1094.0, 3106.0], [1118.0, 2856.0], [1116.0, 2956.0], [1120.0, 2722.0], [1136.0, 2654.0], [1102.0, 3067.0], [1100.0, 3091.0], [1098.0, 3026.0], [1096.0, 3120.0], [1122.0, 2711.0], [1124.0, 2849.0], [1126.0, 2846.0], [1128.0, 2769.0], [1130.0, 2723.0], [1132.0, 2715.0], [1134.0, 2731.0], [1031.0, 3834.0], [1033.0, 3799.0], [1029.0, 3889.0], [1027.0, 3976.0], [1025.0, 4015.0], [1035.0, 3805.0], [1037.0, 3860.0], [1039.0, 3714.0], [1055.0, 3518.0], [1053.0, 3544.0], [1051.0, 3544.0], [1049.0, 3661.0], [1073.0, 3154.0], [1041.0, 3079.0], [1043.0, 3707.0], [1045.0, 3725.0], [1047.0, 3645.0], [1059.0, 2948.0], [1061.0, 2925.5], [1063.0, 3407.0], [1065.0, 3454.0], [1071.0, 3310.0], [1069.0, 3337.0], [1067.0, 3354.0], [1081.0, 3159.0], [1079.0, 3205.0], [1077.0, 3143.0], [1075.0, 3173.0], [1083.0, 3159.0], [1087.0, 3231.0], [1057.0, 3480.0], [1085.0, 3190.0], [1089.0, 3142.0], [1121.0, 2723.0], [1115.0, 2761.0], [1095.0, 2798.5], [1105.0, 2795.5], [1107.0, 3080.0], [1109.0, 2968.0], [1111.0, 2703.3333333333335], [1113.0, 2946.0], [1119.0, 2713.6666666666665], [1091.0, 3138.0], [1093.0, 3094.0], [1117.0, 2961.0], [1103.0, 2993.0], [1101.0, 3058.0], [1099.0, 3030.0], [1097.0, 3026.0], [1123.0, 2826.0], [1125.0, 2843.0], [1127.0, 2797.0], [1129.0, 2799.0], [1131.0, 2719.0], [1133.0, 2711.0], [1135.0, 2725.0], [1.0, 47.31543624161074]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[290.346, 3236.0743333333344]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1136.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 18900.0, "minX": 1.54958682E12, "maxY": 18950.0, "series": [{"data": [[1.54958682E12, 18950.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958682E12, 18900.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958682E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3236.0743333333344, "minX": 1.54958682E12, "maxY": 3236.0743333333344, "series": [{"data": [[1.54958682E12, 3236.0743333333344]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958682E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3236.0643333333333, "minX": 1.54958682E12, "maxY": 3236.0643333333333, "series": [{"data": [[1.54958682E12, 3236.0643333333333]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958682E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 3.2713333333333345, "minX": 1.54958682E12, "maxY": 3.2713333333333345, "series": [{"data": [[1.54958682E12, 3.2713333333333345]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958682E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.54958682E12, "maxY": 13363.0, "series": [{"data": [[1.54958682E12, 13363.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958682E12, 1.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958682E12, 10362.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958682E12, 12945.51999999999]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958682E12, 11594.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958682E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 435.0, "minX": 50.0, "maxY": 435.0, "series": [{"data": [[50.0, 435.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 435.0, "minX": 50.0, "maxY": 435.0, "series": [{"data": [[50.0, 435.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958682E12, "maxY": 50.0, "series": [{"data": [[1.54958682E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958682E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958682E12, "maxY": 50.0, "series": [{"data": [[1.54958682E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958682E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958682E12, "maxY": 50.0, "series": [{"data": [[1.54958682E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958682E12, "title": "Transactions Per Second"}},
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
