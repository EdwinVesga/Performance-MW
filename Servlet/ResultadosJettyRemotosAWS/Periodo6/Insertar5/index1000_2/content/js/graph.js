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
        data: {"result": {"minY": 31.0, "minX": 0.0, "maxY": 1470.0, "series": [{"data": [[0.0, 31.0], [0.1, 31.0], [0.2, 32.0], [0.3, 32.0], [0.4, 33.0], [0.5, 33.0], [0.6, 33.0], [0.7, 33.0], [0.8, 33.0], [0.9, 33.0], [1.0, 33.0], [1.1, 33.0], [1.2, 33.0], [1.3, 34.0], [1.4, 34.0], [1.5, 34.0], [1.6, 34.0], [1.7, 34.0], [1.8, 34.0], [1.9, 34.0], [2.0, 34.0], [2.1, 34.0], [2.2, 34.0], [2.3, 34.0], [2.4, 34.0], [2.5, 34.0], [2.6, 34.0], [2.7, 34.0], [2.8, 34.0], [2.9, 34.0], [3.0, 34.0], [3.1, 34.0], [3.2, 34.0], [3.3, 34.0], [3.4, 34.0], [3.5, 34.0], [3.6, 34.0], [3.7, 35.0], [3.8, 35.0], [3.9, 35.0], [4.0, 35.0], [4.1, 35.0], [4.2, 35.0], [4.3, 35.0], [4.4, 35.0], [4.5, 35.0], [4.6, 35.0], [4.7, 35.0], [4.8, 35.0], [4.9, 35.0], [5.0, 35.0], [5.1, 35.0], [5.2, 35.0], [5.3, 35.0], [5.4, 35.0], [5.5, 35.0], [5.6, 35.0], [5.7, 35.0], [5.8, 35.0], [5.9, 35.0], [6.0, 35.0], [6.1, 35.0], [6.2, 35.0], [6.3, 35.0], [6.4, 35.0], [6.5, 35.0], [6.6, 35.0], [6.7, 35.0], [6.8, 35.0], [6.9, 35.0], [7.0, 35.0], [7.1, 35.0], [7.2, 35.0], [7.3, 35.0], [7.4, 35.0], [7.5, 35.0], [7.6, 35.0], [7.7, 35.0], [7.8, 35.0], [7.9, 35.0], [8.0, 35.0], [8.1, 35.0], [8.2, 35.0], [8.3, 35.0], [8.4, 35.0], [8.5, 36.0], [8.6, 36.0], [8.7, 36.0], [8.8, 36.0], [8.9, 36.0], [9.0, 36.0], [9.1, 36.0], [9.2, 36.0], [9.3, 36.0], [9.4, 36.0], [9.5, 36.0], [9.6, 36.0], [9.7, 36.0], [9.8, 36.0], [9.9, 36.0], [10.0, 36.0], [10.1, 36.0], [10.2, 36.0], [10.3, 36.0], [10.4, 36.0], [10.5, 36.0], [10.6, 36.0], [10.7, 36.0], [10.8, 36.0], [10.9, 36.0], [11.0, 36.0], [11.1, 36.0], [11.2, 36.0], [11.3, 36.0], [11.4, 36.0], [11.5, 36.0], [11.6, 36.0], [11.7, 36.0], [11.8, 36.0], [11.9, 36.0], [12.0, 36.0], [12.1, 36.0], [12.2, 36.0], [12.3, 36.0], [12.4, 36.0], [12.5, 36.0], [12.6, 36.0], [12.7, 36.0], [12.8, 36.0], [12.9, 36.0], [13.0, 36.0], [13.1, 36.0], [13.2, 36.0], [13.3, 36.0], [13.4, 36.0], [13.5, 36.0], [13.6, 36.0], [13.7, 36.0], [13.8, 36.0], [13.9, 36.0], [14.0, 36.0], [14.1, 36.0], [14.2, 36.0], [14.3, 36.0], [14.4, 36.0], [14.5, 36.0], [14.6, 36.0], [14.7, 36.0], [14.8, 36.0], [14.9, 36.0], [15.0, 36.0], [15.1, 36.0], [15.2, 36.0], [15.3, 36.0], [15.4, 36.0], [15.5, 36.0], [15.6, 36.0], [15.7, 36.0], [15.8, 36.0], [15.9, 36.0], [16.0, 36.0], [16.1, 36.0], [16.2, 36.0], [16.3, 36.0], [16.4, 36.0], [16.5, 36.0], [16.6, 36.0], [16.7, 36.0], [16.8, 36.0], [16.9, 36.0], [17.0, 36.0], [17.1, 36.0], [17.2, 36.0], [17.3, 36.0], [17.4, 36.0], [17.5, 36.0], [17.6, 36.0], [17.7, 36.0], [17.8, 37.0], [17.9, 37.0], [18.0, 37.0], [18.1, 37.0], [18.2, 37.0], [18.3, 37.0], [18.4, 37.0], [18.5, 37.0], [18.6, 37.0], [18.7, 37.0], [18.8, 37.0], [18.9, 37.0], [19.0, 37.0], [19.1, 37.0], [19.2, 37.0], [19.3, 37.0], [19.4, 37.0], [19.5, 37.0], [19.6, 37.0], [19.7, 37.0], [19.8, 37.0], [19.9, 37.0], [20.0, 37.0], [20.1, 37.0], [20.2, 37.0], [20.3, 37.0], [20.4, 37.0], [20.5, 37.0], [20.6, 37.0], [20.7, 37.0], [20.8, 37.0], [20.9, 37.0], [21.0, 37.0], [21.1, 37.0], [21.2, 37.0], [21.3, 37.0], [21.4, 37.0], [21.5, 37.0], [21.6, 37.0], [21.7, 37.0], [21.8, 37.0], [21.9, 37.0], [22.0, 37.0], [22.1, 37.0], [22.2, 37.0], [22.3, 37.0], [22.4, 37.0], [22.5, 37.0], [22.6, 37.0], [22.7, 37.0], [22.8, 37.0], [22.9, 37.0], [23.0, 37.0], [23.1, 37.0], [23.2, 37.0], [23.3, 37.0], [23.4, 37.0], [23.5, 37.0], [23.6, 37.0], [23.7, 37.0], [23.8, 37.0], [23.9, 37.0], [24.0, 37.0], [24.1, 37.0], [24.2, 37.0], [24.3, 37.0], [24.4, 37.0], [24.5, 37.0], [24.6, 37.0], [24.7, 37.0], [24.8, 37.0], [24.9, 37.0], [25.0, 37.0], [25.1, 37.0], [25.2, 37.0], [25.3, 37.0], [25.4, 37.0], [25.5, 37.0], [25.6, 37.0], [25.7, 37.0], [25.8, 37.0], [25.9, 37.0], [26.0, 37.0], [26.1, 37.0], [26.2, 37.0], [26.3, 37.0], [26.4, 38.0], [26.5, 38.0], [26.6, 38.0], [26.7, 38.0], [26.8, 38.0], [26.9, 38.0], [27.0, 38.0], [27.1, 38.0], [27.2, 38.0], [27.3, 38.0], [27.4, 38.0], [27.5, 38.0], [27.6, 38.0], [27.7, 38.0], [27.8, 38.0], [27.9, 38.0], [28.0, 38.0], [28.1, 38.0], [28.2, 38.0], [28.3, 38.0], [28.4, 38.0], [28.5, 38.0], [28.6, 38.0], [28.7, 38.0], [28.8, 38.0], [28.9, 38.0], [29.0, 38.0], [29.1, 38.0], [29.2, 38.0], [29.3, 38.0], [29.4, 38.0], [29.5, 38.0], [29.6, 38.0], [29.7, 38.0], [29.8, 38.0], [29.9, 38.0], [30.0, 38.0], [30.1, 38.0], [30.2, 38.0], [30.3, 38.0], [30.4, 38.0], [30.5, 38.0], [30.6, 38.0], [30.7, 38.0], [30.8, 38.0], [30.9, 38.0], [31.0, 38.0], [31.1, 38.0], [31.2, 38.0], [31.3, 38.0], [31.4, 38.0], [31.5, 38.0], [31.6, 38.0], [31.7, 38.0], [31.8, 38.0], [31.9, 38.0], [32.0, 38.0], [32.1, 38.0], [32.2, 38.0], [32.3, 38.0], [32.4, 38.0], [32.5, 38.0], [32.6, 38.0], [32.7, 38.0], [32.8, 38.0], [32.9, 38.0], [33.0, 38.0], [33.1, 38.0], [33.2, 38.0], [33.3, 38.0], [33.4, 38.0], [33.5, 38.0], [33.6, 38.0], [33.7, 38.0], [33.8, 38.0], [33.9, 38.0], [34.0, 38.0], [34.1, 38.0], [34.2, 38.0], [34.3, 38.0], [34.4, 38.0], [34.5, 38.0], [34.6, 38.0], [34.7, 38.0], [34.8, 39.0], [34.9, 39.0], [35.0, 39.0], [35.1, 39.0], [35.2, 39.0], [35.3, 39.0], [35.4, 39.0], [35.5, 39.0], [35.6, 39.0], [35.7, 39.0], [35.8, 39.0], [35.9, 39.0], [36.0, 39.0], [36.1, 39.0], [36.2, 39.0], [36.3, 39.0], [36.4, 39.0], [36.5, 39.0], [36.6, 39.0], [36.7, 39.0], [36.8, 39.0], [36.9, 39.0], [37.0, 39.0], [37.1, 39.0], [37.2, 39.0], [37.3, 39.0], [37.4, 39.0], [37.5, 39.0], [37.6, 39.0], [37.7, 39.0], [37.8, 39.0], [37.9, 39.0], [38.0, 39.0], [38.1, 39.0], [38.2, 39.0], [38.3, 39.0], [38.4, 39.0], [38.5, 39.0], [38.6, 39.0], [38.7, 39.0], [38.8, 39.0], [38.9, 39.0], [39.0, 39.0], [39.1, 39.0], [39.2, 39.0], [39.3, 39.0], [39.4, 39.0], [39.5, 39.0], [39.6, 40.0], [39.7, 40.0], [39.8, 40.0], [39.9, 40.0], [40.0, 40.0], [40.1, 40.0], [40.2, 40.0], [40.3, 40.0], [40.4, 40.0], [40.5, 40.0], [40.6, 40.0], [40.7, 40.0], [40.8, 40.0], [40.9, 40.0], [41.0, 40.0], [41.1, 40.0], [41.2, 40.0], [41.3, 40.0], [41.4, 40.0], [41.5, 40.0], [41.6, 40.0], [41.7, 40.0], [41.8, 40.0], [41.9, 40.0], [42.0, 40.0], [42.1, 40.0], [42.2, 40.0], [42.3, 40.0], [42.4, 40.0], [42.5, 40.0], [42.6, 40.0], [42.7, 40.0], [42.8, 40.0], [42.9, 40.0], [43.0, 40.0], [43.1, 40.0], [43.2, 40.0], [43.3, 40.0], [43.4, 40.0], [43.5, 40.0], [43.6, 40.0], [43.7, 40.0], [43.8, 40.0], [43.9, 40.0], [44.0, 40.0], [44.1, 40.0], [44.2, 40.0], [44.3, 40.0], [44.4, 40.0], [44.5, 41.0], [44.6, 41.0], [44.7, 41.0], [44.8, 41.0], [44.9, 41.0], [45.0, 41.0], [45.1, 41.0], [45.2, 41.0], [45.3, 41.0], [45.4, 41.0], [45.5, 41.0], [45.6, 41.0], [45.7, 41.0], [45.8, 41.0], [45.9, 41.0], [46.0, 41.0], [46.1, 41.0], [46.2, 41.0], [46.3, 41.0], [46.4, 41.0], [46.5, 41.0], [46.6, 41.0], [46.7, 41.0], [46.8, 41.0], [46.9, 41.0], [47.0, 41.0], [47.1, 41.0], [47.2, 41.0], [47.3, 41.0], [47.4, 41.0], [47.5, 41.0], [47.6, 41.0], [47.7, 41.0], [47.8, 42.0], [47.9, 42.0], [48.0, 42.0], [48.1, 42.0], [48.2, 42.0], [48.3, 42.0], [48.4, 42.0], [48.5, 42.0], [48.6, 42.0], [48.7, 42.0], [48.8, 42.0], [48.9, 42.0], [49.0, 42.0], [49.1, 42.0], [49.2, 42.0], [49.3, 42.0], [49.4, 42.0], [49.5, 42.0], [49.6, 42.0], [49.7, 42.0], [49.8, 43.0], [49.9, 43.0], [50.0, 43.0], [50.1, 43.0], [50.2, 43.0], [50.3, 43.0], [50.4, 43.0], [50.5, 43.0], [50.6, 43.0], [50.7, 43.0], [50.8, 43.0], [50.9, 43.0], [51.0, 43.0], [51.1, 43.0], [51.2, 44.0], [51.3, 44.0], [51.4, 44.0], [51.5, 44.0], [51.6, 44.0], [51.7, 44.0], [51.8, 44.0], [51.9, 44.0], [52.0, 44.0], [52.1, 44.0], [52.2, 44.0], [52.3, 44.0], [52.4, 44.0], [52.5, 44.0], [52.6, 44.0], [52.7, 45.0], [52.8, 45.0], [52.9, 45.0], [53.0, 45.0], [53.1, 46.0], [53.2, 46.0], [53.3, 46.0], [53.4, 46.0], [53.5, 46.0], [53.6, 46.0], [53.7, 46.0], [53.8, 46.0], [53.9, 46.0], [54.0, 47.0], [54.1, 47.0], [54.2, 47.0], [54.3, 47.0], [54.4, 48.0], [54.5, 48.0], [54.6, 48.0], [54.7, 48.0], [54.8, 48.0], [54.9, 48.0], [55.0, 48.0], [55.1, 48.0], [55.2, 49.0], [55.3, 49.0], [55.4, 49.0], [55.5, 49.0], [55.6, 50.0], [55.7, 50.0], [55.8, 51.0], [55.9, 51.0], [56.0, 51.0], [56.1, 52.0], [56.2, 52.0], [56.3, 52.0], [56.4, 52.0], [56.5, 52.0], [56.6, 52.0], [56.7, 53.0], [56.8, 53.0], [56.9, 53.0], [57.0, 53.0], [57.1, 54.0], [57.2, 55.0], [57.3, 55.0], [57.4, 56.0], [57.5, 56.0], [57.6, 56.0], [57.7, 56.0], [57.8, 56.0], [57.9, 57.0], [58.0, 57.0], [58.1, 57.0], [58.2, 58.0], [58.3, 61.0], [58.4, 61.0], [58.5, 62.0], [58.6, 62.0], [58.7, 63.0], [58.8, 63.0], [58.9, 63.0], [59.0, 64.0], [59.1, 64.0], [59.2, 64.0], [59.3, 64.0], [59.4, 65.0], [59.5, 65.0], [59.6, 66.0], [59.7, 67.0], [59.8, 67.0], [59.9, 70.0], [60.0, 70.0], [60.1, 71.0], [60.2, 72.0], [60.3, 72.0], [60.4, 72.0], [60.5, 75.0], [60.6, 76.0], [60.7, 77.0], [60.8, 79.0], [60.9, 80.0], [61.0, 80.0], [61.1, 82.0], [61.2, 82.0], [61.3, 82.0], [61.4, 83.0], [61.5, 85.0], [61.6, 87.0], [61.7, 88.0], [61.8, 88.0], [61.9, 89.0], [62.0, 90.0], [62.1, 90.0], [62.2, 91.0], [62.3, 91.0], [62.4, 92.0], [62.5, 93.0], [62.6, 97.0], [62.7, 99.0], [62.8, 100.0], [62.9, 100.0], [63.0, 100.0], [63.1, 108.0], [63.2, 108.0], [63.3, 112.0], [63.4, 114.0], [63.5, 115.0], [63.6, 116.0], [63.7, 117.0], [63.8, 117.0], [63.9, 118.0], [64.0, 119.0], [64.1, 120.0], [64.2, 121.0], [64.3, 122.0], [64.4, 124.0], [64.5, 128.0], [64.6, 128.0], [64.7, 128.0], [64.8, 131.0], [64.9, 133.0], [65.0, 133.0], [65.1, 133.0], [65.2, 135.0], [65.3, 135.0], [65.4, 136.0], [65.5, 137.0], [65.6, 137.0], [65.7, 139.0], [65.8, 140.0], [65.9, 143.0], [66.0, 143.0], [66.1, 143.0], [66.2, 144.0], [66.3, 144.0], [66.4, 145.0], [66.5, 147.0], [66.6, 147.0], [66.7, 148.0], [66.8, 149.0], [66.9, 151.0], [67.0, 151.0], [67.1, 152.0], [67.2, 160.0], [67.3, 162.0], [67.4, 162.0], [67.5, 163.0], [67.6, 163.0], [67.7, 164.0], [67.8, 164.0], [67.9, 166.0], [68.0, 168.0], [68.1, 175.0], [68.2, 175.0], [68.3, 176.0], [68.4, 177.0], [68.5, 180.0], [68.6, 181.0], [68.7, 182.0], [68.8, 186.0], [68.9, 186.0], [69.0, 186.0], [69.1, 187.0], [69.2, 188.0], [69.3, 189.0], [69.4, 189.0], [69.5, 190.0], [69.6, 191.0], [69.7, 192.0], [69.8, 192.0], [69.9, 193.0], [70.0, 194.0], [70.1, 195.0], [70.2, 195.0], [70.3, 197.0], [70.4, 198.0], [70.5, 200.0], [70.6, 202.0], [70.7, 203.0], [70.8, 205.0], [70.9, 205.0], [71.0, 205.0], [71.1, 207.0], [71.2, 207.0], [71.3, 208.0], [71.4, 210.0], [71.5, 210.0], [71.6, 210.0], [71.7, 211.0], [71.8, 212.0], [71.9, 213.0], [72.0, 218.0], [72.1, 221.0], [72.2, 222.0], [72.3, 222.0], [72.4, 223.0], [72.5, 225.0], [72.6, 225.0], [72.7, 226.0], [72.8, 227.0], [72.9, 227.0], [73.0, 227.0], [73.1, 228.0], [73.2, 228.0], [73.3, 228.0], [73.4, 229.0], [73.5, 230.0], [73.6, 231.0], [73.7, 233.0], [73.8, 233.0], [73.9, 234.0], [74.0, 234.0], [74.1, 234.0], [74.2, 235.0], [74.3, 236.0], [74.4, 238.0], [74.5, 240.0], [74.6, 242.0], [74.7, 245.0], [74.8, 246.0], [74.9, 246.0], [75.0, 246.0], [75.1, 247.0], [75.2, 248.0], [75.3, 248.0], [75.4, 249.0], [75.5, 250.0], [75.6, 252.0], [75.7, 252.0], [75.8, 254.0], [75.9, 254.0], [76.0, 256.0], [76.1, 256.0], [76.2, 258.0], [76.3, 259.0], [76.4, 259.0], [76.5, 261.0], [76.6, 261.0], [76.7, 262.0], [76.8, 262.0], [76.9, 264.0], [77.0, 265.0], [77.1, 267.0], [77.2, 268.0], [77.3, 269.0], [77.4, 269.0], [77.5, 271.0], [77.6, 273.0], [77.7, 274.0], [77.8, 276.0], [77.9, 278.0], [78.0, 282.0], [78.1, 283.0], [78.2, 283.0], [78.3, 285.0], [78.4, 285.0], [78.5, 286.0], [78.6, 288.0], [78.7, 288.0], [78.8, 289.0], [78.9, 289.0], [79.0, 289.0], [79.1, 290.0], [79.2, 290.0], [79.3, 292.0], [79.4, 293.0], [79.5, 294.0], [79.6, 295.0], [79.7, 297.0], [79.8, 298.0], [79.9, 298.0], [80.0, 299.0], [80.1, 301.0], [80.2, 304.0], [80.3, 306.0], [80.4, 306.0], [80.5, 306.0], [80.6, 308.0], [80.7, 308.0], [80.8, 311.0], [80.9, 312.0], [81.0, 314.0], [81.1, 315.0], [81.2, 316.0], [81.3, 316.0], [81.4, 317.0], [81.5, 317.0], [81.6, 320.0], [81.7, 321.0], [81.8, 322.0], [81.9, 322.0], [82.0, 324.0], [82.1, 325.0], [82.2, 325.0], [82.3, 328.0], [82.4, 328.0], [82.5, 329.0], [82.6, 330.0], [82.7, 331.0], [82.8, 332.0], [82.9, 333.0], [83.0, 334.0], [83.1, 336.0], [83.2, 336.0], [83.3, 337.0], [83.4, 337.0], [83.5, 338.0], [83.6, 338.0], [83.7, 341.0], [83.8, 342.0], [83.9, 343.0], [84.0, 343.0], [84.1, 346.0], [84.2, 346.0], [84.3, 346.0], [84.4, 347.0], [84.5, 347.0], [84.6, 348.0], [84.7, 353.0], [84.8, 354.0], [84.9, 356.0], [85.0, 359.0], [85.1, 361.0], [85.2, 364.0], [85.3, 366.0], [85.4, 366.0], [85.5, 368.0], [85.6, 368.0], [85.7, 369.0], [85.8, 371.0], [85.9, 371.0], [86.0, 372.0], [86.1, 373.0], [86.2, 374.0], [86.3, 374.0], [86.4, 376.0], [86.5, 379.0], [86.6, 379.0], [86.7, 382.0], [86.8, 384.0], [86.9, 394.0], [87.0, 395.0], [87.1, 398.0], [87.2, 401.0], [87.3, 404.0], [87.4, 405.0], [87.5, 406.0], [87.6, 406.0], [87.7, 407.0], [87.8, 409.0], [87.9, 415.0], [88.0, 421.0], [88.1, 422.0], [88.2, 428.0], [88.3, 430.0], [88.4, 435.0], [88.5, 444.0], [88.6, 447.0], [88.7, 449.0], [88.8, 461.0], [88.9, 465.0], [89.0, 467.0], [89.1, 469.0], [89.2, 473.0], [89.3, 481.0], [89.4, 484.0], [89.5, 488.0], [89.6, 500.0], [89.7, 528.0], [89.8, 604.0], [89.9, 645.0], [90.0, 666.0], [90.1, 673.0], [90.2, 678.0], [90.3, 682.0], [90.4, 682.0], [90.5, 690.0], [90.6, 693.0], [90.7, 698.0], [90.8, 711.0], [90.9, 719.0], [91.0, 719.0], [91.1, 742.0], [91.2, 754.0], [91.3, 755.0], [91.4, 764.0], [91.5, 769.0], [91.6, 772.0], [91.7, 779.0], [91.8, 783.0], [91.9, 789.0], [92.0, 796.0], [92.1, 796.0], [92.2, 797.0], [92.3, 806.0], [92.4, 809.0], [92.5, 817.0], [92.6, 820.0], [92.7, 821.0], [92.8, 824.0], [92.9, 830.0], [93.0, 843.0], [93.1, 845.0], [93.2, 846.0], [93.3, 848.0], [93.4, 856.0], [93.5, 861.0], [93.6, 867.0], [93.7, 872.0], [93.8, 882.0], [93.9, 887.0], [94.0, 887.0], [94.1, 894.0], [94.2, 897.0], [94.3, 898.0], [94.4, 902.0], [94.5, 912.0], [94.6, 920.0], [94.7, 923.0], [94.8, 928.0], [94.9, 961.0], [95.0, 988.0], [95.1, 999.0], [95.2, 1018.0], [95.3, 1024.0], [95.4, 1028.0], [95.5, 1065.0], [95.6, 1069.0], [95.7, 1093.0], [95.8, 1105.0], [95.9, 1179.0], [96.0, 1197.0], [96.1, 1198.0], [96.2, 1208.0], [96.3, 1238.0], [96.4, 1240.0], [96.5, 1242.0], [96.6, 1254.0], [96.7, 1262.0], [96.8, 1265.0], [96.9, 1271.0], [97.0, 1272.0], [97.1, 1277.0], [97.2, 1283.0], [97.3, 1299.0], [97.4, 1308.0], [97.5, 1311.0], [97.6, 1319.0], [97.7, 1329.0], [97.8, 1332.0], [97.9, 1342.0], [98.0, 1343.0], [98.1, 1366.0], [98.2, 1367.0], [98.3, 1367.0], [98.4, 1376.0], [98.5, 1387.0], [98.6, 1397.0], [98.7, 1399.0], [98.8, 1401.0], [98.9, 1418.0], [99.0, 1418.0], [99.1, 1419.0], [99.2, 1420.0], [99.3, 1431.0], [99.4, 1443.0], [99.5, 1445.0], [99.6, 1451.0], [99.7, 1457.0], [99.8, 1458.0], [99.9, 1470.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 627.0, "series": [{"data": [[0.0, 627.0], [600.0, 10.0], [700.0, 15.0], [200.0, 96.0], [800.0, 21.0], [900.0, 8.0], [1000.0, 6.0], [1100.0, 4.0], [300.0, 71.0], [1200.0, 12.0], [1300.0, 14.0], [1400.0, 12.0], [100.0, 78.0], [400.0, 24.0], [500.0, 2.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 103.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 897.0, "series": [{"data": [[1.0, 103.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 897.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 31.328000000000017, "minX": 1.54958364E12, "maxY": 31.328000000000017, "series": [{"data": [[1.54958364E12, 31.328000000000017]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 34.0, "minX": 1.0, "maxY": 1470.0, "series": [{"data": [[2.0, 35.0], [3.0, 35.857142857142854], [4.0, 34.84615384615384], [5.0, 35.81481481481481], [6.0, 36.44131455399062], [7.0, 39.36290322580647], [8.0, 45.97872340425532], [9.0, 56.5], [10.0, 63.125], [11.0, 63.666666666666664], [12.0, 76.3], [13.0, 80.66666666666667], [14.0, 85.25], [15.0, 117.14285714285715], [16.0, 124.71428571428571], [17.0, 150.33333333333334], [18.0, 124.75], [19.0, 126.16666666666667], [20.0, 137.83333333333334], [21.0, 136.0], [22.0, 151.0], [23.0, 109.0], [24.0, 159.5], [25.0, 172.66666666666666], [26.0, 141.25], [27.0, 147.0], [28.0, 211.0], [29.0, 202.0], [30.0, 166.0], [31.0, 145.0], [33.0, 219.33333333333334], [32.0, 166.0], [35.0, 144.0], [34.0, 209.0], [37.0, 236.8], [36.0, 205.2], [39.0, 315.0], [38.0, 292.0], [41.0, 297.5], [40.0, 238.2], [43.0, 312.1666666666667], [42.0, 905.5], [45.0, 265.0], [44.0, 324.4], [47.0, 671.6666666666667], [46.0, 288.0], [49.0, 1425.0], [48.0, 1470.0], [51.0, 285.0], [50.0, 284.0], [53.0, 611.25], [52.0, 347.0], [55.0, 704.3333333333334], [54.0, 347.83333333333337], [57.0, 322.0], [56.0, 374.0], [59.0, 926.0], [58.0, 252.0], [61.0, 1358.0], [60.0, 419.0], [63.0, 659.0], [67.0, 273.0], [66.0, 421.5], [65.0, 1371.5], [64.0, 1451.0], [71.0, 1343.0], [70.0, 829.5], [69.0, 1384.0], [68.0, 898.5], [75.0, 295.6666666666667], [74.0, 519.6], [73.0, 807.0], [72.0, 1242.0], [78.0, 430.5], [79.0, 691.9166666666666], [77.0, 375.15384615384613], [76.0, 815.0], [83.0, 315.5], [82.0, 481.875], [80.0, 573.625], [81.0, 647.3000000000001], [87.0, 218.0], [86.0, 353.0], [84.0, 320.0], [85.0, 171.0], [91.0, 283.0], [90.0, 304.5], [89.0, 298.0], [88.0, 301.0], [95.0, 374.25], [94.0, 230.0], [93.0, 358.0], [92.0, 338.5], [99.0, 306.0], [98.0, 567.2], [97.0, 357.6666666666667], [96.0, 292.5], [103.0, 679.3333333333334], [102.0, 466.5], [101.0, 328.0], [100.0, 298.2], [107.0, 422.0], [106.0, 616.5], [105.0, 961.0], [104.0, 969.0], [108.0, 709.3333333333334], [111.0, 756.5], [110.0, 846.4], [109.0, 462.3333333333333], [115.0, 799.6666666666666], [114.0, 698.0], [113.0, 321.5], [112.0, 755.0], [119.0, 809.0], [118.0, 474.6666666666667], [117.0, 758.5], [116.0, 693.0], [123.0, 603.3333333333334], [122.0, 715.0], [120.0, 436.0], [127.0, 853.5], [126.0, 797.0], [125.0, 645.0], [124.0, 815.0], [130.0, 724.4285714285714], [129.0, 619.25], [128.0, 809.2], [1.0, 34.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[31.328000000000017, 203.56299999999985]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 130.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 4233.333333333333, "minX": 1.54958364E12, "maxY": 6999.483333333334, "series": [{"data": [[1.54958364E12, 6999.483333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958364E12, 4233.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 203.56299999999985, "minX": 1.54958364E12, "maxY": 203.56299999999985, "series": [{"data": [[1.54958364E12, 203.56299999999985]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 203.54199999999994, "minX": 1.54958364E12, "maxY": 203.54199999999994, "series": [{"data": [[1.54958364E12, 203.54199999999994]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 43.06799999999999, "minX": 1.54958364E12, "maxY": 43.06799999999999, "series": [{"data": [[1.54958364E12, 43.06799999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958364E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 31.0, "minX": 1.54958364E12, "maxY": 1470.0, "series": [{"data": [[1.54958364E12, 1470.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958364E12, 31.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958364E12, 663.8999999999995]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958364E12, 1418.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958364E12, 986.6499999999982]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958364E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 43.0, "minX": 16.0, "maxY": 43.0, "series": [{"data": [[16.0, 43.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 43.0, "minX": 16.0, "maxY": 43.0, "series": [{"data": [[16.0, 43.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
