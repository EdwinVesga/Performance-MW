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
        data: {"result": {"minY": 27.0, "minX": 0.0, "maxY": 1038.0, "series": [{"data": [[0.0, 27.0], [0.1, 27.0], [0.2, 27.0], [0.3, 27.0], [0.4, 27.0], [0.5, 27.0], [0.6, 27.0], [0.7, 27.0], [0.8, 28.0], [0.9, 28.0], [1.0, 28.0], [1.1, 28.0], [1.2, 28.0], [1.3, 28.0], [1.4, 28.0], [1.5, 28.0], [1.6, 28.0], [1.7, 28.0], [1.8, 28.0], [1.9, 28.0], [2.0, 28.0], [2.1, 28.0], [2.2, 28.0], [2.3, 28.0], [2.4, 28.0], [2.5, 28.0], [2.6, 28.0], [2.7, 28.0], [2.8, 28.0], [2.9, 28.0], [3.0, 28.0], [3.1, 28.0], [3.2, 28.0], [3.3, 28.0], [3.4, 28.0], [3.5, 28.0], [3.6, 28.0], [3.7, 29.0], [3.8, 29.0], [3.9, 29.0], [4.0, 29.0], [4.1, 29.0], [4.2, 29.0], [4.3, 29.0], [4.4, 29.0], [4.5, 29.0], [4.6, 29.0], [4.7, 29.0], [4.8, 29.0], [4.9, 29.0], [5.0, 29.0], [5.1, 29.0], [5.2, 29.0], [5.3, 29.0], [5.4, 29.0], [5.5, 29.0], [5.6, 29.0], [5.7, 29.0], [5.8, 29.0], [5.9, 29.0], [6.0, 29.0], [6.1, 29.0], [6.2, 29.0], [6.3, 29.0], [6.4, 29.0], [6.5, 29.0], [6.6, 29.0], [6.7, 29.0], [6.8, 29.0], [6.9, 29.0], [7.0, 29.0], [7.1, 29.0], [7.2, 29.0], [7.3, 29.0], [7.4, 29.0], [7.5, 29.0], [7.6, 29.0], [7.7, 29.0], [7.8, 29.0], [7.9, 29.0], [8.0, 29.0], [8.1, 29.0], [8.2, 29.0], [8.3, 29.0], [8.4, 29.0], [8.5, 29.0], [8.6, 29.0], [8.7, 29.0], [8.8, 29.0], [8.9, 29.0], [9.0, 29.0], [9.1, 29.0], [9.2, 29.0], [9.3, 29.0], [9.4, 29.0], [9.5, 29.0], [9.6, 29.0], [9.7, 29.0], [9.8, 30.0], [9.9, 30.0], [10.0, 30.0], [10.1, 30.0], [10.2, 30.0], [10.3, 30.0], [10.4, 30.0], [10.5, 30.0], [10.6, 30.0], [10.7, 30.0], [10.8, 30.0], [10.9, 30.0], [11.0, 30.0], [11.1, 30.0], [11.2, 30.0], [11.3, 30.0], [11.4, 30.0], [11.5, 30.0], [11.6, 30.0], [11.7, 30.0], [11.8, 30.0], [11.9, 30.0], [12.0, 30.0], [12.1, 30.0], [12.2, 30.0], [12.3, 30.0], [12.4, 30.0], [12.5, 30.0], [12.6, 30.0], [12.7, 30.0], [12.8, 30.0], [12.9, 30.0], [13.0, 30.0], [13.1, 30.0], [13.2, 30.0], [13.3, 30.0], [13.4, 30.0], [13.5, 30.0], [13.6, 30.0], [13.7, 30.0], [13.8, 30.0], [13.9, 30.0], [14.0, 30.0], [14.1, 30.0], [14.2, 30.0], [14.3, 30.0], [14.4, 30.0], [14.5, 30.0], [14.6, 30.0], [14.7, 30.0], [14.8, 30.0], [14.9, 30.0], [15.0, 30.0], [15.1, 30.0], [15.2, 30.0], [15.3, 30.0], [15.4, 30.0], [15.5, 30.0], [15.6, 30.0], [15.7, 30.0], [15.8, 30.0], [15.9, 30.0], [16.0, 30.0], [16.1, 30.0], [16.2, 30.0], [16.3, 30.0], [16.4, 30.0], [16.5, 30.0], [16.6, 30.0], [16.7, 30.0], [16.8, 30.0], [16.9, 30.0], [17.0, 30.0], [17.1, 30.0], [17.2, 30.0], [17.3, 30.0], [17.4, 30.0], [17.5, 30.0], [17.6, 30.0], [17.7, 30.0], [17.8, 30.0], [17.9, 30.0], [18.0, 30.0], [18.1, 30.0], [18.2, 30.0], [18.3, 30.0], [18.4, 30.0], [18.5, 30.0], [18.6, 30.0], [18.7, 30.0], [18.8, 30.0], [18.9, 30.0], [19.0, 30.0], [19.1, 30.0], [19.2, 30.0], [19.3, 30.0], [19.4, 30.0], [19.5, 30.0], [19.6, 30.0], [19.7, 30.0], [19.8, 30.0], [19.9, 30.0], [20.0, 30.0], [20.1, 30.0], [20.2, 30.0], [20.3, 30.0], [20.4, 30.0], [20.5, 30.0], [20.6, 30.0], [20.7, 30.0], [20.8, 30.0], [20.9, 30.0], [21.0, 30.0], [21.1, 30.0], [21.2, 30.0], [21.3, 30.0], [21.4, 30.0], [21.5, 30.0], [21.6, 30.0], [21.7, 30.0], [21.8, 30.0], [21.9, 30.0], [22.0, 30.0], [22.1, 31.0], [22.2, 31.0], [22.3, 31.0], [22.4, 31.0], [22.5, 31.0], [22.6, 31.0], [22.7, 31.0], [22.8, 31.0], [22.9, 31.0], [23.0, 31.0], [23.1, 31.0], [23.2, 31.0], [23.3, 31.0], [23.4, 31.0], [23.5, 31.0], [23.6, 31.0], [23.7, 31.0], [23.8, 31.0], [23.9, 31.0], [24.0, 31.0], [24.1, 31.0], [24.2, 31.0], [24.3, 31.0], [24.4, 31.0], [24.5, 31.0], [24.6, 31.0], [24.7, 31.0], [24.8, 31.0], [24.9, 31.0], [25.0, 31.0], [25.1, 31.0], [25.2, 31.0], [25.3, 31.0], [25.4, 31.0], [25.5, 31.0], [25.6, 31.0], [25.7, 31.0], [25.8, 31.0], [25.9, 31.0], [26.0, 31.0], [26.1, 31.0], [26.2, 31.0], [26.3, 31.0], [26.4, 31.0], [26.5, 31.0], [26.6, 31.0], [26.7, 31.0], [26.8, 31.0], [26.9, 31.0], [27.0, 31.0], [27.1, 31.0], [27.2, 31.0], [27.3, 31.0], [27.4, 31.0], [27.5, 31.0], [27.6, 31.0], [27.7, 31.0], [27.8, 31.0], [27.9, 31.0], [28.0, 31.0], [28.1, 31.0], [28.2, 31.0], [28.3, 31.0], [28.4, 31.0], [28.5, 31.0], [28.6, 31.0], [28.7, 31.0], [28.8, 31.0], [28.9, 31.0], [29.0, 31.0], [29.1, 31.0], [29.2, 31.0], [29.3, 31.0], [29.4, 31.0], [29.5, 31.0], [29.6, 31.0], [29.7, 31.0], [29.8, 31.0], [29.9, 31.0], [30.0, 31.0], [30.1, 31.0], [30.2, 31.0], [30.3, 31.0], [30.4, 31.0], [30.5, 31.0], [30.6, 31.0], [30.7, 31.0], [30.8, 31.0], [30.9, 31.0], [31.0, 31.0], [31.1, 31.0], [31.2, 31.0], [31.3, 31.0], [31.4, 31.0], [31.5, 31.0], [31.6, 31.0], [31.7, 31.0], [31.8, 31.0], [31.9, 31.0], [32.0, 31.0], [32.1, 31.0], [32.2, 31.0], [32.3, 31.0], [32.4, 31.0], [32.5, 31.0], [32.6, 31.0], [32.7, 31.0], [32.8, 31.0], [32.9, 31.0], [33.0, 31.0], [33.1, 31.0], [33.2, 31.0], [33.3, 31.0], [33.4, 31.0], [33.5, 31.0], [33.6, 31.0], [33.7, 31.0], [33.8, 31.0], [33.9, 31.0], [34.0, 31.0], [34.1, 31.0], [34.2, 31.0], [34.3, 31.0], [34.4, 31.0], [34.5, 31.0], [34.6, 31.0], [34.7, 31.0], [34.8, 31.0], [34.9, 31.0], [35.0, 31.0], [35.1, 31.0], [35.2, 31.0], [35.3, 31.0], [35.4, 31.0], [35.5, 31.0], [35.6, 32.0], [35.7, 32.0], [35.8, 32.0], [35.9, 32.0], [36.0, 32.0], [36.1, 32.0], [36.2, 32.0], [36.3, 32.0], [36.4, 32.0], [36.5, 32.0], [36.6, 32.0], [36.7, 32.0], [36.8, 32.0], [36.9, 32.0], [37.0, 32.0], [37.1, 32.0], [37.2, 32.0], [37.3, 32.0], [37.4, 32.0], [37.5, 32.0], [37.6, 32.0], [37.7, 32.0], [37.8, 32.0], [37.9, 32.0], [38.0, 32.0], [38.1, 32.0], [38.2, 32.0], [38.3, 32.0], [38.4, 32.0], [38.5, 32.0], [38.6, 32.0], [38.7, 32.0], [38.8, 32.0], [38.9, 32.0], [39.0, 32.0], [39.1, 32.0], [39.2, 32.0], [39.3, 32.0], [39.4, 32.0], [39.5, 32.0], [39.6, 32.0], [39.7, 32.0], [39.8, 32.0], [39.9, 32.0], [40.0, 32.0], [40.1, 32.0], [40.2, 32.0], [40.3, 32.0], [40.4, 32.0], [40.5, 32.0], [40.6, 32.0], [40.7, 32.0], [40.8, 32.0], [40.9, 32.0], [41.0, 32.0], [41.1, 32.0], [41.2, 32.0], [41.3, 32.0], [41.4, 32.0], [41.5, 32.0], [41.6, 32.0], [41.7, 32.0], [41.8, 32.0], [41.9, 32.0], [42.0, 32.0], [42.1, 32.0], [42.2, 32.0], [42.3, 32.0], [42.4, 32.0], [42.5, 32.0], [42.6, 32.0], [42.7, 32.0], [42.8, 32.0], [42.9, 32.0], [43.0, 32.0], [43.1, 32.0], [43.2, 32.0], [43.3, 32.0], [43.4, 32.0], [43.5, 32.0], [43.6, 32.0], [43.7, 32.0], [43.8, 32.0], [43.9, 32.0], [44.0, 32.0], [44.1, 32.0], [44.2, 32.0], [44.3, 32.0], [44.4, 32.0], [44.5, 32.0], [44.6, 32.0], [44.7, 32.0], [44.8, 32.0], [44.9, 32.0], [45.0, 32.0], [45.1, 32.0], [45.2, 32.0], [45.3, 32.0], [45.4, 32.0], [45.5, 32.0], [45.6, 32.0], [45.7, 32.0], [45.8, 32.0], [45.9, 32.0], [46.0, 32.0], [46.1, 32.0], [46.2, 32.0], [46.3, 32.0], [46.4, 32.0], [46.5, 32.0], [46.6, 32.0], [46.7, 32.0], [46.8, 32.0], [46.9, 32.0], [47.0, 32.0], [47.1, 32.0], [47.2, 32.0], [47.3, 32.0], [47.4, 32.0], [47.5, 32.0], [47.6, 32.0], [47.7, 32.0], [47.8, 32.0], [47.9, 32.0], [48.0, 32.0], [48.1, 32.0], [48.2, 32.0], [48.3, 32.0], [48.4, 32.0], [48.5, 32.0], [48.6, 32.0], [48.7, 32.0], [48.8, 32.0], [48.9, 32.0], [49.0, 32.0], [49.1, 32.0], [49.2, 32.0], [49.3, 32.0], [49.4, 32.0], [49.5, 32.0], [49.6, 32.0], [49.7, 32.0], [49.8, 32.0], [49.9, 32.0], [50.0, 32.0], [50.1, 32.0], [50.2, 32.0], [50.3, 32.0], [50.4, 32.0], [50.5, 32.0], [50.6, 32.0], [50.7, 32.0], [50.8, 32.0], [50.9, 32.0], [51.0, 33.0], [51.1, 33.0], [51.2, 33.0], [51.3, 33.0], [51.4, 33.0], [51.5, 33.0], [51.6, 33.0], [51.7, 33.0], [51.8, 33.0], [51.9, 33.0], [52.0, 33.0], [52.1, 33.0], [52.2, 33.0], [52.3, 33.0], [52.4, 33.0], [52.5, 33.0], [52.6, 33.0], [52.7, 33.0], [52.8, 33.0], [52.9, 33.0], [53.0, 33.0], [53.1, 33.0], [53.2, 33.0], [53.3, 33.0], [53.4, 33.0], [53.5, 33.0], [53.6, 33.0], [53.7, 33.0], [53.8, 33.0], [53.9, 33.0], [54.0, 33.0], [54.1, 33.0], [54.2, 33.0], [54.3, 33.0], [54.4, 33.0], [54.5, 33.0], [54.6, 33.0], [54.7, 33.0], [54.8, 33.0], [54.9, 33.0], [55.0, 33.0], [55.1, 33.0], [55.2, 33.0], [55.3, 33.0], [55.4, 33.0], [55.5, 33.0], [55.6, 33.0], [55.7, 33.0], [55.8, 33.0], [55.9, 33.0], [56.0, 33.0], [56.1, 33.0], [56.2, 33.0], [56.3, 33.0], [56.4, 33.0], [56.5, 33.0], [56.6, 33.0], [56.7, 33.0], [56.8, 33.0], [56.9, 33.0], [57.0, 33.0], [57.1, 33.0], [57.2, 33.0], [57.3, 33.0], [57.4, 33.0], [57.5, 33.0], [57.6, 33.0], [57.7, 33.0], [57.8, 33.0], [57.9, 33.0], [58.0, 33.0], [58.1, 33.0], [58.2, 33.0], [58.3, 33.0], [58.4, 33.0], [58.5, 33.0], [58.6, 33.0], [58.7, 33.0], [58.8, 33.0], [58.9, 33.0], [59.0, 33.0], [59.1, 33.0], [59.2, 33.0], [59.3, 33.0], [59.4, 33.0], [59.5, 33.0], [59.6, 33.0], [59.7, 33.0], [59.8, 33.0], [59.9, 33.0], [60.0, 33.0], [60.1, 33.0], [60.2, 33.0], [60.3, 33.0], [60.4, 33.0], [60.5, 33.0], [60.6, 33.0], [60.7, 33.0], [60.8, 33.0], [60.9, 33.0], [61.0, 33.0], [61.1, 33.0], [61.2, 33.0], [61.3, 33.0], [61.4, 33.0], [61.5, 33.0], [61.6, 33.0], [61.7, 33.0], [61.8, 33.0], [61.9, 33.0], [62.0, 33.0], [62.1, 33.0], [62.2, 33.0], [62.3, 33.0], [62.4, 33.0], [62.5, 33.0], [62.6, 33.0], [62.7, 33.0], [62.8, 33.0], [62.9, 34.0], [63.0, 34.0], [63.1, 34.0], [63.2, 34.0], [63.3, 34.0], [63.4, 34.0], [63.5, 34.0], [63.6, 34.0], [63.7, 34.0], [63.8, 34.0], [63.9, 34.0], [64.0, 34.0], [64.1, 34.0], [64.2, 34.0], [64.3, 34.0], [64.4, 34.0], [64.5, 34.0], [64.6, 34.0], [64.7, 34.0], [64.8, 34.0], [64.9, 34.0], [65.0, 34.0], [65.1, 34.0], [65.2, 34.0], [65.3, 34.0], [65.4, 34.0], [65.5, 34.0], [65.6, 34.0], [65.7, 34.0], [65.8, 34.0], [65.9, 34.0], [66.0, 34.0], [66.1, 34.0], [66.2, 34.0], [66.3, 34.0], [66.4, 34.0], [66.5, 34.0], [66.6, 34.0], [66.7, 34.0], [66.8, 34.0], [66.9, 34.0], [67.0, 34.0], [67.1, 34.0], [67.2, 34.0], [67.3, 34.0], [67.4, 34.0], [67.5, 34.0], [67.6, 34.0], [67.7, 34.0], [67.8, 34.0], [67.9, 34.0], [68.0, 34.0], [68.1, 34.0], [68.2, 34.0], [68.3, 34.0], [68.4, 34.0], [68.5, 34.0], [68.6, 34.0], [68.7, 34.0], [68.8, 34.0], [68.9, 34.0], [69.0, 34.0], [69.1, 34.0], [69.2, 34.0], [69.3, 34.0], [69.4, 34.0], [69.5, 34.0], [69.6, 34.0], [69.7, 34.0], [69.8, 34.0], [69.9, 35.0], [70.0, 35.0], [70.1, 35.0], [70.2, 35.0], [70.3, 35.0], [70.4, 35.0], [70.5, 35.0], [70.6, 35.0], [70.7, 35.0], [70.8, 35.0], [70.9, 35.0], [71.0, 35.0], [71.1, 35.0], [71.2, 35.0], [71.3, 35.0], [71.4, 35.0], [71.5, 35.0], [71.6, 35.0], [71.7, 35.0], [71.8, 35.0], [71.9, 35.0], [72.0, 35.0], [72.1, 35.0], [72.2, 35.0], [72.3, 35.0], [72.4, 35.0], [72.5, 35.0], [72.6, 35.0], [72.7, 35.0], [72.8, 35.0], [72.9, 35.0], [73.0, 35.0], [73.1, 35.0], [73.2, 35.0], [73.3, 35.0], [73.4, 35.0], [73.5, 35.0], [73.6, 35.0], [73.7, 35.0], [73.8, 35.0], [73.9, 35.0], [74.0, 35.0], [74.1, 35.0], [74.2, 35.0], [74.3, 35.0], [74.4, 35.0], [74.5, 35.0], [74.6, 35.0], [74.7, 35.0], [74.8, 35.0], [74.9, 35.0], [75.0, 35.0], [75.1, 35.0], [75.2, 35.0], [75.3, 35.0], [75.4, 35.0], [75.5, 35.0], [75.6, 35.0], [75.7, 35.0], [75.8, 35.0], [75.9, 36.0], [76.0, 36.0], [76.1, 36.0], [76.2, 36.0], [76.3, 36.0], [76.4, 36.0], [76.5, 36.0], [76.6, 36.0], [76.7, 36.0], [76.8, 36.0], [76.9, 36.0], [77.0, 36.0], [77.1, 36.0], [77.2, 36.0], [77.3, 36.0], [77.4, 36.0], [77.5, 36.0], [77.6, 36.0], [77.7, 36.0], [77.8, 36.0], [77.9, 36.0], [78.0, 36.0], [78.1, 36.0], [78.2, 36.0], [78.3, 36.0], [78.4, 36.0], [78.5, 36.0], [78.6, 36.0], [78.7, 36.0], [78.8, 36.0], [78.9, 36.0], [79.0, 36.0], [79.1, 36.0], [79.2, 36.0], [79.3, 36.0], [79.4, 36.0], [79.5, 36.0], [79.6, 36.0], [79.7, 36.0], [79.8, 37.0], [79.9, 37.0], [80.0, 37.0], [80.1, 37.0], [80.2, 37.0], [80.3, 37.0], [80.4, 37.0], [80.5, 37.0], [80.6, 37.0], [80.7, 37.0], [80.8, 37.0], [80.9, 37.0], [81.0, 37.0], [81.1, 37.0], [81.2, 37.0], [81.3, 37.0], [81.4, 37.0], [81.5, 37.0], [81.6, 37.0], [81.7, 37.0], [81.8, 37.0], [81.9, 37.0], [82.0, 37.0], [82.1, 37.0], [82.2, 37.0], [82.3, 37.0], [82.4, 38.0], [82.5, 38.0], [82.6, 38.0], [82.7, 38.0], [82.8, 38.0], [82.9, 38.0], [83.0, 38.0], [83.1, 38.0], [83.2, 38.0], [83.3, 38.0], [83.4, 39.0], [83.5, 39.0], [83.6, 39.0], [83.7, 39.0], [83.8, 39.0], [83.9, 39.0], [84.0, 39.0], [84.1, 39.0], [84.2, 39.0], [84.3, 40.0], [84.4, 40.0], [84.5, 40.0], [84.6, 40.0], [84.7, 40.0], [84.8, 40.0], [84.9, 40.0], [85.0, 40.0], [85.1, 41.0], [85.2, 41.0], [85.3, 41.0], [85.4, 41.0], [85.5, 41.0], [85.6, 41.0], [85.7, 43.0], [85.8, 43.0], [85.9, 43.0], [86.0, 44.0], [86.1, 44.0], [86.2, 45.0], [86.3, 46.0], [86.4, 46.0], [86.5, 46.0], [86.6, 48.0], [86.7, 48.0], [86.8, 48.0], [86.9, 49.0], [87.0, 49.0], [87.1, 49.0], [87.2, 50.0], [87.3, 52.0], [87.4, 56.0], [87.5, 57.0], [87.6, 63.0], [87.7, 65.0], [87.8, 67.0], [87.9, 71.0], [88.0, 71.0], [88.1, 73.0], [88.2, 73.0], [88.3, 74.0], [88.4, 78.0], [88.5, 86.0], [88.6, 88.0], [88.7, 92.0], [88.8, 94.0], [88.9, 105.0], [89.0, 105.0], [89.1, 107.0], [89.2, 108.0], [89.3, 113.0], [89.4, 113.0], [89.5, 114.0], [89.6, 119.0], [89.7, 128.0], [89.8, 135.0], [89.9, 137.0], [90.0, 138.0], [90.1, 138.0], [90.2, 145.0], [90.3, 159.0], [90.4, 171.0], [90.5, 176.0], [90.6, 183.0], [90.7, 186.0], [90.8, 195.0], [90.9, 201.0], [91.0, 201.0], [91.1, 202.0], [91.2, 202.0], [91.3, 204.0], [91.4, 204.0], [91.5, 206.0], [91.6, 207.0], [91.7, 208.0], [91.8, 214.0], [91.9, 215.0], [92.0, 225.0], [92.1, 242.0], [92.2, 242.0], [92.3, 250.0], [92.4, 254.0], [92.5, 254.0], [92.6, 261.0], [92.7, 261.0], [92.8, 280.0], [92.9, 281.0], [93.0, 293.0], [93.1, 297.0], [93.2, 301.0], [93.3, 303.0], [93.4, 312.0], [93.5, 321.0], [93.6, 328.0], [93.7, 344.0], [93.8, 348.0], [93.9, 358.0], [94.0, 384.0], [94.1, 386.0], [94.2, 391.0], [94.3, 399.0], [94.4, 401.0], [94.5, 413.0], [94.6, 439.0], [94.7, 443.0], [94.8, 454.0], [94.9, 455.0], [95.0, 470.0], [95.1, 482.0], [95.2, 490.0], [95.3, 500.0], [95.4, 501.0], [95.5, 510.0], [95.6, 520.0], [95.7, 527.0], [95.8, 535.0], [95.9, 557.0], [96.0, 557.0], [96.1, 566.0], [96.2, 589.0], [96.3, 593.0], [96.4, 598.0], [96.5, 609.0], [96.6, 626.0], [96.7, 629.0], [96.8, 637.0], [96.9, 640.0], [97.0, 645.0], [97.1, 649.0], [97.2, 662.0], [97.3, 678.0], [97.4, 684.0], [97.5, 691.0], [97.6, 693.0], [97.7, 699.0], [97.8, 712.0], [97.9, 717.0], [98.0, 725.0], [98.1, 725.0], [98.2, 747.0], [98.3, 758.0], [98.4, 778.0], [98.5, 781.0], [98.6, 786.0], [98.7, 787.0], [98.8, 815.0], [98.9, 816.0], [99.0, 819.0], [99.1, 837.0], [99.2, 838.0], [99.3, 850.0], [99.4, 886.0], [99.5, 917.0], [99.6, 919.0], [99.7, 1033.0], [99.8, 1033.0], [99.9, 1038.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 889.0, "series": [{"data": [[0.0, 889.0], [600.0, 13.0], [300.0, 12.0], [700.0, 10.0], [200.0, 23.0], [100.0, 20.0], [400.0, 9.0], [800.0, 7.0], [900.0, 2.0], [500.0, 12.0], [1000.0, 3.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 46.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 954.0, "series": [{"data": [[1.0, 46.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 954.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 8.105999999999986, "minX": 1.54961916E12, "maxY": 8.105999999999986, "series": [{"data": [[1.54961916E12, 8.105999999999986]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961916E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 29.0, "minX": 1.0, "maxY": 919.0, "series": [{"data": [[2.0, 30.555555555555557], [3.0, 30.23376623376625], [4.0, 33.14074074074073], [5.0, 109.30000000000001], [6.0, 31.750000000000004], [7.0, 61.34210526315789], [8.0, 55.75], [9.0, 115.0], [10.0, 118.75], [11.0, 78.5], [12.0, 123.33333333333333], [13.0, 109.66666666666667], [14.0, 122.0], [15.0, 119.0], [16.0, 189.0], [17.0, 184.5], [18.0, 101.0], [19.0, 166.5], [20.0, 149.33333333333334], [21.0, 113.0], [22.0, 202.75], [23.0, 200.33333333333334], [24.0, 207.5], [25.0, 206.33333333333334], [26.0, 534.0], [27.0, 328.0], [28.0, 455.0], [30.0, 370.0], [31.0, 169.5], [33.0, 242.0], [32.0, 588.5], [35.0, 268.5], [34.0, 919.0], [37.0, 786.0], [36.0, 679.0], [39.0, 439.0], [38.0, 445.0], [40.0, 609.0], [43.0, 254.0], [42.0, 318.5], [45.0, 541.5], [44.0, 490.0], [47.0, 770.5], [49.0, 886.0], [48.0, 619.0], [51.0, 454.0], [50.0, 626.0], [53.0, 692.0], [55.0, 606.5], [54.0, 501.0], [57.0, 469.5], [59.0, 413.0], [58.0, 427.0], [61.0, 706.5], [60.0, 280.0], [63.0, 590.5], [65.0, 456.0], [67.0, 482.0], [66.0, 468.5], [64.0, 850.0], [68.0, 693.0], [71.0, 588.0], [70.0, 712.0], [69.0, 682.0], [72.0, 722.0], [75.0, 597.0], [73.0, 781.0], [77.0, 301.0], [76.0, 391.0], [1.0, 29.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[8.105999999999986, 79.39299999999992]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 77.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 4233.333333333333, "minX": 1.54961916E12, "maxY": 7015.65, "series": [{"data": [[1.54961916E12, 7015.65]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961916E12, 4233.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961916E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 79.39299999999992, "minX": 1.54961916E12, "maxY": 79.39299999999992, "series": [{"data": [[1.54961916E12, 79.39299999999992]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961916E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 79.37899999999999, "minX": 1.54961916E12, "maxY": 79.37899999999999, "series": [{"data": [[1.54961916E12, 79.37899999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961916E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 4.326000000000003, "minX": 1.54961916E12, "maxY": 4.326000000000003, "series": [{"data": [[1.54961916E12, 4.326000000000003]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961916E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 27.0, "minX": 1.54961916E12, "maxY": 1038.0, "series": [{"data": [[1.54961916E12, 1038.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961916E12, 27.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961916E12, 137.89999999999998]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961916E12, 818.97]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961916E12, 469.249999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961916E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 32.0, "minX": 16.0, "maxY": 32.0, "series": [{"data": [[16.0, 32.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 32.0, "minX": 16.0, "maxY": 32.0, "series": [{"data": [[16.0, 32.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54961916E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54961916E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961916E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54961916E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54961916E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961916E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54961916E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54961916E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961916E12, "title": "Transactions Per Second"}},
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