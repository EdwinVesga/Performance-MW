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
        data: {"result": {"minY": 28.0, "minX": 0.0, "maxY": 1042.0, "series": [{"data": [[0.0, 28.0], [0.1, 29.0], [0.2, 29.0], [0.3, 29.0], [0.4, 30.0], [0.5, 30.0], [0.6, 30.0], [0.7, 30.0], [0.8, 30.0], [0.9, 30.0], [1.0, 30.0], [1.1, 30.0], [1.2, 30.0], [1.3, 30.0], [1.4, 30.0], [1.5, 30.0], [1.6, 30.0], [1.7, 30.0], [1.8, 30.0], [1.9, 30.0], [2.0, 30.0], [2.1, 30.0], [2.2, 31.0], [2.3, 31.0], [2.4, 31.0], [2.5, 31.0], [2.6, 31.0], [2.7, 31.0], [2.8, 31.0], [2.9, 31.0], [3.0, 31.0], [3.1, 31.0], [3.2, 31.0], [3.3, 31.0], [3.4, 31.0], [3.5, 31.0], [3.6, 31.0], [3.7, 31.0], [3.8, 31.0], [3.9, 31.0], [4.0, 31.0], [4.1, 31.0], [4.2, 31.0], [4.3, 31.0], [4.4, 31.0], [4.5, 31.0], [4.6, 31.0], [4.7, 31.0], [4.8, 31.0], [4.9, 31.0], [5.0, 31.0], [5.1, 31.0], [5.2, 31.0], [5.3, 31.0], [5.4, 31.0], [5.5, 31.0], [5.6, 31.0], [5.7, 31.0], [5.8, 31.0], [5.9, 31.0], [6.0, 31.0], [6.1, 31.0], [6.2, 32.0], [6.3, 32.0], [6.4, 32.0], [6.5, 32.0], [6.6, 32.0], [6.7, 32.0], [6.8, 32.0], [6.9, 32.0], [7.0, 32.0], [7.1, 32.0], [7.2, 32.0], [7.3, 32.0], [7.4, 32.0], [7.5, 32.0], [7.6, 32.0], [7.7, 32.0], [7.8, 32.0], [7.9, 32.0], [8.0, 32.0], [8.1, 32.0], [8.2, 32.0], [8.3, 32.0], [8.4, 32.0], [8.5, 32.0], [8.6, 32.0], [8.7, 32.0], [8.8, 32.0], [8.9, 32.0], [9.0, 32.0], [9.1, 32.0], [9.2, 32.0], [9.3, 32.0], [9.4, 32.0], [9.5, 32.0], [9.6, 32.0], [9.7, 32.0], [9.8, 32.0], [9.9, 32.0], [10.0, 32.0], [10.1, 32.0], [10.2, 32.0], [10.3, 32.0], [10.4, 32.0], [10.5, 32.0], [10.6, 32.0], [10.7, 32.0], [10.8, 32.0], [10.9, 32.0], [11.0, 32.0], [11.1, 32.0], [11.2, 32.0], [11.3, 33.0], [11.4, 33.0], [11.5, 33.0], [11.6, 33.0], [11.7, 33.0], [11.8, 33.0], [11.9, 33.0], [12.0, 33.0], [12.1, 33.0], [12.2, 33.0], [12.3, 33.0], [12.4, 33.0], [12.5, 33.0], [12.6, 33.0], [12.7, 33.0], [12.8, 33.0], [12.9, 33.0], [13.0, 33.0], [13.1, 33.0], [13.2, 33.0], [13.3, 33.0], [13.4, 33.0], [13.5, 33.0], [13.6, 33.0], [13.7, 33.0], [13.8, 33.0], [13.9, 33.0], [14.0, 33.0], [14.1, 33.0], [14.2, 33.0], [14.3, 33.0], [14.4, 33.0], [14.5, 33.0], [14.6, 33.0], [14.7, 33.0], [14.8, 33.0], [14.9, 33.0], [15.0, 33.0], [15.1, 33.0], [15.2, 33.0], [15.3, 33.0], [15.4, 33.0], [15.5, 33.0], [15.6, 33.0], [15.7, 33.0], [15.8, 33.0], [15.9, 33.0], [16.0, 33.0], [16.1, 33.0], [16.2, 33.0], [16.3, 33.0], [16.4, 33.0], [16.5, 33.0], [16.6, 33.0], [16.7, 33.0], [16.8, 33.0], [16.9, 33.0], [17.0, 33.0], [17.1, 33.0], [17.2, 33.0], [17.3, 33.0], [17.4, 33.0], [17.5, 33.0], [17.6, 33.0], [17.7, 33.0], [17.8, 33.0], [17.9, 33.0], [18.0, 33.0], [18.1, 33.0], [18.2, 33.0], [18.3, 33.0], [18.4, 33.0], [18.5, 33.0], [18.6, 33.0], [18.7, 33.0], [18.8, 33.0], [18.9, 33.0], [19.0, 33.0], [19.1, 33.0], [19.2, 33.0], [19.3, 33.0], [19.4, 33.0], [19.5, 34.0], [19.6, 34.0], [19.7, 34.0], [19.8, 34.0], [19.9, 34.0], [20.0, 34.0], [20.1, 34.0], [20.2, 34.0], [20.3, 34.0], [20.4, 34.0], [20.5, 34.0], [20.6, 34.0], [20.7, 34.0], [20.8, 34.0], [20.9, 34.0], [21.0, 34.0], [21.1, 34.0], [21.2, 34.0], [21.3, 34.0], [21.4, 34.0], [21.5, 34.0], [21.6, 34.0], [21.7, 34.0], [21.8, 34.0], [21.9, 34.0], [22.0, 34.0], [22.1, 34.0], [22.2, 34.0], [22.3, 34.0], [22.4, 34.0], [22.5, 34.0], [22.6, 34.0], [22.7, 34.0], [22.8, 34.0], [22.9, 34.0], [23.0, 34.0], [23.1, 34.0], [23.2, 34.0], [23.3, 34.0], [23.4, 34.0], [23.5, 34.0], [23.6, 34.0], [23.7, 34.0], [23.8, 34.0], [23.9, 34.0], [24.0, 34.0], [24.1, 34.0], [24.2, 34.0], [24.3, 34.0], [24.4, 34.0], [24.5, 34.0], [24.6, 34.0], [24.7, 34.0], [24.8, 34.0], [24.9, 34.0], [25.0, 34.0], [25.1, 34.0], [25.2, 34.0], [25.3, 34.0], [25.4, 34.0], [25.5, 34.0], [25.6, 34.0], [25.7, 34.0], [25.8, 34.0], [25.9, 34.0], [26.0, 34.0], [26.1, 34.0], [26.2, 34.0], [26.3, 34.0], [26.4, 34.0], [26.5, 34.0], [26.6, 34.0], [26.7, 34.0], [26.8, 34.0], [26.9, 34.0], [27.0, 34.0], [27.1, 34.0], [27.2, 34.0], [27.3, 34.0], [27.4, 34.0], [27.5, 34.0], [27.6, 34.0], [27.7, 34.0], [27.8, 34.0], [27.9, 34.0], [28.0, 34.0], [28.1, 34.0], [28.2, 34.0], [28.3, 34.0], [28.4, 34.0], [28.5, 34.0], [28.6, 34.0], [28.7, 34.0], [28.8, 34.0], [28.9, 34.0], [29.0, 34.0], [29.1, 34.0], [29.2, 34.0], [29.3, 34.0], [29.4, 34.0], [29.5, 34.0], [29.6, 34.0], [29.7, 34.0], [29.8, 34.0], [29.9, 34.0], [30.0, 34.0], [30.1, 34.0], [30.2, 34.0], [30.3, 34.0], [30.4, 34.0], [30.5, 34.0], [30.6, 34.0], [30.7, 34.0], [30.8, 34.0], [30.9, 34.0], [31.0, 34.0], [31.1, 34.0], [31.2, 34.0], [31.3, 34.0], [31.4, 34.0], [31.5, 34.0], [31.6, 34.0], [31.7, 35.0], [31.8, 35.0], [31.9, 35.0], [32.0, 35.0], [32.1, 35.0], [32.2, 35.0], [32.3, 35.0], [32.4, 35.0], [32.5, 35.0], [32.6, 35.0], [32.7, 35.0], [32.8, 35.0], [32.9, 35.0], [33.0, 35.0], [33.1, 35.0], [33.2, 35.0], [33.3, 35.0], [33.4, 35.0], [33.5, 35.0], [33.6, 35.0], [33.7, 35.0], [33.8, 35.0], [33.9, 35.0], [34.0, 35.0], [34.1, 35.0], [34.2, 35.0], [34.3, 35.0], [34.4, 35.0], [34.5, 35.0], [34.6, 35.0], [34.7, 35.0], [34.8, 35.0], [34.9, 35.0], [35.0, 35.0], [35.1, 35.0], [35.2, 35.0], [35.3, 35.0], [35.4, 35.0], [35.5, 35.0], [35.6, 35.0], [35.7, 35.0], [35.8, 35.0], [35.9, 35.0], [36.0, 35.0], [36.1, 35.0], [36.2, 35.0], [36.3, 35.0], [36.4, 35.0], [36.5, 35.0], [36.6, 35.0], [36.7, 35.0], [36.8, 35.0], [36.9, 35.0], [37.0, 35.0], [37.1, 35.0], [37.2, 35.0], [37.3, 35.0], [37.4, 35.0], [37.5, 35.0], [37.6, 35.0], [37.7, 35.0], [37.8, 35.0], [37.9, 35.0], [38.0, 35.0], [38.1, 35.0], [38.2, 35.0], [38.3, 35.0], [38.4, 35.0], [38.5, 35.0], [38.6, 35.0], [38.7, 35.0], [38.8, 35.0], [38.9, 35.0], [39.0, 35.0], [39.1, 35.0], [39.2, 35.0], [39.3, 35.0], [39.4, 35.0], [39.5, 35.0], [39.6, 35.0], [39.7, 35.0], [39.8, 35.0], [39.9, 35.0], [40.0, 35.0], [40.1, 35.0], [40.2, 35.0], [40.3, 35.0], [40.4, 35.0], [40.5, 35.0], [40.6, 35.0], [40.7, 35.0], [40.8, 35.0], [40.9, 35.0], [41.0, 35.0], [41.1, 35.0], [41.2, 35.0], [41.3, 35.0], [41.4, 35.0], [41.5, 35.0], [41.6, 35.0], [41.7, 35.0], [41.8, 35.0], [41.9, 35.0], [42.0, 35.0], [42.1, 35.0], [42.2, 35.0], [42.3, 35.0], [42.4, 35.0], [42.5, 35.0], [42.6, 35.0], [42.7, 35.0], [42.8, 35.0], [42.9, 35.0], [43.0, 35.0], [43.1, 35.0], [43.2, 35.0], [43.3, 35.0], [43.4, 35.0], [43.5, 36.0], [43.6, 36.0], [43.7, 36.0], [43.8, 36.0], [43.9, 36.0], [44.0, 36.0], [44.1, 36.0], [44.2, 36.0], [44.3, 36.0], [44.4, 36.0], [44.5, 36.0], [44.6, 36.0], [44.7, 36.0], [44.8, 36.0], [44.9, 36.0], [45.0, 36.0], [45.1, 36.0], [45.2, 36.0], [45.3, 36.0], [45.4, 36.0], [45.5, 36.0], [45.6, 36.0], [45.7, 36.0], [45.8, 36.0], [45.9, 36.0], [46.0, 36.0], [46.1, 36.0], [46.2, 36.0], [46.3, 36.0], [46.4, 36.0], [46.5, 36.0], [46.6, 36.0], [46.7, 36.0], [46.8, 36.0], [46.9, 36.0], [47.0, 36.0], [47.1, 36.0], [47.2, 36.0], [47.3, 36.0], [47.4, 36.0], [47.5, 36.0], [47.6, 36.0], [47.7, 36.0], [47.8, 36.0], [47.9, 36.0], [48.0, 36.0], [48.1, 36.0], [48.2, 36.0], [48.3, 36.0], [48.4, 36.0], [48.5, 36.0], [48.6, 36.0], [48.7, 36.0], [48.8, 36.0], [48.9, 36.0], [49.0, 36.0], [49.1, 36.0], [49.2, 36.0], [49.3, 36.0], [49.4, 36.0], [49.5, 36.0], [49.6, 36.0], [49.7, 36.0], [49.8, 36.0], [49.9, 36.0], [50.0, 36.0], [50.1, 36.0], [50.2, 36.0], [50.3, 36.0], [50.4, 36.0], [50.5, 36.0], [50.6, 36.0], [50.7, 36.0], [50.8, 36.0], [50.9, 36.0], [51.0, 36.0], [51.1, 36.0], [51.2, 36.0], [51.3, 36.0], [51.4, 36.0], [51.5, 36.0], [51.6, 36.0], [51.7, 36.0], [51.8, 36.0], [51.9, 36.0], [52.0, 36.0], [52.1, 36.0], [52.2, 36.0], [52.3, 36.0], [52.4, 36.0], [52.5, 36.0], [52.6, 36.0], [52.7, 36.0], [52.8, 36.0], [52.9, 36.0], [53.0, 36.0], [53.1, 36.0], [53.2, 36.0], [53.3, 36.0], [53.4, 36.0], [53.5, 36.0], [53.6, 36.0], [53.7, 36.0], [53.8, 36.0], [53.9, 36.0], [54.0, 36.0], [54.1, 36.0], [54.2, 36.0], [54.3, 36.0], [54.4, 36.0], [54.5, 36.0], [54.6, 36.0], [54.7, 36.0], [54.8, 36.0], [54.9, 36.0], [55.0, 36.0], [55.1, 36.0], [55.2, 36.0], [55.3, 36.0], [55.4, 36.0], [55.5, 36.0], [55.6, 36.0], [55.7, 36.0], [55.8, 36.0], [55.9, 36.0], [56.0, 36.0], [56.1, 36.0], [56.2, 36.0], [56.3, 36.0], [56.4, 36.0], [56.5, 36.0], [56.6, 36.0], [56.7, 37.0], [56.8, 37.0], [56.9, 37.0], [57.0, 37.0], [57.1, 37.0], [57.2, 37.0], [57.3, 37.0], [57.4, 37.0], [57.5, 37.0], [57.6, 37.0], [57.7, 37.0], [57.8, 37.0], [57.9, 37.0], [58.0, 37.0], [58.1, 37.0], [58.2, 37.0], [58.3, 37.0], [58.4, 37.0], [58.5, 37.0], [58.6, 37.0], [58.7, 37.0], [58.8, 37.0], [58.9, 37.0], [59.0, 37.0], [59.1, 37.0], [59.2, 37.0], [59.3, 37.0], [59.4, 37.0], [59.5, 37.0], [59.6, 37.0], [59.7, 37.0], [59.8, 37.0], [59.9, 37.0], [60.0, 37.0], [60.1, 37.0], [60.2, 37.0], [60.3, 37.0], [60.4, 37.0], [60.5, 37.0], [60.6, 37.0], [60.7, 37.0], [60.8, 37.0], [60.9, 37.0], [61.0, 37.0], [61.1, 37.0], [61.2, 37.0], [61.3, 37.0], [61.4, 37.0], [61.5, 37.0], [61.6, 37.0], [61.7, 37.0], [61.8, 37.0], [61.9, 37.0], [62.0, 37.0], [62.1, 37.0], [62.2, 37.0], [62.3, 37.0], [62.4, 37.0], [62.5, 37.0], [62.6, 37.0], [62.7, 37.0], [62.8, 37.0], [62.9, 37.0], [63.0, 37.0], [63.1, 37.0], [63.2, 37.0], [63.3, 37.0], [63.4, 37.0], [63.5, 37.0], [63.6, 37.0], [63.7, 37.0], [63.8, 37.0], [63.9, 37.0], [64.0, 37.0], [64.1, 37.0], [64.2, 37.0], [64.3, 37.0], [64.4, 37.0], [64.5, 37.0], [64.6, 37.0], [64.7, 37.0], [64.8, 37.0], [64.9, 37.0], [65.0, 37.0], [65.1, 37.0], [65.2, 37.0], [65.3, 37.0], [65.4, 37.0], [65.5, 37.0], [65.6, 37.0], [65.7, 37.0], [65.8, 37.0], [65.9, 37.0], [66.0, 37.0], [66.1, 37.0], [66.2, 37.0], [66.3, 37.0], [66.4, 37.0], [66.5, 37.0], [66.6, 37.0], [66.7, 37.0], [66.8, 37.0], [66.9, 37.0], [67.0, 37.0], [67.1, 37.0], [67.2, 38.0], [67.3, 38.0], [67.4, 38.0], [67.5, 38.0], [67.6, 38.0], [67.7, 38.0], [67.8, 38.0], [67.9, 38.0], [68.0, 38.0], [68.1, 38.0], [68.2, 38.0], [68.3, 38.0], [68.4, 38.0], [68.5, 38.0], [68.6, 38.0], [68.7, 38.0], [68.8, 38.0], [68.9, 38.0], [69.0, 38.0], [69.1, 38.0], [69.2, 38.0], [69.3, 38.0], [69.4, 38.0], [69.5, 38.0], [69.6, 38.0], [69.7, 38.0], [69.8, 38.0], [69.9, 38.0], [70.0, 38.0], [70.1, 38.0], [70.2, 38.0], [70.3, 38.0], [70.4, 38.0], [70.5, 38.0], [70.6, 38.0], [70.7, 38.0], [70.8, 38.0], [70.9, 38.0], [71.0, 38.0], [71.1, 38.0], [71.2, 38.0], [71.3, 38.0], [71.4, 38.0], [71.5, 38.0], [71.6, 38.0], [71.7, 38.0], [71.8, 38.0], [71.9, 39.0], [72.0, 39.0], [72.1, 39.0], [72.2, 39.0], [72.3, 39.0], [72.4, 39.0], [72.5, 39.0], [72.6, 39.0], [72.7, 39.0], [72.8, 39.0], [72.9, 39.0], [73.0, 39.0], [73.1, 39.0], [73.2, 39.0], [73.3, 39.0], [73.4, 39.0], [73.5, 39.0], [73.6, 39.0], [73.7, 39.0], [73.8, 39.0], [73.9, 39.0], [74.0, 39.0], [74.1, 39.0], [74.2, 39.0], [74.3, 39.0], [74.4, 39.0], [74.5, 39.0], [74.6, 39.0], [74.7, 39.0], [74.8, 39.0], [74.9, 39.0], [75.0, 40.0], [75.1, 40.0], [75.2, 40.0], [75.3, 40.0], [75.4, 40.0], [75.5, 40.0], [75.6, 40.0], [75.7, 40.0], [75.8, 40.0], [75.9, 40.0], [76.0, 40.0], [76.1, 40.0], [76.2, 41.0], [76.3, 41.0], [76.4, 41.0], [76.5, 41.0], [76.6, 41.0], [76.7, 41.0], [76.8, 41.0], [76.9, 41.0], [77.0, 41.0], [77.1, 41.0], [77.2, 42.0], [77.3, 42.0], [77.4, 42.0], [77.5, 42.0], [77.6, 42.0], [77.7, 42.0], [77.8, 42.0], [77.9, 42.0], [78.0, 42.0], [78.1, 42.0], [78.2, 42.0], [78.3, 42.0], [78.4, 43.0], [78.5, 43.0], [78.6, 43.0], [78.7, 43.0], [78.8, 43.0], [78.9, 43.0], [79.0, 43.0], [79.1, 43.0], [79.2, 43.0], [79.3, 43.0], [79.4, 44.0], [79.5, 44.0], [79.6, 44.0], [79.7, 44.0], [79.8, 44.0], [79.9, 44.0], [80.0, 44.0], [80.1, 44.0], [80.2, 44.0], [80.3, 46.0], [80.4, 46.0], [80.5, 46.0], [80.6, 47.0], [80.7, 47.0], [80.8, 47.0], [80.9, 47.0], [81.0, 47.0], [81.1, 47.0], [81.2, 47.0], [81.3, 48.0], [81.4, 48.0], [81.5, 48.0], [81.6, 48.0], [81.7, 48.0], [81.8, 48.0], [81.9, 48.0], [82.0, 49.0], [82.1, 49.0], [82.2, 49.0], [82.3, 50.0], [82.4, 51.0], [82.5, 51.0], [82.6, 52.0], [82.7, 52.0], [82.8, 53.0], [82.9, 55.0], [83.0, 56.0], [83.1, 59.0], [83.2, 60.0], [83.3, 61.0], [83.4, 62.0], [83.5, 66.0], [83.6, 68.0], [83.7, 68.0], [83.8, 70.0], [83.9, 74.0], [84.0, 74.0], [84.1, 74.0], [84.2, 78.0], [84.3, 79.0], [84.4, 81.0], [84.5, 82.0], [84.6, 85.0], [84.7, 90.0], [84.8, 93.0], [84.9, 93.0], [85.0, 97.0], [85.1, 97.0], [85.2, 99.0], [85.3, 100.0], [85.4, 102.0], [85.5, 102.0], [85.6, 104.0], [85.7, 109.0], [85.8, 110.0], [85.9, 110.0], [86.0, 111.0], [86.1, 112.0], [86.2, 113.0], [86.3, 114.0], [86.4, 120.0], [86.5, 132.0], [86.6, 134.0], [86.7, 138.0], [86.8, 138.0], [86.9, 147.0], [87.0, 150.0], [87.1, 155.0], [87.2, 156.0], [87.3, 156.0], [87.4, 156.0], [87.5, 159.0], [87.6, 161.0], [87.7, 162.0], [87.8, 163.0], [87.9, 164.0], [88.0, 170.0], [88.1, 171.0], [88.2, 171.0], [88.3, 175.0], [88.4, 175.0], [88.5, 182.0], [88.6, 182.0], [88.7, 184.0], [88.8, 184.0], [88.9, 184.0], [89.0, 185.0], [89.1, 192.0], [89.2, 192.0], [89.3, 193.0], [89.4, 194.0], [89.5, 199.0], [89.6, 201.0], [89.7, 207.0], [89.8, 210.0], [89.9, 210.0], [90.0, 213.0], [90.1, 217.0], [90.2, 224.0], [90.3, 238.0], [90.4, 241.0], [90.5, 255.0], [90.6, 257.0], [90.7, 260.0], [90.8, 280.0], [90.9, 282.0], [91.0, 282.0], [91.1, 287.0], [91.2, 288.0], [91.3, 293.0], [91.4, 303.0], [91.5, 305.0], [91.6, 308.0], [91.7, 313.0], [91.8, 315.0], [91.9, 324.0], [92.0, 326.0], [92.1, 330.0], [92.2, 331.0], [92.3, 336.0], [92.4, 341.0], [92.5, 354.0], [92.6, 367.0], [92.7, 395.0], [92.8, 396.0], [92.9, 396.0], [93.0, 404.0], [93.1, 409.0], [93.2, 409.0], [93.3, 423.0], [93.4, 434.0], [93.5, 434.0], [93.6, 454.0], [93.7, 482.0], [93.8, 482.0], [93.9, 482.0], [94.0, 483.0], [94.1, 501.0], [94.2, 523.0], [94.3, 527.0], [94.4, 543.0], [94.5, 553.0], [94.6, 572.0], [94.7, 574.0], [94.8, 586.0], [94.9, 586.0], [95.0, 591.0], [95.1, 592.0], [95.2, 596.0], [95.3, 604.0], [95.4, 606.0], [95.5, 620.0], [95.6, 622.0], [95.7, 626.0], [95.8, 632.0], [95.9, 641.0], [96.0, 648.0], [96.1, 650.0], [96.2, 652.0], [96.3, 654.0], [96.4, 658.0], [96.5, 680.0], [96.6, 681.0], [96.7, 681.0], [96.8, 682.0], [96.9, 702.0], [97.0, 726.0], [97.1, 732.0], [97.2, 736.0], [97.3, 738.0], [97.4, 744.0], [97.5, 746.0], [97.6, 749.0], [97.7, 750.0], [97.8, 782.0], [97.9, 784.0], [98.0, 785.0], [98.1, 786.0], [98.2, 794.0], [98.3, 815.0], [98.4, 829.0], [98.5, 913.0], [98.6, 924.0], [98.7, 950.0], [98.8, 959.0], [98.9, 1031.0], [99.0, 1032.0], [99.1, 1034.0], [99.2, 1037.0], [99.3, 1037.0], [99.4, 1037.0], [99.5, 1037.0], [99.6, 1038.0], [99.7, 1040.0], [99.8, 1041.0], [99.9, 1042.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 853.0, "series": [{"data": [[0.0, 853.0], [600.0, 16.0], [300.0, 16.0], [700.0, 14.0], [100.0, 43.0], [400.0, 11.0], [800.0, 2.0], [200.0, 18.0], [900.0, 4.0], [500.0, 12.0], [1000.0, 11.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 59.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 941.0, "series": [{"data": [[1.0, 59.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 941.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 5.334511189634872, "minX": 1.54960782E12, "maxY": 48.59602649006623, "series": [{"data": [[1.54960782E12, 5.334511189634872], [1.54960788E12, 48.59602649006623]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 37.60000000000003, "minX": 1.0, "maxY": 1031.0, "series": [{"data": [[2.0, 175.0], [3.0, 72.68], [4.0, 38.95757575757576], [5.0, 37.60000000000003], [6.0, 61.574074074074076], [7.0, 161.44444444444446], [8.0, 390.6666666666667], [9.0, 391.0], [10.0, 567.5], [11.0, 405.3333333333333], [12.0, 70.66666666666667], [13.0, 84.66666666666667], [14.0, 81.33333333333333], [15.0, 112.0], [16.0, 64.0], [17.0, 121.6], [18.0, 79.25], [19.0, 110.5], [20.0, 63.0], [21.0, 91.8], [22.0, 124.0], [23.0, 112.5], [24.0, 99.33333333333333], [25.0, 128.75], [26.0, 150.5], [27.0, 112.0], [28.0, 148.66666666666666], [29.0, 134.0], [30.0, 182.0], [31.0, 129.0], [33.0, 293.0], [32.0, 207.0], [35.0, 111.0], [34.0, 210.0], [37.0, 181.0], [36.0, 302.5], [39.0, 209.0], [38.0, 192.0], [41.0, 332.25], [40.0, 186.66666666666666], [43.0, 241.0], [42.0, 210.0], [44.0, 193.0], [47.0, 242.0], [46.0, 457.0], [49.0, 470.5], [48.0, 282.0], [51.0, 523.0], [50.0, 581.5], [53.0, 308.0], [52.0, 924.0], [55.0, 396.0], [54.0, 491.0], [57.0, 553.0], [56.0, 282.0], [59.0, 313.0], [58.0, 622.0], [61.0, 626.0], [60.0, 409.0], [63.0, 482.5], [62.0, 483.0], [66.0, 482.5], [65.0, 484.5], [64.0, 721.0], [71.0, 591.0], [70.0, 589.0], [69.0, 534.0], [68.0, 586.0], [75.0, 619.0], [74.0, 815.0], [73.0, 293.0], [72.0, 552.0], [77.0, 656.75], [79.0, 726.0], [78.0, 592.0], [76.0, 454.0], [80.0, 555.3333333333334], [81.0, 578.0], [83.0, 782.0], [82.0, 482.0], [87.0, 604.5], [86.0, 489.0], [85.0, 698.0], [84.0, 787.5], [90.0, 373.3333333333333], [89.0, 531.0], [88.0, 604.0], [1.0, 1031.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[11.867000000000015, 97.179]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 90.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 634.2, "minX": 1.54960782E12, "maxY": 5956.383333333333, "series": [{"data": [[1.54960782E12, 5956.383333333333], [1.54960788E12, 1059.5]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960782E12, 3565.8], [1.54960788E12, 634.2]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 39.95877502944641, "minX": 1.54960782E12, "maxY": 418.90066225165555, "series": [{"data": [[1.54960782E12, 39.95877502944641], [1.54960788E12, 418.90066225165555]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 39.945818610129535, "minX": 1.54960782E12, "maxY": 418.88741721854296, "series": [{"data": [[1.54960782E12, 39.945818610129535], [1.54960788E12, 418.88741721854296]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 1.3215547703180235, "minX": 1.54960782E12, "maxY": 73.09933774834437, "series": [{"data": [[1.54960782E12, 1.3215547703180235], [1.54960788E12, 73.09933774834437]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 28.0, "minX": 1.54960782E12, "maxY": 1042.0, "series": [{"data": [[1.54960782E12, 632.0], [1.54960788E12, 1042.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960782E12, 28.0], [1.54960788E12, 34.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960782E12, 42.0], [1.54960788E12, 212.69999999999993]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960782E12, 157.5], [1.54960788E12, 1031.99]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960782E12, 48.5], [1.54960788E12, 590.7499999999997]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 35.0, "minX": 2.0, "maxY": 331.0, "series": [{"data": [[2.0, 331.0], [14.0, 35.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 14.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 35.0, "minX": 2.0, "maxY": 331.0, "series": [{"data": [[2.0, 331.0], [14.0, 35.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 14.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 1.2, "minX": 1.54960782E12, "maxY": 15.466666666666667, "series": [{"data": [[1.54960782E12, 15.466666666666667], [1.54960788E12, 1.2]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 2.5166666666666666, "minX": 1.54960782E12, "maxY": 14.15, "series": [{"data": [[1.54960782E12, 14.15], [1.54960788E12, 2.5166666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 2.5166666666666666, "minX": 1.54960782E12, "maxY": 14.15, "series": [{"data": [[1.54960782E12, 14.15], [1.54960788E12, 2.5166666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Transactions Per Second"}},
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
