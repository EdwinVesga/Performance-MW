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
        data: {"result": {"minY": 30.0, "minX": 0.0, "maxY": 1087.0, "series": [{"data": [[0.0, 30.0], [0.1, 30.0], [0.2, 30.0], [0.3, 30.0], [0.4, 30.0], [0.5, 30.0], [0.6, 30.0], [0.7, 30.0], [0.8, 31.0], [0.9, 31.0], [1.0, 31.0], [1.1, 31.0], [1.2, 31.0], [1.3, 31.0], [1.4, 31.0], [1.5, 31.0], [1.6, 31.0], [1.7, 31.0], [1.8, 31.0], [1.9, 31.0], [2.0, 31.0], [2.1, 31.0], [2.2, 31.0], [2.3, 32.0], [2.4, 32.0], [2.5, 32.0], [2.6, 32.0], [2.7, 32.0], [2.8, 32.0], [2.9, 32.0], [3.0, 32.0], [3.1, 32.0], [3.2, 32.0], [3.3, 32.0], [3.4, 32.0], [3.5, 32.0], [3.6, 32.0], [3.7, 32.0], [3.8, 32.0], [3.9, 32.0], [4.0, 32.0], [4.1, 32.0], [4.2, 32.0], [4.3, 32.0], [4.4, 32.0], [4.5, 32.0], [4.6, 32.0], [4.7, 32.0], [4.8, 32.0], [4.9, 33.0], [5.0, 33.0], [5.1, 33.0], [5.2, 33.0], [5.3, 33.0], [5.4, 33.0], [5.5, 33.0], [5.6, 33.0], [5.7, 33.0], [5.8, 33.0], [5.9, 33.0], [6.0, 33.0], [6.1, 33.0], [6.2, 33.0], [6.3, 33.0], [6.4, 33.0], [6.5, 33.0], [6.6, 33.0], [6.7, 33.0], [6.8, 33.0], [6.9, 33.0], [7.0, 33.0], [7.1, 33.0], [7.2, 33.0], [7.3, 33.0], [7.4, 33.0], [7.5, 33.0], [7.6, 33.0], [7.7, 33.0], [7.8, 33.0], [7.9, 33.0], [8.0, 33.0], [8.1, 33.0], [8.2, 33.0], [8.3, 33.0], [8.4, 33.0], [8.5, 33.0], [8.6, 33.0], [8.7, 33.0], [8.8, 33.0], [8.9, 33.0], [9.0, 33.0], [9.1, 33.0], [9.2, 33.0], [9.3, 33.0], [9.4, 33.0], [9.5, 33.0], [9.6, 33.0], [9.7, 33.0], [9.8, 33.0], [9.9, 33.0], [10.0, 33.0], [10.1, 33.0], [10.2, 34.0], [10.3, 34.0], [10.4, 34.0], [10.5, 34.0], [10.6, 34.0], [10.7, 34.0], [10.8, 34.0], [10.9, 34.0], [11.0, 34.0], [11.1, 34.0], [11.2, 34.0], [11.3, 34.0], [11.4, 34.0], [11.5, 34.0], [11.6, 34.0], [11.7, 34.0], [11.8, 34.0], [11.9, 34.0], [12.0, 34.0], [12.1, 34.0], [12.2, 34.0], [12.3, 34.0], [12.4, 34.0], [12.5, 34.0], [12.6, 34.0], [12.7, 34.0], [12.8, 34.0], [12.9, 34.0], [13.0, 34.0], [13.1, 34.0], [13.2, 34.0], [13.3, 34.0], [13.4, 34.0], [13.5, 34.0], [13.6, 34.0], [13.7, 34.0], [13.8, 34.0], [13.9, 34.0], [14.0, 34.0], [14.1, 34.0], [14.2, 34.0], [14.3, 34.0], [14.4, 34.0], [14.5, 34.0], [14.6, 34.0], [14.7, 34.0], [14.8, 34.0], [14.9, 34.0], [15.0, 34.0], [15.1, 34.0], [15.2, 34.0], [15.3, 34.0], [15.4, 34.0], [15.5, 34.0], [15.6, 34.0], [15.7, 34.0], [15.8, 34.0], [15.9, 34.0], [16.0, 34.0], [16.1, 34.0], [16.2, 34.0], [16.3, 34.0], [16.4, 34.0], [16.5, 34.0], [16.6, 34.0], [16.7, 34.0], [16.8, 34.0], [16.9, 34.0], [17.0, 34.0], [17.1, 34.0], [17.2, 34.0], [17.3, 34.0], [17.4, 34.0], [17.5, 34.0], [17.6, 34.0], [17.7, 34.0], [17.8, 34.0], [17.9, 34.0], [18.0, 34.0], [18.1, 34.0], [18.2, 34.0], [18.3, 34.0], [18.4, 34.0], [18.5, 34.0], [18.6, 34.0], [18.7, 34.0], [18.8, 34.0], [18.9, 34.0], [19.0, 34.0], [19.1, 34.0], [19.2, 34.0], [19.3, 34.0], [19.4, 34.0], [19.5, 34.0], [19.6, 34.0], [19.7, 34.0], [19.8, 34.0], [19.9, 34.0], [20.0, 34.0], [20.1, 34.0], [20.2, 34.0], [20.3, 34.0], [20.4, 34.0], [20.5, 34.0], [20.6, 34.0], [20.7, 34.0], [20.8, 35.0], [20.9, 35.0], [21.0, 35.0], [21.1, 35.0], [21.2, 35.0], [21.3, 35.0], [21.4, 35.0], [21.5, 35.0], [21.6, 35.0], [21.7, 35.0], [21.8, 35.0], [21.9, 35.0], [22.0, 35.0], [22.1, 35.0], [22.2, 35.0], [22.3, 35.0], [22.4, 35.0], [22.5, 35.0], [22.6, 35.0], [22.7, 35.0], [22.8, 35.0], [22.9, 35.0], [23.0, 35.0], [23.1, 35.0], [23.2, 35.0], [23.3, 35.0], [23.4, 35.0], [23.5, 35.0], [23.6, 35.0], [23.7, 35.0], [23.8, 35.0], [23.9, 35.0], [24.0, 35.0], [24.1, 35.0], [24.2, 35.0], [24.3, 35.0], [24.4, 35.0], [24.5, 35.0], [24.6, 35.0], [24.7, 35.0], [24.8, 35.0], [24.9, 35.0], [25.0, 35.0], [25.1, 35.0], [25.2, 35.0], [25.3, 35.0], [25.4, 35.0], [25.5, 35.0], [25.6, 35.0], [25.7, 35.0], [25.8, 35.0], [25.9, 35.0], [26.0, 35.0], [26.1, 35.0], [26.2, 35.0], [26.3, 35.0], [26.4, 35.0], [26.5, 35.0], [26.6, 35.0], [26.7, 35.0], [26.8, 35.0], [26.9, 35.0], [27.0, 35.0], [27.1, 35.0], [27.2, 35.0], [27.3, 35.0], [27.4, 35.0], [27.5, 35.0], [27.6, 35.0], [27.7, 35.0], [27.8, 35.0], [27.9, 35.0], [28.0, 35.0], [28.1, 35.0], [28.2, 35.0], [28.3, 35.0], [28.4, 35.0], [28.5, 35.0], [28.6, 35.0], [28.7, 35.0], [28.8, 35.0], [28.9, 35.0], [29.0, 35.0], [29.1, 35.0], [29.2, 35.0], [29.3, 35.0], [29.4, 35.0], [29.5, 35.0], [29.6, 35.0], [29.7, 35.0], [29.8, 35.0], [29.9, 35.0], [30.0, 35.0], [30.1, 35.0], [30.2, 35.0], [30.3, 35.0], [30.4, 35.0], [30.5, 35.0], [30.6, 35.0], [30.7, 35.0], [30.8, 35.0], [30.9, 35.0], [31.0, 35.0], [31.1, 35.0], [31.2, 35.0], [31.3, 35.0], [31.4, 35.0], [31.5, 35.0], [31.6, 35.0], [31.7, 35.0], [31.8, 35.0], [31.9, 35.0], [32.0, 35.0], [32.1, 35.0], [32.2, 35.0], [32.3, 36.0], [32.4, 36.0], [32.5, 36.0], [32.6, 36.0], [32.7, 36.0], [32.8, 36.0], [32.9, 36.0], [33.0, 36.0], [33.1, 36.0], [33.2, 36.0], [33.3, 36.0], [33.4, 36.0], [33.5, 36.0], [33.6, 36.0], [33.7, 36.0], [33.8, 36.0], [33.9, 36.0], [34.0, 36.0], [34.1, 36.0], [34.2, 36.0], [34.3, 36.0], [34.4, 36.0], [34.5, 36.0], [34.6, 36.0], [34.7, 36.0], [34.8, 36.0], [34.9, 36.0], [35.0, 36.0], [35.1, 36.0], [35.2, 36.0], [35.3, 36.0], [35.4, 36.0], [35.5, 36.0], [35.6, 36.0], [35.7, 36.0], [35.8, 36.0], [35.9, 36.0], [36.0, 36.0], [36.1, 36.0], [36.2, 36.0], [36.3, 36.0], [36.4, 36.0], [36.5, 36.0], [36.6, 36.0], [36.7, 36.0], [36.8, 36.0], [36.9, 36.0], [37.0, 36.0], [37.1, 36.0], [37.2, 36.0], [37.3, 36.0], [37.4, 36.0], [37.5, 36.0], [37.6, 36.0], [37.7, 36.0], [37.8, 36.0], [37.9, 36.0], [38.0, 36.0], [38.1, 36.0], [38.2, 36.0], [38.3, 36.0], [38.4, 36.0], [38.5, 36.0], [38.6, 36.0], [38.7, 36.0], [38.8, 36.0], [38.9, 36.0], [39.0, 36.0], [39.1, 36.0], [39.2, 36.0], [39.3, 36.0], [39.4, 36.0], [39.5, 36.0], [39.6, 36.0], [39.7, 36.0], [39.8, 36.0], [39.9, 36.0], [40.0, 36.0], [40.1, 36.0], [40.2, 36.0], [40.3, 36.0], [40.4, 36.0], [40.5, 36.0], [40.6, 36.0], [40.7, 36.0], [40.8, 36.0], [40.9, 36.0], [41.0, 36.0], [41.1, 36.0], [41.2, 36.0], [41.3, 36.0], [41.4, 36.0], [41.5, 36.0], [41.6, 36.0], [41.7, 36.0], [41.8, 36.0], [41.9, 36.0], [42.0, 36.0], [42.1, 36.0], [42.2, 36.0], [42.3, 36.0], [42.4, 36.0], [42.5, 36.0], [42.6, 36.0], [42.7, 36.0], [42.8, 36.0], [42.9, 36.0], [43.0, 36.0], [43.1, 36.0], [43.2, 36.0], [43.3, 36.0], [43.4, 36.0], [43.5, 36.0], [43.6, 36.0], [43.7, 36.0], [43.8, 36.0], [43.9, 36.0], [44.0, 36.0], [44.1, 36.0], [44.2, 36.0], [44.3, 36.0], [44.4, 36.0], [44.5, 36.0], [44.6, 36.0], [44.7, 37.0], [44.8, 37.0], [44.9, 37.0], [45.0, 37.0], [45.1, 37.0], [45.2, 37.0], [45.3, 37.0], [45.4, 37.0], [45.5, 37.0], [45.6, 37.0], [45.7, 37.0], [45.8, 37.0], [45.9, 37.0], [46.0, 37.0], [46.1, 37.0], [46.2, 37.0], [46.3, 37.0], [46.4, 37.0], [46.5, 37.0], [46.6, 37.0], [46.7, 37.0], [46.8, 37.0], [46.9, 37.0], [47.0, 37.0], [47.1, 37.0], [47.2, 37.0], [47.3, 37.0], [47.4, 37.0], [47.5, 37.0], [47.6, 37.0], [47.7, 37.0], [47.8, 37.0], [47.9, 37.0], [48.0, 37.0], [48.1, 37.0], [48.2, 37.0], [48.3, 37.0], [48.4, 37.0], [48.5, 37.0], [48.6, 37.0], [48.7, 37.0], [48.8, 37.0], [48.9, 37.0], [49.0, 37.0], [49.1, 37.0], [49.2, 37.0], [49.3, 37.0], [49.4, 37.0], [49.5, 37.0], [49.6, 37.0], [49.7, 37.0], [49.8, 37.0], [49.9, 37.0], [50.0, 37.0], [50.1, 37.0], [50.2, 37.0], [50.3, 37.0], [50.4, 37.0], [50.5, 37.0], [50.6, 37.0], [50.7, 37.0], [50.8, 37.0], [50.9, 37.0], [51.0, 37.0], [51.1, 37.0], [51.2, 37.0], [51.3, 37.0], [51.4, 37.0], [51.5, 37.0], [51.6, 37.0], [51.7, 37.0], [51.8, 37.0], [51.9, 37.0], [52.0, 37.0], [52.1, 37.0], [52.2, 37.0], [52.3, 37.0], [52.4, 37.0], [52.5, 37.0], [52.6, 37.0], [52.7, 37.0], [52.8, 37.0], [52.9, 37.0], [53.0, 37.0], [53.1, 37.0], [53.2, 37.0], [53.3, 37.0], [53.4, 37.0], [53.5, 37.0], [53.6, 37.0], [53.7, 37.0], [53.8, 37.0], [53.9, 37.0], [54.0, 37.0], [54.1, 37.0], [54.2, 37.0], [54.3, 37.0], [54.4, 37.0], [54.5, 37.0], [54.6, 37.0], [54.7, 37.0], [54.8, 37.0], [54.9, 37.0], [55.0, 37.0], [55.1, 37.0], [55.2, 37.0], [55.3, 37.0], [55.4, 37.0], [55.5, 37.0], [55.6, 37.0], [55.7, 37.0], [55.8, 37.0], [55.9, 37.0], [56.0, 38.0], [56.1, 38.0], [56.2, 38.0], [56.3, 38.0], [56.4, 38.0], [56.5, 38.0], [56.6, 38.0], [56.7, 38.0], [56.8, 38.0], [56.9, 38.0], [57.0, 38.0], [57.1, 38.0], [57.2, 38.0], [57.3, 38.0], [57.4, 38.0], [57.5, 38.0], [57.6, 38.0], [57.7, 38.0], [57.8, 38.0], [57.9, 38.0], [58.0, 38.0], [58.1, 38.0], [58.2, 38.0], [58.3, 38.0], [58.4, 38.0], [58.5, 38.0], [58.6, 38.0], [58.7, 38.0], [58.8, 38.0], [58.9, 38.0], [59.0, 38.0], [59.1, 38.0], [59.2, 38.0], [59.3, 38.0], [59.4, 38.0], [59.5, 38.0], [59.6, 38.0], [59.7, 38.0], [59.8, 38.0], [59.9, 38.0], [60.0, 38.0], [60.1, 38.0], [60.2, 38.0], [60.3, 38.0], [60.4, 38.0], [60.5, 38.0], [60.6, 38.0], [60.7, 38.0], [60.8, 38.0], [60.9, 38.0], [61.0, 38.0], [61.1, 38.0], [61.2, 38.0], [61.3, 38.0], [61.4, 38.0], [61.5, 38.0], [61.6, 38.0], [61.7, 38.0], [61.8, 38.0], [61.9, 38.0], [62.0, 38.0], [62.1, 38.0], [62.2, 38.0], [62.3, 38.0], [62.4, 38.0], [62.5, 38.0], [62.6, 38.0], [62.7, 38.0], [62.8, 39.0], [62.9, 39.0], [63.0, 39.0], [63.1, 39.0], [63.2, 39.0], [63.3, 39.0], [63.4, 39.0], [63.5, 39.0], [63.6, 39.0], [63.7, 39.0], [63.8, 39.0], [63.9, 39.0], [64.0, 39.0], [64.1, 39.0], [64.2, 39.0], [64.3, 39.0], [64.4, 39.0], [64.5, 39.0], [64.6, 39.0], [64.7, 39.0], [64.8, 39.0], [64.9, 39.0], [65.0, 39.0], [65.1, 39.0], [65.2, 39.0], [65.3, 39.0], [65.4, 39.0], [65.5, 39.0], [65.6, 39.0], [65.7, 39.0], [65.8, 39.0], [65.9, 39.0], [66.0, 39.0], [66.1, 39.0], [66.2, 39.0], [66.3, 40.0], [66.4, 40.0], [66.5, 40.0], [66.6, 40.0], [66.7, 40.0], [66.8, 40.0], [66.9, 40.0], [67.0, 40.0], [67.1, 40.0], [67.2, 40.0], [67.3, 40.0], [67.4, 40.0], [67.5, 40.0], [67.6, 40.0], [67.7, 40.0], [67.8, 40.0], [67.9, 40.0], [68.0, 40.0], [68.1, 40.0], [68.2, 41.0], [68.3, 41.0], [68.4, 41.0], [68.5, 41.0], [68.6, 41.0], [68.7, 41.0], [68.8, 41.0], [68.9, 41.0], [69.0, 41.0], [69.1, 41.0], [69.2, 41.0], [69.3, 41.0], [69.4, 41.0], [69.5, 41.0], [69.6, 41.0], [69.7, 41.0], [69.8, 41.0], [69.9, 41.0], [70.0, 41.0], [70.1, 41.0], [70.2, 41.0], [70.3, 41.0], [70.4, 41.0], [70.5, 41.0], [70.6, 41.0], [70.7, 41.0], [70.8, 41.0], [70.9, 41.0], [71.0, 41.0], [71.1, 41.0], [71.2, 41.0], [71.3, 41.0], [71.4, 41.0], [71.5, 42.0], [71.6, 42.0], [71.7, 42.0], [71.8, 42.0], [71.9, 42.0], [72.0, 42.0], [72.1, 42.0], [72.2, 42.0], [72.3, 42.0], [72.4, 42.0], [72.5, 42.0], [72.6, 42.0], [72.7, 42.0], [72.8, 43.0], [72.9, 43.0], [73.0, 43.0], [73.1, 43.0], [73.2, 43.0], [73.3, 43.0], [73.4, 43.0], [73.5, 43.0], [73.6, 43.0], [73.7, 43.0], [73.8, 43.0], [73.9, 44.0], [74.0, 44.0], [74.1, 44.0], [74.2, 44.0], [74.3, 44.0], [74.4, 44.0], [74.5, 45.0], [74.6, 45.0], [74.7, 45.0], [74.8, 45.0], [74.9, 45.0], [75.0, 45.0], [75.1, 45.0], [75.2, 45.0], [75.3, 45.0], [75.4, 46.0], [75.5, 46.0], [75.6, 46.0], [75.7, 46.0], [75.8, 47.0], [75.9, 47.0], [76.0, 47.0], [76.1, 47.0], [76.2, 47.0], [76.3, 47.0], [76.4, 47.0], [76.5, 47.0], [76.6, 47.0], [76.7, 47.0], [76.8, 47.0], [76.9, 47.0], [77.0, 48.0], [77.1, 48.0], [77.2, 48.0], [77.3, 48.0], [77.4, 48.0], [77.5, 48.0], [77.6, 48.0], [77.7, 48.0], [77.8, 48.0], [77.9, 48.0], [78.0, 48.0], [78.1, 48.0], [78.2, 49.0], [78.3, 49.0], [78.4, 49.0], [78.5, 49.0], [78.6, 49.0], [78.7, 50.0], [78.8, 50.0], [78.9, 50.0], [79.0, 50.0], [79.1, 50.0], [79.2, 50.0], [79.3, 50.0], [79.4, 51.0], [79.5, 51.0], [79.6, 51.0], [79.7, 51.0], [79.8, 51.0], [79.9, 52.0], [80.0, 52.0], [80.1, 52.0], [80.2, 52.0], [80.3, 52.0], [80.4, 52.0], [80.5, 52.0], [80.6, 52.0], [80.7, 53.0], [80.8, 53.0], [80.9, 53.0], [81.0, 53.0], [81.1, 54.0], [81.2, 54.0], [81.3, 54.0], [81.4, 55.0], [81.5, 55.0], [81.6, 56.0], [81.7, 56.0], [81.8, 56.0], [81.9, 56.0], [82.0, 56.0], [82.1, 56.0], [82.2, 56.0], [82.3, 57.0], [82.4, 59.0], [82.5, 59.0], [82.6, 59.0], [82.7, 61.0], [82.8, 62.0], [82.9, 63.0], [83.0, 63.0], [83.1, 64.0], [83.2, 64.0], [83.3, 65.0], [83.4, 65.0], [83.5, 65.0], [83.6, 65.0], [83.7, 65.0], [83.8, 66.0], [83.9, 67.0], [84.0, 67.0], [84.1, 68.0], [84.2, 68.0], [84.3, 68.0], [84.4, 69.0], [84.5, 71.0], [84.6, 72.0], [84.7, 73.0], [84.8, 73.0], [84.9, 74.0], [85.0, 76.0], [85.1, 79.0], [85.2, 79.0], [85.3, 80.0], [85.4, 82.0], [85.5, 87.0], [85.6, 87.0], [85.7, 87.0], [85.8, 89.0], [85.9, 89.0], [86.0, 90.0], [86.1, 93.0], [86.2, 93.0], [86.3, 95.0], [86.4, 103.0], [86.5, 106.0], [86.6, 109.0], [86.7, 109.0], [86.8, 110.0], [86.9, 113.0], [87.0, 114.0], [87.1, 115.0], [87.2, 120.0], [87.3, 128.0], [87.4, 134.0], [87.5, 144.0], [87.6, 146.0], [87.7, 148.0], [87.8, 149.0], [87.9, 150.0], [88.0, 151.0], [88.1, 153.0], [88.2, 154.0], [88.3, 158.0], [88.4, 160.0], [88.5, 160.0], [88.6, 161.0], [88.7, 161.0], [88.8, 167.0], [88.9, 167.0], [89.0, 169.0], [89.1, 169.0], [89.2, 172.0], [89.3, 173.0], [89.4, 173.0], [89.5, 176.0], [89.6, 180.0], [89.7, 181.0], [89.8, 181.0], [89.9, 197.0], [90.0, 198.0], [90.1, 213.0], [90.2, 213.0], [90.3, 215.0], [90.4, 216.0], [90.5, 219.0], [90.6, 222.0], [90.7, 229.0], [90.8, 232.0], [90.9, 257.0], [91.0, 258.0], [91.1, 264.0], [91.2, 269.0], [91.3, 271.0], [91.4, 272.0], [91.5, 282.0], [91.6, 285.0], [91.7, 285.0], [91.8, 295.0], [91.9, 297.0], [92.0, 299.0], [92.1, 305.0], [92.2, 332.0], [92.3, 340.0], [92.4, 345.0], [92.5, 356.0], [92.6, 377.0], [92.7, 395.0], [92.8, 433.0], [92.9, 445.0], [93.0, 445.0], [93.1, 506.0], [93.2, 517.0], [93.3, 536.0], [93.4, 537.0], [93.5, 542.0], [93.6, 542.0], [93.7, 565.0], [93.8, 590.0], [93.9, 591.0], [94.0, 591.0], [94.1, 594.0], [94.2, 604.0], [94.3, 608.0], [94.4, 610.0], [94.5, 615.0], [94.6, 621.0], [94.7, 628.0], [94.8, 633.0], [94.9, 636.0], [95.0, 643.0], [95.1, 649.0], [95.2, 654.0], [95.3, 668.0], [95.4, 676.0], [95.5, 707.0], [95.6, 711.0], [95.7, 721.0], [95.8, 725.0], [95.9, 732.0], [96.0, 736.0], [96.1, 744.0], [96.2, 769.0], [96.3, 774.0], [96.4, 775.0], [96.5, 784.0], [96.6, 796.0], [96.7, 796.0], [96.8, 797.0], [96.9, 807.0], [97.0, 811.0], [97.1, 818.0], [97.2, 819.0], [97.3, 838.0], [97.4, 838.0], [97.5, 879.0], [97.6, 897.0], [97.7, 899.0], [97.8, 904.0], [97.9, 911.0], [98.0, 939.0], [98.1, 951.0], [98.2, 965.0], [98.3, 976.0], [98.4, 978.0], [98.5, 1039.0], [98.6, 1049.0], [98.7, 1051.0], [98.8, 1053.0], [98.9, 1062.0], [99.0, 1064.0], [99.1, 1066.0], [99.2, 1072.0], [99.3, 1077.0], [99.4, 1078.0], [99.5, 1078.0], [99.6, 1079.0], [99.7, 1081.0], [99.8, 1085.0], [99.9, 1087.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 3.0, "minX": 0.0, "maxY": 864.0, "series": [{"data": [[0.0, 864.0], [600.0, 13.0], [300.0, 7.0], [700.0, 14.0], [100.0, 37.0], [400.0, 3.0], [200.0, 20.0], [800.0, 9.0], [900.0, 7.0], [500.0, 11.0], [1000.0, 15.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 69.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 931.0, "series": [{"data": [[1.0, 69.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 931.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 12.29, "minX": 1.549608E12, "maxY": 12.29, "series": [{"data": [[1.549608E12, 12.29]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 32.5, "minX": 1.0, "maxY": 978.0, "series": [{"data": [[2.0, 34.666666666666664], [3.0, 33.46153846153846], [4.0, 33.324675324675304], [5.0, 36.18149466192173], [6.0, 43.39560439560439], [7.0, 51.56250000000001], [8.0, 61.8], [9.0, 70.66666666666666], [10.0, 572.0], [11.0, 79.0], [12.0, 76.33333333333333], [13.0, 286.5], [14.0, 606.25], [15.0, 124.5], [16.0, 430.3333333333333], [17.0, 617.5], [18.0, 415.5], [19.0, 288.2307692307692], [20.0, 134.84848484848484], [21.0, 55.57142857142857], [22.0, 88.2], [23.0, 101.0], [24.0, 113.0], [25.0, 105.0], [26.0, 108.0], [28.0, 108.0], [29.0, 148.0], [30.0, 93.0], [31.0, 147.66666666666666], [33.0, 258.0], [32.0, 232.0], [35.0, 180.0], [34.0, 182.66666666666666], [37.0, 181.0], [36.0, 115.0], [39.0, 216.0], [38.0, 285.0], [41.0, 221.5], [40.0, 243.0], [43.0, 226.0], [42.0, 151.0], [45.0, 312.5], [44.0, 213.0], [47.0, 744.0], [46.0, 398.3333333333333], [49.0, 219.0], [48.0, 395.0], [51.0, 978.0], [50.0, 818.0], [53.0, 480.6666666666667], [55.0, 553.5], [54.0, 565.0], [57.0, 345.0], [56.0, 652.5], [59.0, 769.0], [58.0, 591.0], [61.0, 594.0], [60.0, 707.5], [63.0, 570.3333333333334], [62.0, 976.0], [67.0, 672.0], [66.0, 282.0], [65.0, 857.5], [64.0, 610.0], [71.0, 649.0], [70.0, 297.0], [69.0, 636.0], [68.0, 213.0], [73.0, 654.0], [75.0, 687.5], [74.0, 643.3333333333334], [72.0, 885.0], [79.0, 717.6666666666666], [78.0, 645.5], [77.0, 911.0], [76.0, 605.0], [83.0, 169.0], [82.0, 751.5], [81.0, 712.5], [80.0, 838.0], [87.0, 445.0], [86.0, 518.0], [85.0, 519.5], [84.0, 620.0], [88.0, 554.0], [89.0, 538.0], [1.0, 32.5]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[12.26000000000002, 103.36300000000018]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 89.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 4200.0, "minX": 1.549608E12, "maxY": 7015.816666666667, "series": [{"data": [[1.549608E12, 7015.816666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.549608E12, 4200.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 103.36300000000018, "minX": 1.549608E12, "maxY": 103.36300000000018, "series": [{"data": [[1.549608E12, 103.36300000000018]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 103.35500000000012, "minX": 1.549608E12, "maxY": 103.35500000000012, "series": [{"data": [[1.549608E12, 103.35500000000012]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 16.181999999999974, "minX": 1.549608E12, "maxY": 16.181999999999974, "series": [{"data": [[1.549608E12, 16.181999999999974]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 30.0, "minX": 1.549608E12, "maxY": 1087.0, "series": [{"data": [[1.549608E12, 1087.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.549608E12, 30.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.549608E12, 197.89999999999998]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.549608E12, 1063.98]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.549608E12, 642.6499999999995]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 37.0, "minX": 16.0, "maxY": 37.0, "series": [{"data": [[16.0, 37.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 37.0, "minX": 16.0, "maxY": 37.0, "series": [{"data": [[16.0, 37.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.549608E12, "maxY": 16.666666666666668, "series": [{"data": [[1.549608E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.549608E12, "maxY": 16.666666666666668, "series": [{"data": [[1.549608E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.549608E12, "maxY": 16.666666666666668, "series": [{"data": [[1.549608E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Transactions Per Second"}},
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
