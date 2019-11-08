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
        data: {"result": {"minY": 29.0, "minX": 0.0, "maxY": 1536.0, "series": [{"data": [[0.0, 29.0], [0.1, 31.0], [0.2, 32.0], [0.3, 32.0], [0.4, 32.0], [0.5, 32.0], [0.6, 32.0], [0.7, 32.0], [0.8, 32.0], [0.9, 32.0], [1.0, 32.0], [1.1, 33.0], [1.2, 33.0], [1.3, 33.0], [1.4, 33.0], [1.5, 33.0], [1.6, 33.0], [1.7, 33.0], [1.8, 33.0], [1.9, 33.0], [2.0, 33.0], [2.1, 33.0], [2.2, 33.0], [2.3, 34.0], [2.4, 34.0], [2.5, 34.0], [2.6, 34.0], [2.7, 34.0], [2.8, 34.0], [2.9, 34.0], [3.0, 34.0], [3.1, 34.0], [3.2, 34.0], [3.3, 34.0], [3.4, 34.0], [3.5, 34.0], [3.6, 34.0], [3.7, 34.0], [3.8, 34.0], [3.9, 34.0], [4.0, 34.0], [4.1, 34.0], [4.2, 34.0], [4.3, 34.0], [4.4, 34.0], [4.5, 34.0], [4.6, 34.0], [4.7, 34.0], [4.8, 34.0], [4.9, 34.0], [5.0, 34.0], [5.1, 34.0], [5.2, 34.0], [5.3, 34.0], [5.4, 34.0], [5.5, 34.0], [5.6, 34.0], [5.7, 34.0], [5.8, 34.0], [5.9, 34.0], [6.0, 34.0], [6.1, 34.0], [6.2, 34.0], [6.3, 34.0], [6.4, 34.0], [6.5, 34.0], [6.6, 34.0], [6.7, 34.0], [6.8, 34.0], [6.9, 34.0], [7.0, 34.0], [7.1, 34.0], [7.2, 34.0], [7.3, 35.0], [7.4, 35.0], [7.5, 35.0], [7.6, 35.0], [7.7, 35.0], [7.8, 35.0], [7.9, 35.0], [8.0, 35.0], [8.1, 35.0], [8.2, 35.0], [8.3, 35.0], [8.4, 35.0], [8.5, 35.0], [8.6, 35.0], [8.7, 35.0], [8.8, 35.0], [8.9, 35.0], [9.0, 35.0], [9.1, 35.0], [9.2, 35.0], [9.3, 35.0], [9.4, 35.0], [9.5, 35.0], [9.6, 35.0], [9.7, 35.0], [9.8, 35.0], [9.9, 35.0], [10.0, 35.0], [10.1, 35.0], [10.2, 35.0], [10.3, 35.0], [10.4, 35.0], [10.5, 35.0], [10.6, 35.0], [10.7, 35.0], [10.8, 35.0], [10.9, 35.0], [11.0, 35.0], [11.1, 35.0], [11.2, 35.0], [11.3, 35.0], [11.4, 35.0], [11.5, 35.0], [11.6, 35.0], [11.7, 35.0], [11.8, 35.0], [11.9, 35.0], [12.0, 35.0], [12.1, 35.0], [12.2, 35.0], [12.3, 35.0], [12.4, 35.0], [12.5, 35.0], [12.6, 35.0], [12.7, 35.0], [12.8, 35.0], [12.9, 35.0], [13.0, 35.0], [13.1, 35.0], [13.2, 35.0], [13.3, 35.0], [13.4, 35.0], [13.5, 35.0], [13.6, 35.0], [13.7, 35.0], [13.8, 35.0], [13.9, 35.0], [14.0, 35.0], [14.1, 35.0], [14.2, 35.0], [14.3, 36.0], [14.4, 36.0], [14.5, 36.0], [14.6, 36.0], [14.7, 36.0], [14.8, 36.0], [14.9, 36.0], [15.0, 36.0], [15.1, 36.0], [15.2, 36.0], [15.3, 36.0], [15.4, 36.0], [15.5, 36.0], [15.6, 36.0], [15.7, 36.0], [15.8, 36.0], [15.9, 36.0], [16.0, 36.0], [16.1, 36.0], [16.2, 36.0], [16.3, 36.0], [16.4, 36.0], [16.5, 36.0], [16.6, 36.0], [16.7, 36.0], [16.8, 36.0], [16.9, 36.0], [17.0, 36.0], [17.1, 36.0], [17.2, 36.0], [17.3, 36.0], [17.4, 36.0], [17.5, 36.0], [17.6, 36.0], [17.7, 36.0], [17.8, 36.0], [17.9, 36.0], [18.0, 36.0], [18.1, 36.0], [18.2, 36.0], [18.3, 36.0], [18.4, 36.0], [18.5, 36.0], [18.6, 36.0], [18.7, 36.0], [18.8, 36.0], [18.9, 36.0], [19.0, 36.0], [19.1, 36.0], [19.2, 36.0], [19.3, 36.0], [19.4, 36.0], [19.5, 36.0], [19.6, 36.0], [19.7, 36.0], [19.8, 36.0], [19.9, 36.0], [20.0, 36.0], [20.1, 36.0], [20.2, 36.0], [20.3, 36.0], [20.4, 36.0], [20.5, 36.0], [20.6, 36.0], [20.7, 36.0], [20.8, 36.0], [20.9, 36.0], [21.0, 36.0], [21.1, 36.0], [21.2, 36.0], [21.3, 36.0], [21.4, 36.0], [21.5, 36.0], [21.6, 36.0], [21.7, 36.0], [21.8, 36.0], [21.9, 36.0], [22.0, 36.0], [22.1, 36.0], [22.2, 36.0], [22.3, 36.0], [22.4, 36.0], [22.5, 36.0], [22.6, 36.0], [22.7, 36.0], [22.8, 36.0], [22.9, 36.0], [23.0, 36.0], [23.1, 36.0], [23.2, 36.0], [23.3, 36.0], [23.4, 36.0], [23.5, 36.0], [23.6, 36.0], [23.7, 36.0], [23.8, 36.0], [23.9, 36.0], [24.0, 36.0], [24.1, 36.0], [24.2, 36.0], [24.3, 36.0], [24.4, 36.0], [24.5, 36.0], [24.6, 36.0], [24.7, 36.0], [24.8, 37.0], [24.9, 37.0], [25.0, 37.0], [25.1, 37.0], [25.2, 37.0], [25.3, 37.0], [25.4, 37.0], [25.5, 37.0], [25.6, 37.0], [25.7, 37.0], [25.8, 37.0], [25.9, 37.0], [26.0, 37.0], [26.1, 37.0], [26.2, 37.0], [26.3, 37.0], [26.4, 37.0], [26.5, 37.0], [26.6, 37.0], [26.7, 37.0], [26.8, 37.0], [26.9, 37.0], [27.0, 37.0], [27.1, 37.0], [27.2, 37.0], [27.3, 37.0], [27.4, 37.0], [27.5, 37.0], [27.6, 37.0], [27.7, 37.0], [27.8, 37.0], [27.9, 37.0], [28.0, 37.0], [28.1, 37.0], [28.2, 37.0], [28.3, 37.0], [28.4, 37.0], [28.5, 37.0], [28.6, 37.0], [28.7, 37.0], [28.8, 37.0], [28.9, 37.0], [29.0, 37.0], [29.1, 37.0], [29.2, 37.0], [29.3, 37.0], [29.4, 37.0], [29.5, 37.0], [29.6, 37.0], [29.7, 37.0], [29.8, 37.0], [29.9, 37.0], [30.0, 37.0], [30.1, 37.0], [30.2, 37.0], [30.3, 37.0], [30.4, 37.0], [30.5, 37.0], [30.6, 37.0], [30.7, 37.0], [30.8, 37.0], [30.9, 37.0], [31.0, 37.0], [31.1, 37.0], [31.2, 37.0], [31.3, 37.0], [31.4, 37.0], [31.5, 37.0], [31.6, 37.0], [31.7, 37.0], [31.8, 37.0], [31.9, 37.0], [32.0, 38.0], [32.1, 38.0], [32.2, 38.0], [32.3, 38.0], [32.4, 38.0], [32.5, 38.0], [32.6, 38.0], [32.7, 38.0], [32.8, 38.0], [32.9, 38.0], [33.0, 38.0], [33.1, 38.0], [33.2, 38.0], [33.3, 38.0], [33.4, 38.0], [33.5, 38.0], [33.6, 38.0], [33.7, 38.0], [33.8, 38.0], [33.9, 38.0], [34.0, 38.0], [34.1, 38.0], [34.2, 38.0], [34.3, 38.0], [34.4, 38.0], [34.5, 38.0], [34.6, 38.0], [34.7, 38.0], [34.8, 38.0], [34.9, 38.0], [35.0, 38.0], [35.1, 38.0], [35.2, 38.0], [35.3, 38.0], [35.4, 38.0], [35.5, 38.0], [35.6, 38.0], [35.7, 38.0], [35.8, 38.0], [35.9, 38.0], [36.0, 38.0], [36.1, 38.0], [36.2, 38.0], [36.3, 38.0], [36.4, 38.0], [36.5, 38.0], [36.6, 38.0], [36.7, 38.0], [36.8, 38.0], [36.9, 38.0], [37.0, 38.0], [37.1, 38.0], [37.2, 38.0], [37.3, 38.0], [37.4, 38.0], [37.5, 38.0], [37.6, 38.0], [37.7, 38.0], [37.8, 38.0], [37.9, 38.0], [38.0, 38.0], [38.1, 38.0], [38.2, 38.0], [38.3, 38.0], [38.4, 38.0], [38.5, 38.0], [38.6, 38.0], [38.7, 38.0], [38.8, 38.0], [38.9, 38.0], [39.0, 38.0], [39.1, 38.0], [39.2, 38.0], [39.3, 38.0], [39.4, 38.0], [39.5, 39.0], [39.6, 39.0], [39.7, 39.0], [39.8, 39.0], [39.9, 39.0], [40.0, 39.0], [40.1, 39.0], [40.2, 39.0], [40.3, 39.0], [40.4, 39.0], [40.5, 39.0], [40.6, 39.0], [40.7, 39.0], [40.8, 39.0], [40.9, 39.0], [41.0, 39.0], [41.1, 39.0], [41.2, 39.0], [41.3, 39.0], [41.4, 39.0], [41.5, 39.0], [41.6, 39.0], [41.7, 39.0], [41.8, 39.0], [41.9, 39.0], [42.0, 39.0], [42.1, 39.0], [42.2, 39.0], [42.3, 39.0], [42.4, 39.0], [42.5, 39.0], [42.6, 39.0], [42.7, 39.0], [42.8, 39.0], [42.9, 39.0], [43.0, 39.0], [43.1, 39.0], [43.2, 40.0], [43.3, 40.0], [43.4, 40.0], [43.5, 40.0], [43.6, 40.0], [43.7, 40.0], [43.8, 40.0], [43.9, 40.0], [44.0, 40.0], [44.1, 40.0], [44.2, 40.0], [44.3, 40.0], [44.4, 40.0], [44.5, 40.0], [44.6, 40.0], [44.7, 40.0], [44.8, 40.0], [44.9, 40.0], [45.0, 40.0], [45.1, 40.0], [45.2, 40.0], [45.3, 40.0], [45.4, 40.0], [45.5, 41.0], [45.6, 41.0], [45.7, 41.0], [45.8, 41.0], [45.9, 41.0], [46.0, 41.0], [46.1, 41.0], [46.2, 41.0], [46.3, 41.0], [46.4, 41.0], [46.5, 41.0], [46.6, 41.0], [46.7, 41.0], [46.8, 41.0], [46.9, 41.0], [47.0, 41.0], [47.1, 42.0], [47.2, 42.0], [47.3, 42.0], [47.4, 42.0], [47.5, 42.0], [47.6, 42.0], [47.7, 42.0], [47.8, 42.0], [47.9, 42.0], [48.0, 42.0], [48.1, 42.0], [48.2, 42.0], [48.3, 43.0], [48.4, 43.0], [48.5, 43.0], [48.6, 43.0], [48.7, 43.0], [48.8, 43.0], [48.9, 43.0], [49.0, 44.0], [49.1, 44.0], [49.2, 44.0], [49.3, 44.0], [49.4, 44.0], [49.5, 45.0], [49.6, 45.0], [49.7, 45.0], [49.8, 45.0], [49.9, 45.0], [50.0, 45.0], [50.1, 45.0], [50.2, 45.0], [50.3, 46.0], [50.4, 46.0], [50.5, 46.0], [50.6, 47.0], [50.7, 48.0], [50.8, 48.0], [50.9, 48.0], [51.0, 48.0], [51.1, 48.0], [51.2, 48.0], [51.3, 49.0], [51.4, 49.0], [51.5, 50.0], [51.6, 50.0], [51.7, 50.0], [51.8, 50.0], [51.9, 50.0], [52.0, 51.0], [52.1, 51.0], [52.2, 51.0], [52.3, 51.0], [52.4, 52.0], [52.5, 52.0], [52.6, 53.0], [52.7, 53.0], [52.8, 53.0], [52.9, 53.0], [53.0, 53.0], [53.1, 54.0], [53.2, 54.0], [53.3, 54.0], [53.4, 54.0], [53.5, 55.0], [53.6, 55.0], [53.7, 55.0], [53.8, 56.0], [53.9, 56.0], [54.0, 56.0], [54.1, 56.0], [54.2, 56.0], [54.3, 57.0], [54.4, 57.0], [54.5, 58.0], [54.6, 58.0], [54.7, 58.0], [54.8, 58.0], [54.9, 58.0], [55.0, 58.0], [55.1, 59.0], [55.2, 59.0], [55.3, 60.0], [55.4, 60.0], [55.5, 60.0], [55.6, 62.0], [55.7, 63.0], [55.8, 63.0], [55.9, 64.0], [56.0, 64.0], [56.1, 66.0], [56.2, 66.0], [56.3, 67.0], [56.4, 67.0], [56.5, 68.0], [56.6, 68.0], [56.7, 71.0], [56.8, 72.0], [56.9, 73.0], [57.0, 74.0], [57.1, 74.0], [57.2, 76.0], [57.3, 77.0], [57.4, 78.0], [57.5, 80.0], [57.6, 81.0], [57.7, 82.0], [57.8, 82.0], [57.9, 84.0], [58.0, 86.0], [58.1, 89.0], [58.2, 89.0], [58.3, 90.0], [58.4, 92.0], [58.5, 95.0], [58.6, 96.0], [58.7, 96.0], [58.8, 97.0], [58.9, 99.0], [59.0, 99.0], [59.1, 100.0], [59.2, 102.0], [59.3, 106.0], [59.4, 108.0], [59.5, 112.0], [59.6, 113.0], [59.7, 114.0], [59.8, 116.0], [59.9, 116.0], [60.0, 118.0], [60.1, 120.0], [60.2, 122.0], [60.3, 123.0], [60.4, 123.0], [60.5, 125.0], [60.6, 126.0], [60.7, 129.0], [60.8, 130.0], [60.9, 130.0], [61.0, 131.0], [61.1, 132.0], [61.2, 132.0], [61.3, 134.0], [61.4, 134.0], [61.5, 134.0], [61.6, 135.0], [61.7, 136.0], [61.8, 139.0], [61.9, 141.0], [62.0, 144.0], [62.1, 145.0], [62.2, 146.0], [62.3, 146.0], [62.4, 147.0], [62.5, 147.0], [62.6, 149.0], [62.7, 149.0], [62.8, 150.0], [62.9, 151.0], [63.0, 151.0], [63.1, 152.0], [63.2, 158.0], [63.3, 158.0], [63.4, 160.0], [63.5, 160.0], [63.6, 163.0], [63.7, 163.0], [63.8, 165.0], [63.9, 170.0], [64.0, 171.0], [64.1, 172.0], [64.2, 173.0], [64.3, 176.0], [64.4, 176.0], [64.5, 177.0], [64.6, 177.0], [64.7, 178.0], [64.8, 178.0], [64.9, 179.0], [65.0, 179.0], [65.1, 180.0], [65.2, 185.0], [65.3, 185.0], [65.4, 186.0], [65.5, 187.0], [65.6, 187.0], [65.7, 187.0], [65.8, 190.0], [65.9, 192.0], [66.0, 193.0], [66.1, 193.0], [66.2, 193.0], [66.3, 193.0], [66.4, 194.0], [66.5, 195.0], [66.6, 196.0], [66.7, 201.0], [66.8, 201.0], [66.9, 201.0], [67.0, 203.0], [67.1, 204.0], [67.2, 206.0], [67.3, 206.0], [67.4, 209.0], [67.5, 210.0], [67.6, 211.0], [67.7, 211.0], [67.8, 215.0], [67.9, 216.0], [68.0, 216.0], [68.1, 218.0], [68.2, 219.0], [68.3, 221.0], [68.4, 223.0], [68.5, 226.0], [68.6, 226.0], [68.7, 227.0], [68.8, 227.0], [68.9, 227.0], [69.0, 228.0], [69.1, 228.0], [69.2, 228.0], [69.3, 228.0], [69.4, 231.0], [69.5, 232.0], [69.6, 233.0], [69.7, 234.0], [69.8, 235.0], [69.9, 237.0], [70.0, 239.0], [70.1, 241.0], [70.2, 243.0], [70.3, 243.0], [70.4, 246.0], [70.5, 248.0], [70.6, 249.0], [70.7, 249.0], [70.8, 249.0], [70.9, 249.0], [71.0, 250.0], [71.1, 250.0], [71.2, 251.0], [71.3, 253.0], [71.4, 253.0], [71.5, 254.0], [71.6, 255.0], [71.7, 257.0], [71.8, 258.0], [71.9, 258.0], [72.0, 258.0], [72.1, 260.0], [72.2, 260.0], [72.3, 260.0], [72.4, 262.0], [72.5, 262.0], [72.6, 264.0], [72.7, 264.0], [72.8, 264.0], [72.9, 266.0], [73.0, 267.0], [73.1, 270.0], [73.2, 272.0], [73.3, 273.0], [73.4, 273.0], [73.5, 274.0], [73.6, 274.0], [73.7, 275.0], [73.8, 276.0], [73.9, 277.0], [74.0, 277.0], [74.1, 280.0], [74.2, 281.0], [74.3, 282.0], [74.4, 282.0], [74.5, 283.0], [74.6, 284.0], [74.7, 286.0], [74.8, 287.0], [74.9, 288.0], [75.0, 288.0], [75.1, 288.0], [75.2, 289.0], [75.3, 289.0], [75.4, 291.0], [75.5, 293.0], [75.6, 294.0], [75.7, 294.0], [75.8, 296.0], [75.9, 296.0], [76.0, 297.0], [76.1, 297.0], [76.2, 298.0], [76.3, 298.0], [76.4, 301.0], [76.5, 302.0], [76.6, 302.0], [76.7, 303.0], [76.8, 303.0], [76.9, 303.0], [77.0, 305.0], [77.1, 306.0], [77.2, 307.0], [77.3, 307.0], [77.4, 307.0], [77.5, 307.0], [77.6, 308.0], [77.7, 311.0], [77.8, 312.0], [77.9, 315.0], [78.0, 315.0], [78.1, 315.0], [78.2, 315.0], [78.3, 316.0], [78.4, 318.0], [78.5, 319.0], [78.6, 319.0], [78.7, 319.0], [78.8, 321.0], [78.9, 322.0], [79.0, 324.0], [79.1, 324.0], [79.2, 325.0], [79.3, 326.0], [79.4, 326.0], [79.5, 327.0], [79.6, 329.0], [79.7, 329.0], [79.8, 329.0], [79.9, 335.0], [80.0, 335.0], [80.1, 335.0], [80.2, 336.0], [80.3, 336.0], [80.4, 336.0], [80.5, 337.0], [80.6, 337.0], [80.7, 338.0], [80.8, 339.0], [80.9, 339.0], [81.0, 342.0], [81.1, 342.0], [81.2, 344.0], [81.3, 345.0], [81.4, 346.0], [81.5, 350.0], [81.6, 350.0], [81.7, 351.0], [81.8, 352.0], [81.9, 353.0], [82.0, 353.0], [82.1, 354.0], [82.2, 355.0], [82.3, 356.0], [82.4, 358.0], [82.5, 358.0], [82.6, 358.0], [82.7, 360.0], [82.8, 360.0], [82.9, 361.0], [83.0, 362.0], [83.1, 362.0], [83.2, 362.0], [83.3, 362.0], [83.4, 369.0], [83.5, 370.0], [83.6, 371.0], [83.7, 371.0], [83.8, 371.0], [83.9, 371.0], [84.0, 371.0], [84.1, 373.0], [84.2, 373.0], [84.3, 374.0], [84.4, 375.0], [84.5, 376.0], [84.6, 377.0], [84.7, 378.0], [84.8, 385.0], [84.9, 386.0], [85.0, 387.0], [85.1, 387.0], [85.2, 388.0], [85.3, 389.0], [85.4, 396.0], [85.5, 397.0], [85.6, 398.0], [85.7, 400.0], [85.8, 400.0], [85.9, 405.0], [86.0, 408.0], [86.1, 408.0], [86.2, 408.0], [86.3, 409.0], [86.4, 410.0], [86.5, 410.0], [86.6, 412.0], [86.7, 412.0], [86.8, 414.0], [86.9, 414.0], [87.0, 415.0], [87.1, 416.0], [87.2, 416.0], [87.3, 420.0], [87.4, 435.0], [87.5, 435.0], [87.6, 436.0], [87.7, 437.0], [87.8, 438.0], [87.9, 440.0], [88.0, 443.0], [88.1, 449.0], [88.2, 459.0], [88.3, 469.0], [88.4, 477.0], [88.5, 477.0], [88.6, 478.0], [88.7, 479.0], [88.8, 480.0], [88.9, 484.0], [89.0, 484.0], [89.1, 491.0], [89.2, 503.0], [89.3, 516.0], [89.4, 526.0], [89.5, 532.0], [89.6, 545.0], [89.7, 555.0], [89.8, 562.0], [89.9, 566.0], [90.0, 569.0], [90.1, 585.0], [90.2, 597.0], [90.3, 615.0], [90.4, 634.0], [90.5, 635.0], [90.6, 642.0], [90.7, 647.0], [90.8, 660.0], [90.9, 662.0], [91.0, 666.0], [91.1, 671.0], [91.2, 672.0], [91.3, 676.0], [91.4, 688.0], [91.5, 694.0], [91.6, 694.0], [91.7, 696.0], [91.8, 708.0], [91.9, 713.0], [92.0, 717.0], [92.1, 727.0], [92.2, 728.0], [92.3, 730.0], [92.4, 738.0], [92.5, 748.0], [92.6, 765.0], [92.7, 769.0], [92.8, 770.0], [92.9, 777.0], [93.0, 783.0], [93.1, 791.0], [93.2, 794.0], [93.3, 805.0], [93.4, 820.0], [93.5, 821.0], [93.6, 823.0], [93.7, 827.0], [93.8, 841.0], [93.9, 842.0], [94.0, 860.0], [94.1, 868.0], [94.2, 869.0], [94.3, 878.0], [94.4, 878.0], [94.5, 902.0], [94.6, 907.0], [94.7, 933.0], [94.8, 968.0], [94.9, 968.0], [95.0, 988.0], [95.1, 992.0], [95.2, 995.0], [95.3, 998.0], [95.4, 1000.0], [95.5, 1001.0], [95.6, 1024.0], [95.7, 1050.0], [95.8, 1165.0], [95.9, 1259.0], [96.0, 1264.0], [96.1, 1279.0], [96.2, 1282.0], [96.3, 1283.0], [96.4, 1288.0], [96.5, 1293.0], [96.6, 1309.0], [96.7, 1309.0], [96.8, 1324.0], [96.9, 1324.0], [97.0, 1326.0], [97.1, 1333.0], [97.2, 1338.0], [97.3, 1342.0], [97.4, 1350.0], [97.5, 1357.0], [97.6, 1369.0], [97.7, 1371.0], [97.8, 1381.0], [97.9, 1381.0], [98.0, 1386.0], [98.1, 1396.0], [98.2, 1401.0], [98.3, 1406.0], [98.4, 1407.0], [98.5, 1414.0], [98.6, 1417.0], [98.7, 1424.0], [98.8, 1428.0], [98.9, 1431.0], [99.0, 1433.0], [99.1, 1457.0], [99.2, 1474.0], [99.3, 1476.0], [99.4, 1483.0], [99.5, 1483.0], [99.6, 1487.0], [99.7, 1490.0], [99.8, 1498.0], [99.9, 1536.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 590.0, "series": [{"data": [[0.0, 590.0], [600.0, 15.0], [700.0, 15.0], [200.0, 98.0], [800.0, 12.0], [900.0, 9.0], [1000.0, 4.0], [1100.0, 1.0], [300.0, 93.0], [1200.0, 7.0], [1300.0, 16.0], [1400.0, 17.0], [1500.0, 1.0], [100.0, 76.0], [400.0, 35.0], [500.0, 11.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 892.0, "series": [{"data": [[1.0, 107.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 892.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 34.58999999999999, "minX": 1.54958334E12, "maxY": 34.58999999999999, "series": [{"data": [[1.54958334E12, 34.58999999999999]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 34.0, "minX": 1.0, "maxY": 1489.0, "series": [{"data": [[3.0, 34.55555555555555], [4.0, 34.166666666666664], [5.0, 35.650000000000006], [6.0, 36.23735408560314], [7.0, 39.33108108108107], [8.0, 45.925925925925924], [9.0, 54.518518518518526], [10.0, 58.0], [11.0, 63.75], [12.0, 81.66666666666667], [13.0, 84.125], [14.0, 92.57142857142857], [15.0, 92.66666666666667], [16.0, 112.8], [17.0, 160.2], [18.0, 109.5], [19.0, 150.66666666666666], [20.0, 157.33333333333334], [21.0, 128.83333333333334], [22.0, 184.8], [23.0, 141.33333333333334], [24.0, 142.33333333333334], [25.0, 157.42857142857142], [26.0, 182.5], [27.0, 166.8], [28.0, 178.2], [29.0, 166.33333333333334], [30.0, 194.66666666666666], [31.0, 197.66666666666666], [33.0, 204.33333333333334], [32.0, 232.66666666666666], [35.0, 198.42857142857142], [34.0, 212.5], [37.0, 242.0], [36.0, 217.25], [39.0, 327.0], [38.0, 183.0], [41.0, 203.0], [40.0, 246.0], [43.0, 289.3333333333333], [42.0, 316.0], [45.0, 176.0], [44.0, 308.5], [47.0, 212.0], [46.0, 269.375], [49.0, 410.0], [48.0, 319.3333333333333], [51.0, 313.25], [50.0, 299.6], [53.0, 439.3333333333333], [52.0, 277.0], [55.0, 382.5], [54.0, 339.0], [57.0, 336.25], [56.0, 578.5], [59.0, 251.0], [58.0, 356.5], [61.0, 1381.0], [60.0, 886.0], [63.0, 1098.3333333333333], [62.0, 1428.0], [67.0, 888.25], [66.0, 438.5], [65.0, 1417.0], [64.0, 1489.0], [71.0, 1391.5], [70.0, 322.0], [69.0, 1405.0], [68.0, 484.0], [75.0, 603.25], [74.0, 1350.0], [73.0, 1480.5], [72.0, 1371.0], [79.0, 573.75], [78.0, 388.5], [77.0, 629.5], [76.0, 973.0], [83.0, 334.6666666666667], [82.0, 1406.0], [81.0, 1382.0], [80.0, 1347.5], [87.0, 399.53333333333325], [86.0, 311.1111111111111], [85.0, 853.0], [91.0, 449.14285714285717], [90.0, 657.1111111111111], [89.0, 363.4166666666667], [88.0, 392.49999999999994], [94.0, 484.0], [93.0, 516.0], [92.0, 362.0], [98.0, 470.75], [99.0, 282.6666666666667], [97.0, 316.5], [96.0, 307.6666666666667], [103.0, 460.0], [102.0, 309.33333333333337], [101.0, 256.5], [100.0, 372.8], [107.0, 322.0], [106.0, 404.0], [105.0, 548.4], [104.0, 534.5], [108.0, 433.8], [111.0, 766.3333333333334], [110.0, 789.0], [109.0, 387.0], [115.0, 752.8], [114.0, 968.0], [113.0, 764.3333333333334], [112.0, 288.0], [116.0, 552.6666666666666], [119.0, 513.5], [118.0, 718.0], [117.0, 681.3333333333334], [123.0, 490.0], [122.0, 878.0], [121.0, 731.3333333333334], [120.0, 790.3333333333334], [125.0, 574.0], [126.0, 762.6666666666666], [127.0, 700.0], [124.0, 794.0], [132.0, 558.5714285714286], [133.0, 620.8], [134.0, 682.0], [131.0, 766.0], [130.0, 644.3333333333334], [128.0, 642.0], [1.0, 34.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[34.58999999999999, 215.70399999999984]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 134.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 4233.333333333333, "minX": 1.54958334E12, "maxY": 6999.0, "series": [{"data": [[1.54958334E12, 6999.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958334E12, 4233.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 215.70399999999984, "minX": 1.54958334E12, "maxY": 215.70399999999984, "series": [{"data": [[1.54958334E12, 215.70399999999984]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 215.69200000000012, "minX": 1.54958334E12, "maxY": 215.69200000000012, "series": [{"data": [[1.54958334E12, 215.69200000000012]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 43.55599999999995, "minX": 1.54958334E12, "maxY": 43.55599999999995, "series": [{"data": [[1.54958334E12, 43.55599999999995]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 29.0, "minX": 1.54958334E12, "maxY": 1536.0, "series": [{"data": [[1.54958334E12, 1536.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958334E12, 29.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958334E12, 568.6999999999999]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958334E12, 1432.98]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958334E12, 986.9999999999986]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 45.0, "minX": 16.0, "maxY": 45.0, "series": [{"data": [[16.0, 45.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 45.0, "minX": 16.0, "maxY": 45.0, "series": [{"data": [[16.0, 45.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958334E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958334E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958334E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958334E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54958334E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54958334E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Transactions Per Second"}},
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
