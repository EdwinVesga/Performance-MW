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
        data: {"result": {"minY": 23.0, "minX": 0.0, "maxY": 166.0, "series": [{"data": [[0.0, 23.0], [0.1, 23.0], [0.2, 23.0], [0.3, 23.0], [0.4, 24.0], [0.5, 24.0], [0.6, 24.0], [0.7, 24.0], [0.8, 24.0], [0.9, 24.0], [1.0, 25.0], [1.1, 25.0], [1.2, 25.0], [1.3, 25.0], [1.4, 25.0], [1.5, 25.0], [1.6, 25.0], [1.7, 25.0], [1.8, 25.0], [1.9, 25.0], [2.0, 25.0], [2.1, 25.0], [2.2, 25.0], [2.3, 25.0], [2.4, 25.0], [2.5, 25.0], [2.6, 25.0], [2.7, 25.0], [2.8, 25.0], [2.9, 25.0], [3.0, 26.0], [3.1, 26.0], [3.2, 26.0], [3.3, 26.0], [3.4, 26.0], [3.5, 26.0], [3.6, 26.0], [3.7, 26.0], [3.8, 26.0], [3.9, 26.0], [4.0, 26.0], [4.1, 26.0], [4.2, 26.0], [4.3, 26.0], [4.4, 26.0], [4.5, 26.0], [4.6, 26.0], [4.7, 26.0], [4.8, 26.0], [4.9, 26.0], [5.0, 26.0], [5.1, 26.0], [5.2, 26.0], [5.3, 26.0], [5.4, 26.0], [5.5, 26.0], [5.6, 26.0], [5.7, 26.0], [5.8, 26.0], [5.9, 26.0], [6.0, 26.0], [6.1, 26.0], [6.2, 26.0], [6.3, 26.0], [6.4, 26.0], [6.5, 26.0], [6.6, 26.0], [6.7, 26.0], [6.8, 26.0], [6.9, 26.0], [7.0, 26.0], [7.1, 26.0], [7.2, 26.0], [7.3, 26.0], [7.4, 26.0], [7.5, 26.0], [7.6, 26.0], [7.7, 26.0], [7.8, 26.0], [7.9, 26.0], [8.0, 26.0], [8.1, 26.0], [8.2, 26.0], [8.3, 26.0], [8.4, 27.0], [8.5, 27.0], [8.6, 27.0], [8.7, 27.0], [8.8, 27.0], [8.9, 27.0], [9.0, 27.0], [9.1, 27.0], [9.2, 27.0], [9.3, 27.0], [9.4, 27.0], [9.5, 27.0], [9.6, 27.0], [9.7, 27.0], [9.8, 27.0], [9.9, 27.0], [10.0, 27.0], [10.1, 27.0], [10.2, 27.0], [10.3, 27.0], [10.4, 27.0], [10.5, 27.0], [10.6, 27.0], [10.7, 27.0], [10.8, 27.0], [10.9, 27.0], [11.0, 27.0], [11.1, 27.0], [11.2, 27.0], [11.3, 27.0], [11.4, 27.0], [11.5, 27.0], [11.6, 27.0], [11.7, 27.0], [11.8, 27.0], [11.9, 27.0], [12.0, 27.0], [12.1, 27.0], [12.2, 27.0], [12.3, 27.0], [12.4, 27.0], [12.5, 27.0], [12.6, 27.0], [12.7, 27.0], [12.8, 27.0], [12.9, 27.0], [13.0, 27.0], [13.1, 27.0], [13.2, 27.0], [13.3, 27.0], [13.4, 27.0], [13.5, 27.0], [13.6, 27.0], [13.7, 27.0], [13.8, 27.0], [13.9, 27.0], [14.0, 27.0], [14.1, 27.0], [14.2, 27.0], [14.3, 27.0], [14.4, 27.0], [14.5, 27.0], [14.6, 27.0], [14.7, 27.0], [14.8, 27.0], [14.9, 27.0], [15.0, 27.0], [15.1, 27.0], [15.2, 27.0], [15.3, 27.0], [15.4, 27.0], [15.5, 27.0], [15.6, 27.0], [15.7, 27.0], [15.8, 27.0], [15.9, 27.0], [16.0, 27.0], [16.1, 27.0], [16.2, 27.0], [16.3, 27.0], [16.4, 27.0], [16.5, 27.0], [16.6, 27.0], [16.7, 27.0], [16.8, 27.0], [16.9, 27.0], [17.0, 27.0], [17.1, 27.0], [17.2, 27.0], [17.3, 27.0], [17.4, 27.0], [17.5, 27.0], [17.6, 27.0], [17.7, 27.0], [17.8, 27.0], [17.9, 27.0], [18.0, 27.0], [18.1, 27.0], [18.2, 27.0], [18.3, 27.0], [18.4, 27.0], [18.5, 27.0], [18.6, 27.0], [18.7, 27.0], [18.8, 27.0], [18.9, 27.0], [19.0, 27.0], [19.1, 27.0], [19.2, 27.0], [19.3, 27.0], [19.4, 27.0], [19.5, 27.0], [19.6, 27.0], [19.7, 27.0], [19.8, 27.0], [19.9, 27.0], [20.0, 27.0], [20.1, 27.0], [20.2, 27.0], [20.3, 27.0], [20.4, 27.0], [20.5, 27.0], [20.6, 27.0], [20.7, 28.0], [20.8, 28.0], [20.9, 28.0], [21.0, 28.0], [21.1, 28.0], [21.2, 28.0], [21.3, 28.0], [21.4, 28.0], [21.5, 28.0], [21.6, 28.0], [21.7, 28.0], [21.8, 28.0], [21.9, 28.0], [22.0, 28.0], [22.1, 28.0], [22.2, 28.0], [22.3, 28.0], [22.4, 28.0], [22.5, 28.0], [22.6, 28.0], [22.7, 28.0], [22.8, 28.0], [22.9, 28.0], [23.0, 28.0], [23.1, 28.0], [23.2, 28.0], [23.3, 28.0], [23.4, 28.0], [23.5, 28.0], [23.6, 28.0], [23.7, 28.0], [23.8, 28.0], [23.9, 28.0], [24.0, 28.0], [24.1, 28.0], [24.2, 28.0], [24.3, 28.0], [24.4, 28.0], [24.5, 28.0], [24.6, 28.0], [24.7, 28.0], [24.8, 28.0], [24.9, 28.0], [25.0, 28.0], [25.1, 28.0], [25.2, 28.0], [25.3, 28.0], [25.4, 28.0], [25.5, 28.0], [25.6, 28.0], [25.7, 28.0], [25.8, 28.0], [25.9, 28.0], [26.0, 28.0], [26.1, 28.0], [26.2, 28.0], [26.3, 28.0], [26.4, 28.0], [26.5, 28.0], [26.6, 28.0], [26.7, 28.0], [26.8, 28.0], [26.9, 28.0], [27.0, 28.0], [27.1, 28.0], [27.2, 28.0], [27.3, 28.0], [27.4, 28.0], [27.5, 28.0], [27.6, 28.0], [27.7, 28.0], [27.8, 28.0], [27.9, 28.0], [28.0, 28.0], [28.1, 28.0], [28.2, 28.0], [28.3, 28.0], [28.4, 28.0], [28.5, 28.0], [28.6, 28.0], [28.7, 28.0], [28.8, 28.0], [28.9, 28.0], [29.0, 28.0], [29.1, 28.0], [29.2, 28.0], [29.3, 28.0], [29.4, 28.0], [29.5, 28.0], [29.6, 28.0], [29.7, 28.0], [29.8, 28.0], [29.9, 28.0], [30.0, 28.0], [30.1, 28.0], [30.2, 28.0], [30.3, 28.0], [30.4, 28.0], [30.5, 28.0], [30.6, 28.0], [30.7, 28.0], [30.8, 28.0], [30.9, 28.0], [31.0, 28.0], [31.1, 28.0], [31.2, 28.0], [31.3, 28.0], [31.4, 28.0], [31.5, 28.0], [31.6, 28.0], [31.7, 28.0], [31.8, 28.0], [31.9, 28.0], [32.0, 28.0], [32.1, 28.0], [32.2, 28.0], [32.3, 28.0], [32.4, 28.0], [32.5, 28.0], [32.6, 28.0], [32.7, 28.0], [32.8, 28.0], [32.9, 28.0], [33.0, 28.0], [33.1, 28.0], [33.2, 28.0], [33.3, 28.0], [33.4, 28.0], [33.5, 28.0], [33.6, 28.0], [33.7, 28.0], [33.8, 28.0], [33.9, 28.0], [34.0, 28.0], [34.1, 28.0], [34.2, 28.0], [34.3, 28.0], [34.4, 28.0], [34.5, 28.0], [34.6, 28.0], [34.7, 28.0], [34.8, 28.0], [34.9, 28.0], [35.0, 28.0], [35.1, 28.0], [35.2, 28.0], [35.3, 28.0], [35.4, 29.0], [35.5, 29.0], [35.6, 29.0], [35.7, 29.0], [35.8, 29.0], [35.9, 29.0], [36.0, 29.0], [36.1, 29.0], [36.2, 29.0], [36.3, 29.0], [36.4, 29.0], [36.5, 29.0], [36.6, 29.0], [36.7, 29.0], [36.8, 29.0], [36.9, 29.0], [37.0, 29.0], [37.1, 29.0], [37.2, 29.0], [37.3, 29.0], [37.4, 29.0], [37.5, 29.0], [37.6, 29.0], [37.7, 29.0], [37.8, 29.0], [37.9, 29.0], [38.0, 29.0], [38.1, 29.0], [38.2, 29.0], [38.3, 29.0], [38.4, 29.0], [38.5, 29.0], [38.6, 29.0], [38.7, 29.0], [38.8, 29.0], [38.9, 29.0], [39.0, 29.0], [39.1, 29.0], [39.2, 29.0], [39.3, 29.0], [39.4, 29.0], [39.5, 29.0], [39.6, 29.0], [39.7, 29.0], [39.8, 29.0], [39.9, 29.0], [40.0, 29.0], [40.1, 29.0], [40.2, 29.0], [40.3, 29.0], [40.4, 29.0], [40.5, 29.0], [40.6, 29.0], [40.7, 29.0], [40.8, 29.0], [40.9, 29.0], [41.0, 29.0], [41.1, 29.0], [41.2, 29.0], [41.3, 29.0], [41.4, 29.0], [41.5, 29.0], [41.6, 29.0], [41.7, 29.0], [41.8, 29.0], [41.9, 29.0], [42.0, 29.0], [42.1, 29.0], [42.2, 29.0], [42.3, 29.0], [42.4, 29.0], [42.5, 29.0], [42.6, 29.0], [42.7, 29.0], [42.8, 29.0], [42.9, 29.0], [43.0, 29.0], [43.1, 29.0], [43.2, 29.0], [43.3, 29.0], [43.4, 29.0], [43.5, 29.0], [43.6, 29.0], [43.7, 29.0], [43.8, 29.0], [43.9, 29.0], [44.0, 29.0], [44.1, 29.0], [44.2, 29.0], [44.3, 29.0], [44.4, 29.0], [44.5, 29.0], [44.6, 29.0], [44.7, 29.0], [44.8, 30.0], [44.9, 30.0], [45.0, 30.0], [45.1, 30.0], [45.2, 30.0], [45.3, 30.0], [45.4, 30.0], [45.5, 30.0], [45.6, 30.0], [45.7, 30.0], [45.8, 30.0], [45.9, 30.0], [46.0, 30.0], [46.1, 30.0], [46.2, 30.0], [46.3, 30.0], [46.4, 30.0], [46.5, 30.0], [46.6, 30.0], [46.7, 30.0], [46.8, 30.0], [46.9, 30.0], [47.0, 30.0], [47.1, 30.0], [47.2, 30.0], [47.3, 30.0], [47.4, 30.0], [47.5, 30.0], [47.6, 30.0], [47.7, 30.0], [47.8, 30.0], [47.9, 30.0], [48.0, 30.0], [48.1, 30.0], [48.2, 30.0], [48.3, 30.0], [48.4, 30.0], [48.5, 30.0], [48.6, 30.0], [48.7, 30.0], [48.8, 30.0], [48.9, 30.0], [49.0, 30.0], [49.1, 30.0], [49.2, 31.0], [49.3, 31.0], [49.4, 31.0], [49.5, 31.0], [49.6, 31.0], [49.7, 31.0], [49.8, 31.0], [49.9, 31.0], [50.0, 31.0], [50.1, 31.0], [50.2, 31.0], [50.3, 31.0], [50.4, 31.0], [50.5, 31.0], [50.6, 31.0], [50.7, 31.0], [50.8, 31.0], [50.9, 31.0], [51.0, 31.0], [51.1, 31.0], [51.2, 31.0], [51.3, 31.0], [51.4, 31.0], [51.5, 31.0], [51.6, 31.0], [51.7, 31.0], [51.8, 31.0], [51.9, 31.0], [52.0, 31.0], [52.1, 32.0], [52.2, 32.0], [52.3, 32.0], [52.4, 32.0], [52.5, 32.0], [52.6, 32.0], [52.7, 32.0], [52.8, 32.0], [52.9, 32.0], [53.0, 32.0], [53.1, 32.0], [53.2, 32.0], [53.3, 32.0], [53.4, 32.0], [53.5, 32.0], [53.6, 32.0], [53.7, 32.0], [53.8, 32.0], [53.9, 32.0], [54.0, 32.0], [54.1, 32.0], [54.2, 32.0], [54.3, 33.0], [54.4, 33.0], [54.5, 33.0], [54.6, 33.0], [54.7, 33.0], [54.8, 33.0], [54.9, 33.0], [55.0, 33.0], [55.1, 33.0], [55.2, 33.0], [55.3, 33.0], [55.4, 33.0], [55.5, 33.0], [55.6, 34.0], [55.7, 34.0], [55.8, 34.0], [55.9, 34.0], [56.0, 34.0], [56.1, 34.0], [56.2, 34.0], [56.3, 34.0], [56.4, 34.0], [56.5, 34.0], [56.6, 34.0], [56.7, 34.0], [56.8, 35.0], [56.9, 35.0], [57.0, 35.0], [57.1, 35.0], [57.2, 35.0], [57.3, 35.0], [57.4, 35.0], [57.5, 35.0], [57.6, 35.0], [57.7, 35.0], [57.8, 36.0], [57.9, 36.0], [58.0, 36.0], [58.1, 36.0], [58.2, 36.0], [58.3, 36.0], [58.4, 36.0], [58.5, 36.0], [58.6, 36.0], [58.7, 36.0], [58.8, 36.0], [58.9, 37.0], [59.0, 37.0], [59.1, 37.0], [59.2, 37.0], [59.3, 37.0], [59.4, 37.0], [59.5, 37.0], [59.6, 37.0], [59.7, 37.0], [59.8, 37.0], [59.9, 37.0], [60.0, 37.0], [60.1, 38.0], [60.2, 38.0], [60.3, 38.0], [60.4, 38.0], [60.5, 38.0], [60.6, 38.0], [60.7, 38.0], [60.8, 38.0], [60.9, 38.0], [61.0, 38.0], [61.1, 38.0], [61.2, 38.0], [61.3, 39.0], [61.4, 39.0], [61.5, 39.0], [61.6, 39.0], [61.7, 39.0], [61.8, 40.0], [61.9, 40.0], [62.0, 40.0], [62.1, 40.0], [62.2, 40.0], [62.3, 40.0], [62.4, 41.0], [62.5, 41.0], [62.6, 41.0], [62.7, 41.0], [62.8, 41.0], [62.9, 41.0], [63.0, 41.0], [63.1, 42.0], [63.2, 42.0], [63.3, 42.0], [63.4, 42.0], [63.5, 42.0], [63.6, 42.0], [63.7, 43.0], [63.8, 43.0], [63.9, 43.0], [64.0, 43.0], [64.1, 43.0], [64.2, 44.0], [64.3, 44.0], [64.4, 44.0], [64.5, 45.0], [64.6, 45.0], [64.7, 45.0], [64.8, 45.0], [64.9, 45.0], [65.0, 45.0], [65.1, 45.0], [65.2, 46.0], [65.3, 46.0], [65.4, 46.0], [65.5, 46.0], [65.6, 47.0], [65.7, 47.0], [65.8, 47.0], [65.9, 47.0], [66.0, 48.0], [66.1, 48.0], [66.2, 48.0], [66.3, 48.0], [66.4, 49.0], [66.5, 49.0], [66.6, 49.0], [66.7, 49.0], [66.8, 50.0], [66.9, 50.0], [67.0, 50.0], [67.1, 51.0], [67.2, 51.0], [67.3, 51.0], [67.4, 52.0], [67.5, 52.0], [67.6, 53.0], [67.7, 53.0], [67.8, 53.0], [67.9, 54.0], [68.0, 54.0], [68.1, 54.0], [68.2, 55.0], [68.3, 55.0], [68.4, 55.0], [68.5, 56.0], [68.6, 56.0], [68.7, 56.0], [68.8, 57.0], [68.9, 57.0], [69.0, 57.0], [69.1, 58.0], [69.2, 58.0], [69.3, 58.0], [69.4, 59.0], [69.5, 59.0], [69.6, 59.0], [69.7, 60.0], [69.8, 61.0], [69.9, 61.0], [70.0, 62.0], [70.1, 62.0], [70.2, 62.0], [70.3, 63.0], [70.4, 63.0], [70.5, 63.0], [70.6, 63.0], [70.7, 64.0], [70.8, 64.0], [70.9, 64.0], [71.0, 65.0], [71.1, 65.0], [71.2, 66.0], [71.3, 66.0], [71.4, 66.0], [71.5, 67.0], [71.6, 68.0], [71.7, 68.0], [71.8, 68.0], [71.9, 69.0], [72.0, 69.0], [72.1, 69.0], [72.2, 70.0], [72.3, 70.0], [72.4, 70.0], [72.5, 70.0], [72.6, 71.0], [72.7, 71.0], [72.8, 71.0], [72.9, 72.0], [73.0, 72.0], [73.1, 72.0], [73.2, 73.0], [73.3, 74.0], [73.4, 74.0], [73.5, 75.0], [73.6, 75.0], [73.7, 75.0], [73.8, 76.0], [73.9, 76.0], [74.0, 76.0], [74.1, 77.0], [74.2, 77.0], [74.3, 77.0], [74.4, 78.0], [74.5, 78.0], [74.6, 78.0], [74.7, 79.0], [74.8, 79.0], [74.9, 80.0], [75.0, 80.0], [75.1, 81.0], [75.2, 81.0], [75.3, 81.0], [75.4, 82.0], [75.5, 82.0], [75.6, 82.0], [75.7, 83.0], [75.8, 83.0], [75.9, 84.0], [76.0, 84.0], [76.1, 85.0], [76.2, 85.0], [76.3, 85.0], [76.4, 86.0], [76.5, 86.0], [76.6, 87.0], [76.7, 87.0], [76.8, 87.0], [76.9, 87.0], [77.0, 87.0], [77.1, 88.0], [77.2, 88.0], [77.3, 88.0], [77.4, 88.0], [77.5, 89.0], [77.6, 89.0], [77.7, 90.0], [77.8, 90.0], [77.9, 90.0], [78.0, 90.0], [78.1, 90.0], [78.2, 91.0], [78.3, 91.0], [78.4, 91.0], [78.5, 91.0], [78.6, 92.0], [78.7, 92.0], [78.8, 92.0], [78.9, 93.0], [79.0, 93.0], [79.1, 93.0], [79.2, 94.0], [79.3, 94.0], [79.4, 94.0], [79.5, 94.0], [79.6, 94.0], [79.7, 95.0], [79.8, 95.0], [79.9, 95.0], [80.0, 95.0], [80.1, 96.0], [80.2, 96.0], [80.3, 96.0], [80.4, 97.0], [80.5, 97.0], [80.6, 97.0], [80.7, 97.0], [80.8, 98.0], [80.9, 98.0], [81.0, 98.0], [81.1, 98.0], [81.2, 98.0], [81.3, 98.0], [81.4, 99.0], [81.5, 99.0], [81.6, 99.0], [81.7, 99.0], [81.8, 100.0], [81.9, 100.0], [82.0, 100.0], [82.1, 100.0], [82.2, 100.0], [82.3, 100.0], [82.4, 101.0], [82.5, 101.0], [82.6, 101.0], [82.7, 101.0], [82.8, 101.0], [82.9, 101.0], [83.0, 102.0], [83.1, 102.0], [83.2, 102.0], [83.3, 102.0], [83.4, 102.0], [83.5, 102.0], [83.6, 102.0], [83.7, 103.0], [83.8, 103.0], [83.9, 103.0], [84.0, 103.0], [84.1, 103.0], [84.2, 104.0], [84.3, 104.0], [84.4, 104.0], [84.5, 104.0], [84.6, 104.0], [84.7, 105.0], [84.8, 105.0], [84.9, 105.0], [85.0, 105.0], [85.1, 105.0], [85.2, 105.0], [85.3, 106.0], [85.4, 106.0], [85.5, 106.0], [85.6, 106.0], [85.7, 107.0], [85.8, 107.0], [85.9, 107.0], [86.0, 107.0], [86.1, 108.0], [86.2, 108.0], [86.3, 108.0], [86.4, 108.0], [86.5, 109.0], [86.6, 109.0], [86.7, 109.0], [86.8, 109.0], [86.9, 109.0], [87.0, 109.0], [87.1, 110.0], [87.2, 110.0], [87.3, 110.0], [87.4, 110.0], [87.5, 111.0], [87.6, 111.0], [87.7, 111.0], [87.8, 111.0], [87.9, 111.0], [88.0, 112.0], [88.1, 112.0], [88.2, 113.0], [88.3, 113.0], [88.4, 113.0], [88.5, 113.0], [88.6, 114.0], [88.7, 114.0], [88.8, 114.0], [88.9, 114.0], [89.0, 115.0], [89.1, 115.0], [89.2, 115.0], [89.3, 115.0], [89.4, 115.0], [89.5, 116.0], [89.6, 116.0], [89.7, 116.0], [89.8, 116.0], [89.9, 117.0], [90.0, 117.0], [90.1, 117.0], [90.2, 117.0], [90.3, 118.0], [90.4, 118.0], [90.5, 118.0], [90.6, 119.0], [90.7, 119.0], [90.8, 119.0], [90.9, 119.0], [91.0, 120.0], [91.1, 120.0], [91.2, 120.0], [91.3, 120.0], [91.4, 120.0], [91.5, 121.0], [91.6, 121.0], [91.7, 121.0], [91.8, 121.0], [91.9, 121.0], [92.0, 122.0], [92.1, 122.0], [92.2, 123.0], [92.3, 123.0], [92.4, 123.0], [92.5, 123.0], [92.6, 123.0], [92.7, 124.0], [92.8, 124.0], [92.9, 124.0], [93.0, 124.0], [93.1, 124.0], [93.2, 125.0], [93.3, 125.0], [93.4, 125.0], [93.5, 125.0], [93.6, 126.0], [93.7, 127.0], [93.8, 127.0], [93.9, 128.0], [94.0, 128.0], [94.1, 128.0], [94.2, 128.0], [94.3, 129.0], [94.4, 129.0], [94.5, 130.0], [94.6, 130.0], [94.7, 130.0], [94.8, 130.0], [94.9, 130.0], [95.0, 131.0], [95.1, 131.0], [95.2, 131.0], [95.3, 131.0], [95.4, 131.0], [95.5, 132.0], [95.6, 132.0], [95.7, 133.0], [95.8, 133.0], [95.9, 133.0], [96.0, 133.0], [96.1, 134.0], [96.2, 134.0], [96.3, 134.0], [96.4, 135.0], [96.5, 135.0], [96.6, 136.0], [96.7, 136.0], [96.8, 136.0], [96.9, 137.0], [97.0, 137.0], [97.1, 137.0], [97.2, 138.0], [97.3, 138.0], [97.4, 138.0], [97.5, 139.0], [97.6, 139.0], [97.7, 139.0], [97.8, 140.0], [97.9, 141.0], [98.0, 143.0], [98.1, 143.0], [98.2, 144.0], [98.3, 144.0], [98.4, 145.0], [98.5, 145.0], [98.6, 145.0], [98.7, 146.0], [98.8, 148.0], [98.9, 148.0], [99.0, 149.0], [99.1, 150.0], [99.2, 151.0], [99.3, 152.0], [99.4, 153.0], [99.5, 158.0], [99.6, 158.0], [99.7, 159.0], [99.8, 162.0], [99.9, 164.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 546.0, "minX": 0.0, "maxY": 2454.0, "series": [{"data": [[0.0, 2454.0], [100.0, 546.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 3000.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 3000.0, "series": [{"data": [[0.0, 3000.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 4.9E-324, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 22.805999999999997, "minX": 1.5494805E12, "maxY": 22.805999999999997, "series": [{"data": [[1.5494805E12, 22.805999999999997]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5494805E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 25.5625, "minX": 1.0, "maxY": 157.33333333333334, "series": [{"data": [[2.0, 50.66666666666667], [3.0, 35.375], [4.0, 25.5625], [5.0, 32.61764705882353], [6.0, 29.451612903225808], [7.0, 27.684210526315795], [8.0, 29.333333333333332], [9.0, 37.43902439024391], [10.0, 31.985294117647058], [11.0, 30.82758620689655], [12.0, 29.122093023255818], [13.0, 28.094876660341537], [14.0, 29.296983758700684], [15.0, 31.318181818181813], [16.0, 34.192307692307686], [17.0, 38.828571428571415], [18.0, 44.877192982456144], [19.0, 44.09677419354838], [20.0, 48.58823529411765], [21.0, 44.62068965517241], [22.0, 51.46341463414633], [23.0, 58.05], [24.0, 63.66666666666666], [25.0, 62.9142857142857], [26.0, 68.08000000000001], [27.0, 70.2777777777778], [28.0, 66.17241379310346], [29.0, 67.77272727272728], [30.0, 75.4], [31.0, 73.73333333333332], [33.0, 81.3809523809524], [32.0, 79.52380952380953], [35.0, 88.56521739130434], [34.0, 83.87500000000001], [37.0, 85.85], [36.0, 83.61538461538461], [39.0, 94.90909090909089], [38.0, 90.73913043478262], [40.0, 99.82758620689657], [41.0, 94.3913043478261], [42.0, 97.1851851851852], [43.0, 99.35714285714285], [44.0, 101.51851851851853], [45.0, 108.72], [46.0, 105.16666666666664], [47.0, 104.5], [48.0, 109.96666666666667], [49.0, 113.51351351351352], [51.0, 116.3666666666667], [50.0, 115.43243243243245], [52.0, 121.55555555555556], [53.0, 129.1428571428571], [54.0, 128.66666666666666], [55.0, 130.53846153846152], [56.0, 128.0], [57.0, 136.87499999999997], [59.0, 123.8], [58.0, 125.91666666666667], [61.0, 135.85714285714283], [60.0, 132.46666666666667], [62.0, 134.56250000000003], [63.0, 131.45454545454547], [65.0, 144.66666666666666], [67.0, 134.66666666666669], [66.0, 155.0], [64.0, 137.99999999999997], [69.0, 152.0], [71.0, 148.0], [70.0, 157.33333333333334], [68.0, 132.4], [1.0, 51.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[22.805999999999997, 53.65333333333334]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 71.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 18850.0, "minX": 1.5494805E12, "maxY": 19450.0, "series": [{"data": [[1.5494805E12, 19450.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5494805E12, 18850.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5494805E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 53.65333333333334, "minX": 1.5494805E12, "maxY": 53.65333333333334, "series": [{"data": [[1.5494805E12, 53.65333333333334]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5494805E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 53.64566666666663, "minX": 1.5494805E12, "maxY": 53.64566666666663, "series": [{"data": [[1.5494805E12, 53.64566666666663]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5494805E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.7436666666666671, "minX": 1.5494805E12, "maxY": 0.7436666666666671, "series": [{"data": [[1.5494805E12, 0.7436666666666671]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5494805E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 23.0, "minX": 1.5494805E12, "maxY": 166.0, "series": [{"data": [[1.5494805E12, 166.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5494805E12, 23.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5494805E12, 117.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5494805E12, 149.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5494805E12, 130.94999999999982]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5494805E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 31.0, "minX": 50.0, "maxY": 31.0, "series": [{"data": [[50.0, 31.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 31.0, "minX": 50.0, "maxY": 31.0, "series": [{"data": [[50.0, 31.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5494805E12, "maxY": 50.0, "series": [{"data": [[1.5494805E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5494805E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5494805E12, "maxY": 50.0, "series": [{"data": [[1.5494805E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5494805E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5494805E12, "maxY": 50.0, "series": [{"data": [[1.5494805E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5494805E12, "title": "Transactions Per Second"}},
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
