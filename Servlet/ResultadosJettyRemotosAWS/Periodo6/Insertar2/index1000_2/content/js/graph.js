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
        data: {"result": {"minY": 31.0, "minX": 0.0, "maxY": 1433.0, "series": [{"data": [[0.0, 31.0], [0.1, 31.0], [0.2, 31.0], [0.3, 32.0], [0.4, 32.0], [0.5, 32.0], [0.6, 32.0], [0.7, 32.0], [0.8, 32.0], [0.9, 33.0], [1.0, 33.0], [1.1, 33.0], [1.2, 33.0], [1.3, 33.0], [1.4, 33.0], [1.5, 33.0], [1.6, 33.0], [1.7, 33.0], [1.8, 33.0], [1.9, 33.0], [2.0, 33.0], [2.1, 33.0], [2.2, 33.0], [2.3, 34.0], [2.4, 34.0], [2.5, 34.0], [2.6, 34.0], [2.7, 34.0], [2.8, 34.0], [2.9, 34.0], [3.0, 34.0], [3.1, 34.0], [3.2, 34.0], [3.3, 34.0], [3.4, 34.0], [3.5, 34.0], [3.6, 34.0], [3.7, 34.0], [3.8, 34.0], [3.9, 34.0], [4.0, 34.0], [4.1, 34.0], [4.2, 34.0], [4.3, 34.0], [4.4, 34.0], [4.5, 34.0], [4.6, 34.0], [4.7, 34.0], [4.8, 34.0], [4.9, 34.0], [5.0, 34.0], [5.1, 34.0], [5.2, 34.0], [5.3, 34.0], [5.4, 34.0], [5.5, 34.0], [5.6, 34.0], [5.7, 34.0], [5.8, 35.0], [5.9, 35.0], [6.0, 35.0], [6.1, 35.0], [6.2, 35.0], [6.3, 35.0], [6.4, 35.0], [6.5, 35.0], [6.6, 35.0], [6.7, 35.0], [6.8, 35.0], [6.9, 35.0], [7.0, 35.0], [7.1, 35.0], [7.2, 35.0], [7.3, 35.0], [7.4, 35.0], [7.5, 35.0], [7.6, 35.0], [7.7, 35.0], [7.8, 35.0], [7.9, 35.0], [8.0, 35.0], [8.1, 35.0], [8.2, 35.0], [8.3, 35.0], [8.4, 35.0], [8.5, 35.0], [8.6, 35.0], [8.7, 35.0], [8.8, 35.0], [8.9, 35.0], [9.0, 35.0], [9.1, 35.0], [9.2, 35.0], [9.3, 35.0], [9.4, 35.0], [9.5, 35.0], [9.6, 35.0], [9.7, 35.0], [9.8, 35.0], [9.9, 35.0], [10.0, 35.0], [10.1, 35.0], [10.2, 35.0], [10.3, 35.0], [10.4, 35.0], [10.5, 35.0], [10.6, 35.0], [10.7, 35.0], [10.8, 35.0], [10.9, 35.0], [11.0, 35.0], [11.1, 35.0], [11.2, 35.0], [11.3, 35.0], [11.4, 35.0], [11.5, 35.0], [11.6, 35.0], [11.7, 35.0], [11.8, 35.0], [11.9, 35.0], [12.0, 36.0], [12.1, 36.0], [12.2, 36.0], [12.3, 36.0], [12.4, 36.0], [12.5, 36.0], [12.6, 36.0], [12.7, 36.0], [12.8, 36.0], [12.9, 36.0], [13.0, 36.0], [13.1, 36.0], [13.2, 36.0], [13.3, 36.0], [13.4, 36.0], [13.5, 36.0], [13.6, 36.0], [13.7, 36.0], [13.8, 36.0], [13.9, 36.0], [14.0, 36.0], [14.1, 36.0], [14.2, 36.0], [14.3, 36.0], [14.4, 36.0], [14.5, 36.0], [14.6, 36.0], [14.7, 36.0], [14.8, 36.0], [14.9, 36.0], [15.0, 36.0], [15.1, 36.0], [15.2, 36.0], [15.3, 36.0], [15.4, 36.0], [15.5, 36.0], [15.6, 36.0], [15.7, 36.0], [15.8, 36.0], [15.9, 36.0], [16.0, 36.0], [16.1, 36.0], [16.2, 36.0], [16.3, 36.0], [16.4, 36.0], [16.5, 36.0], [16.6, 36.0], [16.7, 36.0], [16.8, 36.0], [16.9, 36.0], [17.0, 36.0], [17.1, 36.0], [17.2, 36.0], [17.3, 36.0], [17.4, 36.0], [17.5, 36.0], [17.6, 36.0], [17.7, 36.0], [17.8, 36.0], [17.9, 36.0], [18.0, 36.0], [18.1, 36.0], [18.2, 36.0], [18.3, 36.0], [18.4, 36.0], [18.5, 36.0], [18.6, 36.0], [18.7, 36.0], [18.8, 36.0], [18.9, 36.0], [19.0, 36.0], [19.1, 36.0], [19.2, 36.0], [19.3, 36.0], [19.4, 36.0], [19.5, 36.0], [19.6, 36.0], [19.7, 36.0], [19.8, 36.0], [19.9, 36.0], [20.0, 36.0], [20.1, 37.0], [20.2, 37.0], [20.3, 37.0], [20.4, 37.0], [20.5, 37.0], [20.6, 37.0], [20.7, 37.0], [20.8, 37.0], [20.9, 37.0], [21.0, 37.0], [21.1, 37.0], [21.2, 37.0], [21.3, 37.0], [21.4, 37.0], [21.5, 37.0], [21.6, 37.0], [21.7, 37.0], [21.8, 37.0], [21.9, 37.0], [22.0, 37.0], [22.1, 37.0], [22.2, 37.0], [22.3, 37.0], [22.4, 37.0], [22.5, 37.0], [22.6, 37.0], [22.7, 37.0], [22.8, 37.0], [22.9, 37.0], [23.0, 37.0], [23.1, 37.0], [23.2, 37.0], [23.3, 37.0], [23.4, 37.0], [23.5, 37.0], [23.6, 37.0], [23.7, 37.0], [23.8, 37.0], [23.9, 37.0], [24.0, 37.0], [24.1, 37.0], [24.2, 37.0], [24.3, 37.0], [24.4, 37.0], [24.5, 37.0], [24.6, 37.0], [24.7, 37.0], [24.8, 37.0], [24.9, 37.0], [25.0, 37.0], [25.1, 37.0], [25.2, 37.0], [25.3, 37.0], [25.4, 37.0], [25.5, 37.0], [25.6, 37.0], [25.7, 37.0], [25.8, 37.0], [25.9, 37.0], [26.0, 37.0], [26.1, 37.0], [26.2, 37.0], [26.3, 37.0], [26.4, 37.0], [26.5, 37.0], [26.6, 37.0], [26.7, 37.0], [26.8, 37.0], [26.9, 37.0], [27.0, 38.0], [27.1, 38.0], [27.2, 38.0], [27.3, 38.0], [27.4, 38.0], [27.5, 38.0], [27.6, 38.0], [27.7, 38.0], [27.8, 38.0], [27.9, 38.0], [28.0, 38.0], [28.1, 38.0], [28.2, 38.0], [28.3, 38.0], [28.4, 38.0], [28.5, 38.0], [28.6, 38.0], [28.7, 38.0], [28.8, 38.0], [28.9, 38.0], [29.0, 38.0], [29.1, 38.0], [29.2, 38.0], [29.3, 38.0], [29.4, 38.0], [29.5, 38.0], [29.6, 38.0], [29.7, 38.0], [29.8, 38.0], [29.9, 38.0], [30.0, 38.0], [30.1, 38.0], [30.2, 38.0], [30.3, 38.0], [30.4, 38.0], [30.5, 38.0], [30.6, 38.0], [30.7, 38.0], [30.8, 38.0], [30.9, 38.0], [31.0, 38.0], [31.1, 38.0], [31.2, 38.0], [31.3, 38.0], [31.4, 38.0], [31.5, 38.0], [31.6, 38.0], [31.7, 38.0], [31.8, 38.0], [31.9, 38.0], [32.0, 38.0], [32.1, 38.0], [32.2, 38.0], [32.3, 38.0], [32.4, 38.0], [32.5, 38.0], [32.6, 38.0], [32.7, 38.0], [32.8, 38.0], [32.9, 38.0], [33.0, 38.0], [33.1, 38.0], [33.2, 38.0], [33.3, 38.0], [33.4, 38.0], [33.5, 38.0], [33.6, 38.0], [33.7, 39.0], [33.8, 39.0], [33.9, 39.0], [34.0, 39.0], [34.1, 39.0], [34.2, 39.0], [34.3, 39.0], [34.4, 39.0], [34.5, 39.0], [34.6, 39.0], [34.7, 39.0], [34.8, 39.0], [34.9, 39.0], [35.0, 39.0], [35.1, 39.0], [35.2, 39.0], [35.3, 39.0], [35.4, 39.0], [35.5, 39.0], [35.6, 39.0], [35.7, 39.0], [35.8, 39.0], [35.9, 39.0], [36.0, 39.0], [36.1, 39.0], [36.2, 39.0], [36.3, 39.0], [36.4, 39.0], [36.5, 39.0], [36.6, 39.0], [36.7, 39.0], [36.8, 39.0], [36.9, 39.0], [37.0, 39.0], [37.1, 39.0], [37.2, 39.0], [37.3, 39.0], [37.4, 39.0], [37.5, 39.0], [37.6, 39.0], [37.7, 39.0], [37.8, 39.0], [37.9, 39.0], [38.0, 39.0], [38.1, 39.0], [38.2, 39.0], [38.3, 39.0], [38.4, 39.0], [38.5, 39.0], [38.6, 39.0], [38.7, 39.0], [38.8, 39.0], [38.9, 39.0], [39.0, 39.0], [39.1, 39.0], [39.2, 39.0], [39.3, 39.0], [39.4, 39.0], [39.5, 39.0], [39.6, 39.0], [39.7, 39.0], [39.8, 39.0], [39.9, 39.0], [40.0, 39.0], [40.1, 39.0], [40.2, 39.0], [40.3, 39.0], [40.4, 39.0], [40.5, 40.0], [40.6, 40.0], [40.7, 40.0], [40.8, 40.0], [40.9, 40.0], [41.0, 40.0], [41.1, 40.0], [41.2, 40.0], [41.3, 40.0], [41.4, 40.0], [41.5, 40.0], [41.6, 40.0], [41.7, 40.0], [41.8, 40.0], [41.9, 40.0], [42.0, 40.0], [42.1, 40.0], [42.2, 40.0], [42.3, 40.0], [42.4, 40.0], [42.5, 40.0], [42.6, 40.0], [42.7, 40.0], [42.8, 40.0], [42.9, 40.0], [43.0, 40.0], [43.1, 40.0], [43.2, 40.0], [43.3, 40.0], [43.4, 40.0], [43.5, 40.0], [43.6, 40.0], [43.7, 40.0], [43.8, 40.0], [43.9, 40.0], [44.0, 40.0], [44.1, 40.0], [44.2, 40.0], [44.3, 40.0], [44.4, 40.0], [44.5, 40.0], [44.6, 40.0], [44.7, 41.0], [44.8, 41.0], [44.9, 41.0], [45.0, 41.0], [45.1, 41.0], [45.2, 41.0], [45.3, 41.0], [45.4, 41.0], [45.5, 41.0], [45.6, 41.0], [45.7, 41.0], [45.8, 41.0], [45.9, 41.0], [46.0, 41.0], [46.1, 41.0], [46.2, 41.0], [46.3, 41.0], [46.4, 41.0], [46.5, 41.0], [46.6, 41.0], [46.7, 41.0], [46.8, 41.0], [46.9, 41.0], [47.0, 41.0], [47.1, 41.0], [47.2, 41.0], [47.3, 41.0], [47.4, 41.0], [47.5, 41.0], [47.6, 41.0], [47.7, 41.0], [47.8, 41.0], [47.9, 41.0], [48.0, 41.0], [48.1, 41.0], [48.2, 42.0], [48.3, 42.0], [48.4, 42.0], [48.5, 42.0], [48.6, 42.0], [48.7, 42.0], [48.8, 42.0], [48.9, 42.0], [49.0, 42.0], [49.1, 42.0], [49.2, 42.0], [49.3, 42.0], [49.4, 42.0], [49.5, 42.0], [49.6, 42.0], [49.7, 42.0], [49.8, 42.0], [49.9, 42.0], [50.0, 43.0], [50.1, 43.0], [50.2, 43.0], [50.3, 43.0], [50.4, 43.0], [50.5, 43.0], [50.6, 43.0], [50.7, 43.0], [50.8, 43.0], [50.9, 43.0], [51.0, 43.0], [51.1, 43.0], [51.2, 43.0], [51.3, 43.0], [51.4, 43.0], [51.5, 43.0], [51.6, 43.0], [51.7, 43.0], [51.8, 43.0], [51.9, 43.0], [52.0, 43.0], [52.1, 43.0], [52.2, 43.0], [52.3, 43.0], [52.4, 43.0], [52.5, 43.0], [52.6, 43.0], [52.7, 43.0], [52.8, 44.0], [52.9, 44.0], [53.0, 44.0], [53.1, 44.0], [53.2, 44.0], [53.3, 44.0], [53.4, 44.0], [53.5, 44.0], [53.6, 44.0], [53.7, 44.0], [53.8, 44.0], [53.9, 44.0], [54.0, 44.0], [54.1, 44.0], [54.2, 44.0], [54.3, 44.0], [54.4, 44.0], [54.5, 44.0], [54.6, 44.0], [54.7, 44.0], [54.8, 44.0], [54.9, 44.0], [55.0, 45.0], [55.1, 45.0], [55.2, 45.0], [55.3, 45.0], [55.4, 45.0], [55.5, 45.0], [55.6, 45.0], [55.7, 45.0], [55.8, 45.0], [55.9, 45.0], [56.0, 45.0], [56.1, 45.0], [56.2, 45.0], [56.3, 46.0], [56.4, 46.0], [56.5, 46.0], [56.6, 46.0], [56.7, 46.0], [56.8, 46.0], [56.9, 46.0], [57.0, 46.0], [57.1, 46.0], [57.2, 46.0], [57.3, 46.0], [57.4, 46.0], [57.5, 46.0], [57.6, 46.0], [57.7, 46.0], [57.8, 47.0], [57.9, 47.0], [58.0, 47.0], [58.1, 47.0], [58.2, 48.0], [58.3, 48.0], [58.4, 48.0], [58.5, 48.0], [58.6, 48.0], [58.7, 48.0], [58.8, 48.0], [58.9, 48.0], [59.0, 48.0], [59.1, 48.0], [59.2, 49.0], [59.3, 49.0], [59.4, 49.0], [59.5, 50.0], [59.6, 50.0], [59.7, 50.0], [59.8, 50.0], [59.9, 50.0], [60.0, 51.0], [60.1, 51.0], [60.2, 51.0], [60.3, 52.0], [60.4, 52.0], [60.5, 52.0], [60.6, 53.0], [60.7, 53.0], [60.8, 54.0], [60.9, 55.0], [61.0, 56.0], [61.1, 58.0], [61.2, 58.0], [61.3, 59.0], [61.4, 60.0], [61.5, 60.0], [61.6, 64.0], [61.7, 65.0], [61.8, 65.0], [61.9, 65.0], [62.0, 66.0], [62.1, 66.0], [62.2, 70.0], [62.3, 71.0], [62.4, 78.0], [62.5, 80.0], [62.6, 81.0], [62.7, 86.0], [62.8, 86.0], [62.9, 87.0], [63.0, 90.0], [63.1, 93.0], [63.2, 99.0], [63.3, 100.0], [63.4, 100.0], [63.5, 101.0], [63.6, 103.0], [63.7, 103.0], [63.8, 105.0], [63.9, 106.0], [64.0, 106.0], [64.1, 106.0], [64.2, 107.0], [64.3, 107.0], [64.4, 107.0], [64.5, 109.0], [64.6, 109.0], [64.7, 112.0], [64.8, 115.0], [64.9, 118.0], [65.0, 125.0], [65.1, 131.0], [65.2, 131.0], [65.3, 133.0], [65.4, 133.0], [65.5, 134.0], [65.6, 135.0], [65.7, 139.0], [65.8, 139.0], [65.9, 140.0], [66.0, 141.0], [66.1, 142.0], [66.2, 142.0], [66.3, 145.0], [66.4, 148.0], [66.5, 148.0], [66.6, 148.0], [66.7, 149.0], [66.8, 151.0], [66.9, 151.0], [67.0, 154.0], [67.1, 155.0], [67.2, 157.0], [67.3, 159.0], [67.4, 161.0], [67.5, 162.0], [67.6, 162.0], [67.7, 162.0], [67.8, 163.0], [67.9, 164.0], [68.0, 167.0], [68.1, 168.0], [68.2, 170.0], [68.3, 173.0], [68.4, 173.0], [68.5, 174.0], [68.6, 174.0], [68.7, 174.0], [68.8, 174.0], [68.9, 178.0], [69.0, 178.0], [69.1, 180.0], [69.2, 181.0], [69.3, 183.0], [69.4, 183.0], [69.5, 184.0], [69.6, 184.0], [69.7, 185.0], [69.8, 185.0], [69.9, 187.0], [70.0, 187.0], [70.1, 188.0], [70.2, 188.0], [70.3, 188.0], [70.4, 188.0], [70.5, 190.0], [70.6, 191.0], [70.7, 192.0], [70.8, 192.0], [70.9, 192.0], [71.0, 193.0], [71.1, 194.0], [71.2, 194.0], [71.3, 195.0], [71.4, 196.0], [71.5, 199.0], [71.6, 199.0], [71.7, 199.0], [71.8, 200.0], [71.9, 202.0], [72.0, 202.0], [72.1, 203.0], [72.2, 204.0], [72.3, 206.0], [72.4, 206.0], [72.5, 207.0], [72.6, 208.0], [72.7, 208.0], [72.8, 209.0], [72.9, 211.0], [73.0, 211.0], [73.1, 211.0], [73.2, 211.0], [73.3, 212.0], [73.4, 213.0], [73.5, 215.0], [73.6, 216.0], [73.7, 219.0], [73.8, 219.0], [73.9, 221.0], [74.0, 222.0], [74.1, 224.0], [74.2, 224.0], [74.3, 224.0], [74.4, 224.0], [74.5, 228.0], [74.6, 229.0], [74.7, 230.0], [74.8, 231.0], [74.9, 231.0], [75.0, 232.0], [75.1, 232.0], [75.2, 232.0], [75.3, 233.0], [75.4, 235.0], [75.5, 235.0], [75.6, 236.0], [75.7, 237.0], [75.8, 237.0], [75.9, 238.0], [76.0, 241.0], [76.1, 242.0], [76.2, 244.0], [76.3, 244.0], [76.4, 245.0], [76.5, 247.0], [76.6, 248.0], [76.7, 248.0], [76.8, 249.0], [76.9, 250.0], [77.0, 250.0], [77.1, 251.0], [77.2, 251.0], [77.3, 253.0], [77.4, 254.0], [77.5, 254.0], [77.6, 256.0], [77.7, 259.0], [77.8, 260.0], [77.9, 261.0], [78.0, 261.0], [78.1, 262.0], [78.2, 263.0], [78.3, 266.0], [78.4, 266.0], [78.5, 267.0], [78.6, 267.0], [78.7, 267.0], [78.8, 269.0], [78.9, 271.0], [79.0, 272.0], [79.1, 273.0], [79.2, 276.0], [79.3, 278.0], [79.4, 278.0], [79.5, 279.0], [79.6, 280.0], [79.7, 280.0], [79.8, 281.0], [79.9, 282.0], [80.0, 282.0], [80.1, 284.0], [80.2, 284.0], [80.3, 287.0], [80.4, 287.0], [80.5, 287.0], [80.6, 289.0], [80.7, 289.0], [80.8, 289.0], [80.9, 289.0], [81.0, 292.0], [81.1, 294.0], [81.2, 295.0], [81.3, 300.0], [81.4, 300.0], [81.5, 300.0], [81.6, 300.0], [81.7, 301.0], [81.8, 301.0], [81.9, 301.0], [82.0, 302.0], [82.1, 303.0], [82.2, 303.0], [82.3, 305.0], [82.4, 305.0], [82.5, 307.0], [82.6, 308.0], [82.7, 308.0], [82.8, 309.0], [82.9, 314.0], [83.0, 315.0], [83.1, 317.0], [83.2, 318.0], [83.3, 320.0], [83.4, 321.0], [83.5, 321.0], [83.6, 322.0], [83.7, 323.0], [83.8, 324.0], [83.9, 326.0], [84.0, 326.0], [84.1, 326.0], [84.2, 326.0], [84.3, 327.0], [84.4, 330.0], [84.5, 331.0], [84.6, 332.0], [84.7, 332.0], [84.8, 334.0], [84.9, 334.0], [85.0, 335.0], [85.1, 338.0], [85.2, 339.0], [85.3, 339.0], [85.4, 340.0], [85.5, 340.0], [85.6, 341.0], [85.7, 341.0], [85.8, 341.0], [85.9, 344.0], [86.0, 345.0], [86.1, 345.0], [86.2, 346.0], [86.3, 348.0], [86.4, 348.0], [86.5, 348.0], [86.6, 349.0], [86.7, 350.0], [86.8, 351.0], [86.9, 355.0], [87.0, 355.0], [87.1, 358.0], [87.2, 358.0], [87.3, 359.0], [87.4, 362.0], [87.5, 362.0], [87.6, 365.0], [87.7, 371.0], [87.8, 375.0], [87.9, 376.0], [88.0, 380.0], [88.1, 381.0], [88.2, 381.0], [88.3, 382.0], [88.4, 386.0], [88.5, 386.0], [88.6, 389.0], [88.7, 390.0], [88.8, 391.0], [88.9, 392.0], [89.0, 397.0], [89.1, 405.0], [89.2, 406.0], [89.3, 408.0], [89.4, 412.0], [89.5, 417.0], [89.6, 419.0], [89.7, 422.0], [89.8, 435.0], [89.9, 439.0], [90.0, 448.0], [90.1, 449.0], [90.2, 452.0], [90.3, 460.0], [90.4, 460.0], [90.5, 461.0], [90.6, 473.0], [90.7, 474.0], [90.8, 480.0], [90.9, 488.0], [91.0, 491.0], [91.1, 495.0], [91.2, 495.0], [91.3, 500.0], [91.4, 502.0], [91.5, 546.0], [91.6, 548.0], [91.7, 557.0], [91.8, 563.0], [91.9, 572.0], [92.0, 578.0], [92.1, 580.0], [92.2, 611.0], [92.3, 615.0], [92.4, 618.0], [92.5, 623.0], [92.6, 625.0], [92.7, 633.0], [92.8, 636.0], [92.9, 639.0], [93.0, 641.0], [93.1, 658.0], [93.2, 659.0], [93.3, 661.0], [93.4, 667.0], [93.5, 669.0], [93.6, 671.0], [93.7, 678.0], [93.8, 681.0], [93.9, 681.0], [94.0, 693.0], [94.1, 694.0], [94.2, 711.0], [94.3, 714.0], [94.4, 733.0], [94.5, 744.0], [94.6, 748.0], [94.7, 752.0], [94.8, 769.0], [94.9, 825.0], [95.0, 835.0], [95.1, 837.0], [95.2, 838.0], [95.3, 839.0], [95.4, 841.0], [95.5, 851.0], [95.6, 854.0], [95.7, 854.0], [95.8, 860.0], [95.9, 871.0], [96.0, 885.0], [96.1, 908.0], [96.2, 911.0], [96.3, 929.0], [96.4, 929.0], [96.5, 940.0], [96.6, 947.0], [96.7, 956.0], [96.8, 974.0], [96.9, 974.0], [97.0, 1078.0], [97.1, 1114.0], [97.2, 1198.0], [97.3, 1207.0], [97.4, 1208.0], [97.5, 1208.0], [97.6, 1231.0], [97.7, 1237.0], [97.8, 1238.0], [97.9, 1245.0], [98.0, 1253.0], [98.1, 1254.0], [98.2, 1256.0], [98.3, 1256.0], [98.4, 1257.0], [98.5, 1265.0], [98.6, 1285.0], [98.7, 1288.0], [98.8, 1293.0], [98.9, 1299.0], [99.0, 1309.0], [99.1, 1321.0], [99.2, 1334.0], [99.3, 1340.0], [99.4, 1345.0], [99.5, 1347.0], [99.6, 1356.0], [99.7, 1368.0], [99.8, 1412.0], [99.9, 1433.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 632.0, "series": [{"data": [[0.0, 632.0], [600.0, 20.0], [700.0, 7.0], [200.0, 95.0], [800.0, 12.0], [900.0, 9.0], [1000.0, 1.0], [1100.0, 2.0], [300.0, 78.0], [1200.0, 17.0], [1300.0, 8.0], [1400.0, 2.0], [100.0, 86.0], [400.0, 22.0], [500.0, 9.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 86.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 914.0, "series": [{"data": [[1.0, 86.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 914.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 9.964444444444446, "minX": 1.54958316E12, "maxY": 34.050322580645165, "series": [{"data": [[1.54958322E12, 9.964444444444446], [1.54958316E12, 34.050322580645165]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 33.5, "minX": 1.0, "maxY": 1290.3333333333333, "series": [{"data": [[2.0, 35.0], [3.0, 35.2], [4.0, 35.722222222222214], [5.0, 36.27272727272728], [6.0, 36.91189427312774], [7.0, 40.0362694300518], [8.0, 44.33749999999999], [9.0, 52.888888888888886], [10.0, 69.75], [11.0, 74.0], [12.0, 113.33333333333333], [13.0, 116.25], [14.0, 129.66666666666666], [15.0, 96.5], [16.0, 124.0], [17.0, 136.75], [18.0, 148.8], [19.0, 135.0], [20.0, 164.0], [21.0, 133.75], [22.0, 185.0], [23.0, 154.0], [24.0, 163.0], [25.0, 191.8], [26.0, 178.2], [27.0, 159.0], [28.0, 164.33333333333334], [29.0, 187.0], [30.0, 158.66666666666666], [31.0, 233.5], [32.0, 164.0], [35.0, 247.0], [34.0, 260.3333333333333], [37.0, 207.2], [36.0, 208.0], [39.0, 313.2], [38.0, 215.85714285714283], [41.0, 250.0], [43.0, 228.5], [42.0, 854.5], [44.0, 219.0], [47.0, 299.4], [46.0, 502.25], [49.0, 325.0], [48.0, 332.6666666666667], [51.0, 329.0], [50.0, 202.75], [53.0, 293.6666666666667], [52.0, 589.6666666666666], [55.0, 817.0], [54.0, 294.0], [57.0, 1282.6666666666667], [56.0, 698.6], [59.0, 782.5], [58.0, 1290.3333333333333], [61.0, 1243.5], [63.0, 546.5625], [67.0, 660.5384615384615], [66.0, 376.22222222222223], [65.0, 305.53333333333336], [64.0, 253.0], [71.0, 265.0], [70.0, 209.0], [69.0, 291.5], [68.0, 343.0], [75.0, 236.66666666666666], [74.0, 272.0], [73.0, 250.0], [72.0, 332.0], [79.0, 185.0], [78.0, 420.5], [77.0, 263.5], [76.0, 327.5], [83.0, 305.5], [82.0, 329.0], [80.0, 279.0], [87.0, 382.5], [86.0, 338.7142857142857], [85.0, 443.6], [84.0, 440.77777777777777], [89.0, 458.0], [91.0, 417.0], [90.0, 488.0], [88.0, 460.0], [92.0, 708.0], [95.0, 601.0], [94.0, 451.5], [93.0, 380.5], [99.0, 683.0], [98.0, 505.0], [97.0, 376.0], [96.0, 553.75], [102.0, 611.4], [103.0, 584.3333333333334], [101.0, 537.6666666666666], [100.0, 589.0], [107.0, 721.5], [106.0, 382.0], [105.0, 714.0], [104.0, 592.5], [109.0, 630.3333333333334], [110.0, 508.0], [111.0, 555.0], [108.0, 615.0], [113.0, 766.25], [115.0, 681.0], [114.0, 654.6], [112.0, 569.875], [118.0, 568.6666666666666], [119.0, 639.75], [117.0, 623.0], [116.0, 694.6666666666666], [121.0, 537.0], [122.0, 568.4], [123.0, 693.0], [120.0, 467.5], [1.0, 33.5]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[28.630999999999986, 178.4790000000001]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 123.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 952.5, "minX": 1.54958316E12, "maxY": 5424.1, "series": [{"data": [[1.54958322E12, 1574.2333333333333], [1.54958316E12, 5424.1]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958322E12, 952.5], [1.54958316E12, 3280.8333333333335]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 60.417777777777744, "minX": 1.54958316E12, "maxY": 212.75483870967747, "series": [{"data": [[1.54958322E12, 60.417777777777744], [1.54958316E12, 212.75483870967747]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 60.417777777777744, "minX": 1.54958316E12, "maxY": 212.7303225806451, "series": [{"data": [[1.54958322E12, 60.417777777777744], [1.54958316E12, 212.7303225806451]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.27555555555555555, "minX": 1.54958316E12, "maxY": 38.030967741935456, "series": [{"data": [[1.54958322E12, 0.27555555555555555], [1.54958316E12, 38.030967741935456]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 31.0, "minX": 1.54958316E12, "maxY": 1433.0, "series": [{"data": [[1.54958322E12, 339.0], [1.54958316E12, 1433.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958322E12, 33.0], [1.54958316E12, 31.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958322E12, 447.0999999999998], [1.54958316E12, 612.5999999999999]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958322E12, 1308.9], [1.54958316E12, 1335.44]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958322E12, 834.4999999999993], [1.54958316E12, 908.5999999999998]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 42.0, "minX": 3.0, "maxY": 43.0, "series": [{"data": [[12.0, 43.0], [3.0, 42.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 12.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 42.0, "minX": 3.0, "maxY": 43.0, "series": [{"data": [[12.0, 43.0], [3.0, 42.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 12.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.25, "minX": 1.54958316E12, "maxY": 13.416666666666666, "series": [{"data": [[1.54958322E12, 3.25], [1.54958316E12, 13.416666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 3.75, "minX": 1.54958316E12, "maxY": 12.916666666666666, "series": [{"data": [[1.54958322E12, 3.75], [1.54958316E12, 12.916666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 3.75, "minX": 1.54958316E12, "maxY": 12.916666666666666, "series": [{"data": [[1.54958322E12, 3.75], [1.54958316E12, 12.916666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Transactions Per Second"}},
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
