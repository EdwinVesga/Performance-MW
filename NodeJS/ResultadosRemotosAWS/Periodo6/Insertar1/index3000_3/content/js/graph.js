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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 10903.0, "series": [{"data": [[0.0, 1.0], [0.1, 1.0], [0.2, 2.0], [0.3, 2.0], [0.4, 2.0], [0.5, 2.0], [0.6, 2.0], [0.7, 2.0], [0.8, 2.0], [0.9, 2.0], [1.0, 2.0], [1.1, 2.0], [1.2, 2.0], [1.3, 2.0], [1.4, 2.0], [1.5, 2.0], [1.6, 2.0], [1.7, 2.0], [1.8, 2.0], [1.9, 2.0], [2.0, 2.0], [2.1, 2.0], [2.2, 2.0], [2.3, 2.0], [2.4, 2.0], [2.5, 2.0], [2.6, 2.0], [2.7, 2.0], [2.8, 2.0], [2.9, 2.0], [3.0, 2.0], [3.1, 2.0], [3.2, 2.0], [3.3, 2.0], [3.4, 2.0], [3.5, 2.0], [3.6, 2.0], [3.7, 2.0], [3.8, 2.0], [3.9, 2.0], [4.0, 2.0], [4.1, 2.0], [4.2, 2.0], [4.3, 2.0], [4.4, 2.0], [4.5, 2.0], [4.6, 2.0], [4.7, 2.0], [4.8, 2.0], [4.9, 2.0], [5.0, 2.0], [5.1, 2.0], [5.2, 2.0], [5.3, 2.0], [5.4, 2.0], [5.5, 2.0], [5.6, 2.0], [5.7, 2.0], [5.8, 2.0], [5.9, 2.0], [6.0, 2.0], [6.1, 2.0], [6.2, 2.0], [6.3, 2.0], [6.4, 2.0], [6.5, 2.0], [6.6, 2.0], [6.7, 2.0], [6.8, 2.0], [6.9, 2.0], [7.0, 2.0], [7.1, 2.0], [7.2, 2.0], [7.3, 2.0], [7.4, 2.0], [7.5, 2.0], [7.6, 2.0], [7.7, 2.0], [7.8, 2.0], [7.9, 2.0], [8.0, 2.0], [8.1, 2.0], [8.2, 2.0], [8.3, 2.0], [8.4, 2.0], [8.5, 2.0], [8.6, 2.0], [8.7, 2.0], [8.8, 2.0], [8.9, 2.0], [9.0, 2.0], [9.1, 2.0], [9.2, 2.0], [9.3, 2.0], [9.4, 2.0], [9.5, 2.0], [9.6, 2.0], [9.7, 2.0], [9.8, 2.0], [9.9, 2.0], [10.0, 2.0], [10.1, 2.0], [10.2, 2.0], [10.3, 2.0], [10.4, 2.0], [10.5, 2.0], [10.6, 2.0], [10.7, 2.0], [10.8, 2.0], [10.9, 2.0], [11.0, 2.0], [11.1, 2.0], [11.2, 2.0], [11.3, 2.0], [11.4, 2.0], [11.5, 2.0], [11.6, 2.0], [11.7, 2.0], [11.8, 2.0], [11.9, 2.0], [12.0, 2.0], [12.1, 2.0], [12.2, 2.0], [12.3, 2.0], [12.4, 2.0], [12.5, 2.0], [12.6, 2.0], [12.7, 2.0], [12.8, 2.0], [12.9, 2.0], [13.0, 2.0], [13.1, 2.0], [13.2, 2.0], [13.3, 2.0], [13.4, 2.0], [13.5, 2.0], [13.6, 2.0], [13.7, 2.0], [13.8, 2.0], [13.9, 2.0], [14.0, 2.0], [14.1, 2.0], [14.2, 2.0], [14.3, 2.0], [14.4, 2.0], [14.5, 2.0], [14.6, 2.0], [14.7, 2.0], [14.8, 2.0], [14.9, 2.0], [15.0, 2.0], [15.1, 2.0], [15.2, 2.0], [15.3, 2.0], [15.4, 2.0], [15.5, 2.0], [15.6, 2.0], [15.7, 2.0], [15.8, 2.0], [15.9, 2.0], [16.0, 2.0], [16.1, 2.0], [16.2, 2.0], [16.3, 2.0], [16.4, 2.0], [16.5, 2.0], [16.6, 2.0], [16.7, 2.0], [16.8, 2.0], [16.9, 2.0], [17.0, 2.0], [17.1, 2.0], [17.2, 2.0], [17.3, 2.0], [17.4, 2.0], [17.5, 2.0], [17.6, 2.0], [17.7, 2.0], [17.8, 2.0], [17.9, 2.0], [18.0, 2.0], [18.1, 2.0], [18.2, 2.0], [18.3, 2.0], [18.4, 2.0], [18.5, 2.0], [18.6, 2.0], [18.7, 2.0], [18.8, 2.0], [18.9, 2.0], [19.0, 2.0], [19.1, 2.0], [19.2, 2.0], [19.3, 2.0], [19.4, 2.0], [19.5, 2.0], [19.6, 2.0], [19.7, 2.0], [19.8, 2.0], [19.9, 2.0], [20.0, 2.0], [20.1, 2.0], [20.2, 2.0], [20.3, 2.0], [20.4, 2.0], [20.5, 2.0], [20.6, 2.0], [20.7, 2.0], [20.8, 2.0], [20.9, 2.0], [21.0, 2.0], [21.1, 2.0], [21.2, 2.0], [21.3, 2.0], [21.4, 2.0], [21.5, 2.0], [21.6, 2.0], [21.7, 2.0], [21.8, 2.0], [21.9, 2.0], [22.0, 2.0], [22.1, 2.0], [22.2, 2.0], [22.3, 2.0], [22.4, 2.0], [22.5, 2.0], [22.6, 2.0], [22.7, 2.0], [22.8, 2.0], [22.9, 2.0], [23.0, 2.0], [23.1, 2.0], [23.2, 2.0], [23.3, 2.0], [23.4, 2.0], [23.5, 2.0], [23.6, 2.0], [23.7, 2.0], [23.8, 2.0], [23.9, 2.0], [24.0, 2.0], [24.1, 2.0], [24.2, 2.0], [24.3, 2.0], [24.4, 2.0], [24.5, 2.0], [24.6, 2.0], [24.7, 2.0], [24.8, 2.0], [24.9, 2.0], [25.0, 2.0], [25.1, 2.0], [25.2, 2.0], [25.3, 2.0], [25.4, 2.0], [25.5, 2.0], [25.6, 2.0], [25.7, 2.0], [25.8, 2.0], [25.9, 2.0], [26.0, 2.0], [26.1, 2.0], [26.2, 2.0], [26.3, 2.0], [26.4, 2.0], [26.5, 2.0], [26.6, 3.0], [26.7, 3.0], [26.8, 3.0], [26.9, 3.0], [27.0, 3.0], [27.1, 3.0], [27.2, 3.0], [27.3, 3.0], [27.4, 3.0], [27.5, 3.0], [27.6, 3.0], [27.7, 3.0], [27.8, 3.0], [27.9, 3.0], [28.0, 3.0], [28.1, 3.0], [28.2, 3.0], [28.3, 3.0], [28.4, 3.0], [28.5, 3.0], [28.6, 3.0], [28.7, 3.0], [28.8, 3.0], [28.9, 3.0], [29.0, 3.0], [29.1, 3.0], [29.2, 3.0], [29.3, 3.0], [29.4, 3.0], [29.5, 3.0], [29.6, 3.0], [29.7, 3.0], [29.8, 3.0], [29.9, 3.0], [30.0, 3.0], [30.1, 3.0], [30.2, 3.0], [30.3, 3.0], [30.4, 3.0], [30.5, 3.0], [30.6, 3.0], [30.7, 3.0], [30.8, 3.0], [30.9, 3.0], [31.0, 3.0], [31.1, 3.0], [31.2, 3.0], [31.3, 3.0], [31.4, 3.0], [31.5, 3.0], [31.6, 3.0], [31.7, 3.0], [31.8, 3.0], [31.9, 3.0], [32.0, 3.0], [32.1, 3.0], [32.2, 3.0], [32.3, 3.0], [32.4, 3.0], [32.5, 3.0], [32.6, 3.0], [32.7, 3.0], [32.8, 3.0], [32.9, 3.0], [33.0, 3.0], [33.1, 3.0], [33.2, 3.0], [33.3, 3.0], [33.4, 3.0], [33.5, 3.0], [33.6, 3.0], [33.7, 3.0], [33.8, 3.0], [33.9, 3.0], [34.0, 3.0], [34.1, 3.0], [34.2, 3.0], [34.3, 3.0], [34.4, 3.0], [34.5, 3.0], [34.6, 3.0], [34.7, 3.0], [34.8, 3.0], [34.9, 3.0], [35.0, 3.0], [35.1, 3.0], [35.2, 3.0], [35.3, 3.0], [35.4, 3.0], [35.5, 3.0], [35.6, 3.0], [35.7, 3.0], [35.8, 3.0], [35.9, 3.0], [36.0, 3.0], [36.1, 3.0], [36.2, 3.0], [36.3, 3.0], [36.4, 3.0], [36.5, 3.0], [36.6, 3.0], [36.7, 3.0], [36.8, 3.0], [36.9, 3.0], [37.0, 3.0], [37.1, 3.0], [37.2, 3.0], [37.3, 3.0], [37.4, 3.0], [37.5, 3.0], [37.6, 3.0], [37.7, 3.0], [37.8, 3.0], [37.9, 3.0], [38.0, 3.0], [38.1, 3.0], [38.2, 3.0], [38.3, 3.0], [38.4, 3.0], [38.5, 3.0], [38.6, 3.0], [38.7, 3.0], [38.8, 3.0], [38.9, 3.0], [39.0, 3.0], [39.1, 3.0], [39.2, 3.0], [39.3, 3.0], [39.4, 3.0], [39.5, 3.0], [39.6, 3.0], [39.7, 3.0], [39.8, 3.0], [39.9, 3.0], [40.0, 3.0], [40.1, 3.0], [40.2, 3.0], [40.3, 3.0], [40.4, 3.0], [40.5, 3.0], [40.6, 3.0], [40.7, 3.0], [40.8, 3.0], [40.9, 3.0], [41.0, 3.0], [41.1, 3.0], [41.2, 3.0], [41.3, 3.0], [41.4, 3.0], [41.5, 3.0], [41.6, 3.0], [41.7, 3.0], [41.8, 3.0], [41.9, 3.0], [42.0, 3.0], [42.1, 3.0], [42.2, 3.0], [42.3, 3.0], [42.4, 3.0], [42.5, 3.0], [42.6, 3.0], [42.7, 3.0], [42.8, 3.0], [42.9, 3.0], [43.0, 3.0], [43.1, 3.0], [43.2, 3.0], [43.3, 3.0], [43.4, 3.0], [43.5, 3.0], [43.6, 4.0], [43.7, 4.0], [43.8, 4.0], [43.9, 4.0], [44.0, 4.0], [44.1, 4.0], [44.2, 4.0], [44.3, 4.0], [44.4, 4.0], [44.5, 4.0], [44.6, 4.0], [44.7, 4.0], [44.8, 4.0], [44.9, 4.0], [45.0, 4.0], [45.1, 4.0], [45.2, 4.0], [45.3, 4.0], [45.4, 4.0], [45.5, 4.0], [45.6, 4.0], [45.7, 4.0], [45.8, 4.0], [45.9, 4.0], [46.0, 4.0], [46.1, 4.0], [46.2, 4.0], [46.3, 4.0], [46.4, 4.0], [46.5, 4.0], [46.6, 4.0], [46.7, 4.0], [46.8, 4.0], [46.9, 5.0], [47.0, 5.0], [47.1, 5.0], [47.2, 5.0], [47.3, 5.0], [47.4, 5.0], [47.5, 5.0], [47.6, 5.0], [47.7, 5.0], [47.8, 5.0], [47.9, 5.0], [48.0, 5.0], [48.1, 6.0], [48.2, 6.0], [48.3, 6.0], [48.4, 6.0], [48.5, 6.0], [48.6, 6.0], [48.7, 6.0], [48.8, 6.0], [48.9, 6.0], [49.0, 6.0], [49.1, 6.0], [49.2, 7.0], [49.3, 7.0], [49.4, 7.0], [49.5, 7.0], [49.6, 7.0], [49.7, 7.0], [49.8, 8.0], [49.9, 8.0], [50.0, 8.0], [50.1, 8.0], [50.2, 8.0], [50.3, 9.0], [50.4, 9.0], [50.5, 9.0], [50.6, 9.0], [50.7, 9.0], [50.8, 10.0], [50.9, 10.0], [51.0, 10.0], [51.1, 10.0], [51.2, 11.0], [51.3, 11.0], [51.4, 11.0], [51.5, 12.0], [51.6, 12.0], [51.7, 12.0], [51.8, 12.0], [51.9, 12.0], [52.0, 13.0], [52.1, 13.0], [52.2, 13.0], [52.3, 13.0], [52.4, 14.0], [52.5, 14.0], [52.6, 15.0], [52.7, 15.0], [52.8, 15.0], [52.9, 16.0], [53.0, 17.0], [53.1, 17.0], [53.2, 18.0], [53.3, 18.0], [53.4, 18.0], [53.5, 19.0], [53.6, 20.0], [53.7, 20.0], [53.8, 21.0], [53.9, 22.0], [54.0, 23.0], [54.1, 24.0], [54.2, 24.0], [54.3, 24.0], [54.4, 25.0], [54.5, 27.0], [54.6, 27.0], [54.7, 29.0], [54.8, 32.0], [54.9, 37.0], [55.0, 39.0], [55.1, 42.0], [55.2, 43.0], [55.3, 45.0], [55.4, 47.0], [55.5, 54.0], [55.6, 62.0], [55.7, 64.0], [55.8, 71.0], [55.9, 74.0], [56.0, 78.0], [56.1, 83.0], [56.2, 90.0], [56.3, 94.0], [56.4, 101.0], [56.5, 106.0], [56.6, 109.0], [56.7, 113.0], [56.8, 114.0], [56.9, 116.0], [57.0, 117.0], [57.1, 118.0], [57.2, 128.0], [57.3, 132.0], [57.4, 137.0], [57.5, 139.0], [57.6, 145.0], [57.7, 177.0], [57.8, 181.0], [57.9, 206.0], [58.0, 208.0], [58.1, 213.0], [58.2, 217.0], [58.3, 238.0], [58.4, 296.0], [58.5, 318.0], [58.6, 327.0], [58.7, 330.0], [58.8, 349.0], [58.9, 469.0], [59.0, 473.0], [59.1, 604.0], [59.2, 702.0], [59.3, 718.0], [59.4, 741.0], [59.5, 754.0], [59.6, 763.0], [59.7, 999.0], [59.8, 1044.0], [59.9, 1139.0], [60.0, 1256.0], [60.1, 1272.0], [60.2, 1353.0], [60.3, 1412.0], [60.4, 1513.0], [60.5, 1544.0], [60.6, 1556.0], [60.7, 1576.0], [60.8, 1640.0], [60.9, 1668.0], [61.0, 1685.0], [61.1, 1817.0], [61.2, 1848.0], [61.3, 1853.0], [61.4, 1860.0], [61.5, 1879.0], [61.6, 1904.0], [61.7, 1913.0], [61.8, 1946.0], [61.9, 1978.0], [62.0, 2025.0], [62.1, 2113.0], [62.2, 2252.0], [62.3, 2293.0], [62.4, 2345.0], [62.5, 2433.0], [62.6, 2464.0], [62.7, 2534.0], [62.8, 2549.0], [62.9, 2607.0], [63.0, 2695.0], [63.1, 2723.0], [63.2, 2824.0], [63.3, 2843.0], [63.4, 2916.0], [63.5, 2952.0], [63.6, 2975.0], [63.7, 2995.0], [63.8, 3038.0], [63.9, 3098.0], [64.0, 3138.0], [64.1, 3170.0], [64.2, 3188.0], [64.3, 3190.0], [64.4, 3193.0], [64.5, 3219.0], [64.6, 3237.0], [64.7, 3242.0], [64.8, 3249.0], [64.9, 3268.0], [65.0, 3286.0], [65.1, 3311.0], [65.2, 3331.0], [65.3, 3359.0], [65.4, 3466.0], [65.5, 3480.0], [65.6, 3547.0], [65.7, 3574.0], [65.8, 3605.0], [65.9, 3677.0], [66.0, 3722.0], [66.1, 3737.0], [66.2, 3778.0], [66.3, 3813.0], [66.4, 3816.0], [66.5, 3819.0], [66.6, 3821.0], [66.7, 3828.0], [66.8, 3833.0], [66.9, 3846.0], [67.0, 3849.0], [67.1, 3854.0], [67.2, 3868.0], [67.3, 3878.0], [67.4, 3885.0], [67.5, 3906.0], [67.6, 3912.0], [67.7, 3931.0], [67.8, 3941.0], [67.9, 3957.0], [68.0, 3979.0], [68.1, 3981.0], [68.2, 4016.0], [68.3, 4041.0], [68.4, 4092.0], [68.5, 4114.0], [68.6, 4157.0], [68.7, 4191.0], [68.8, 4239.0], [68.9, 4324.0], [69.0, 4417.0], [69.1, 4426.0], [69.2, 4507.0], [69.3, 4516.0], [69.4, 4529.0], [69.5, 4554.0], [69.6, 4564.0], [69.7, 4571.0], [69.8, 4576.0], [69.9, 4601.0], [70.0, 4611.0], [70.1, 4659.0], [70.2, 4684.0], [70.3, 4693.0], [70.4, 4706.0], [70.5, 4832.0], [70.6, 4887.0], [70.7, 4932.0], [70.8, 4982.0], [70.9, 5039.0], [71.0, 5071.0], [71.1, 5204.0], [71.2, 5231.0], [71.3, 5333.0], [71.4, 5452.0], [71.5, 5494.0], [71.6, 5505.0], [71.7, 5516.0], [71.8, 5530.0], [71.9, 5557.0], [72.0, 5580.0], [72.1, 5596.0], [72.2, 5642.0], [72.3, 5645.0], [72.4, 5698.0], [72.5, 5724.0], [72.6, 5728.0], [72.7, 5731.0], [72.8, 5736.0], [72.9, 5752.0], [73.0, 5764.0], [73.1, 5774.0], [73.2, 5799.0], [73.3, 5844.0], [73.4, 5874.0], [73.5, 5878.0], [73.6, 5916.0], [73.7, 5941.0], [73.8, 5951.0], [73.9, 5959.0], [74.0, 5966.0], [74.1, 5985.0], [74.2, 6002.0], [74.3, 6025.0], [74.4, 6145.0], [74.5, 6171.0], [74.6, 6191.0], [74.7, 6250.0], [74.8, 6326.0], [74.9, 6403.0], [75.0, 6424.0], [75.1, 6471.0], [75.2, 6492.0], [75.3, 6520.0], [75.4, 6602.0], [75.5, 6666.0], [75.6, 6696.0], [75.7, 6782.0], [75.8, 6858.0], [75.9, 6859.0], [76.0, 6860.0], [76.1, 6862.0], [76.2, 6868.0], [76.3, 6870.0], [76.4, 6896.0], [76.5, 7022.0], [76.6, 7098.0], [76.7, 7213.0], [76.8, 7304.0], [76.9, 7319.0], [77.0, 7345.0], [77.1, 7363.0], [77.2, 7405.0], [77.3, 7441.0], [77.4, 7525.0], [77.5, 7586.0], [77.6, 7639.0], [77.7, 7722.0], [77.8, 7748.0], [77.9, 7779.0], [78.0, 7862.0], [78.1, 7926.0], [78.2, 7928.0], [78.3, 7930.0], [78.4, 7952.0], [78.5, 7980.0], [78.6, 8014.0], [78.7, 8090.0], [78.8, 8136.0], [78.9, 8139.0], [79.0, 8140.0], [79.1, 8142.0], [79.2, 8144.0], [79.3, 8145.0], [79.4, 8146.0], [79.5, 8150.0], [79.6, 8153.0], [79.7, 8155.0], [79.8, 8158.0], [79.9, 8160.0], [80.0, 8163.0], [80.1, 8165.0], [80.2, 8167.0], [80.3, 8168.0], [80.4, 8170.0], [80.5, 8171.0], [80.6, 8173.0], [80.7, 8177.0], [80.8, 8178.0], [80.9, 8180.0], [81.0, 8182.0], [81.1, 8189.0], [81.2, 8191.0], [81.3, 8205.0], [81.4, 8212.0], [81.5, 8223.0], [81.6, 8235.0], [81.7, 8245.0], [81.8, 8254.0], [81.9, 8266.0], [82.0, 8273.0], [82.1, 8294.0], [82.2, 8310.0], [82.3, 8342.0], [82.4, 8351.0], [82.5, 8367.0], [82.6, 8375.0], [82.7, 8401.0], [82.8, 8447.0], [82.9, 8481.0], [83.0, 8485.0], [83.1, 8504.0], [83.2, 8516.0], [83.3, 8520.0], [83.4, 8526.0], [83.5, 8529.0], [83.6, 8532.0], [83.7, 8539.0], [83.8, 8542.0], [83.9, 8545.0], [84.0, 8545.0], [84.1, 8547.0], [84.2, 8548.0], [84.3, 8549.0], [84.4, 8550.0], [84.5, 8551.0], [84.6, 8551.0], [84.7, 8552.0], [84.8, 8553.0], [84.9, 8554.0], [85.0, 8555.0], [85.1, 8556.0], [85.2, 8556.0], [85.3, 8557.0], [85.4, 8557.0], [85.5, 8559.0], [85.6, 8559.0], [85.7, 8561.0], [85.8, 8563.0], [85.9, 8567.0], [86.0, 8569.0], [86.1, 8582.0], [86.2, 8588.0], [86.3, 8602.0], [86.4, 8614.0], [86.5, 8616.0], [86.6, 8619.0], [86.7, 8625.0], [86.8, 8628.0], [86.9, 8644.0], [87.0, 8649.0], [87.1, 8657.0], [87.2, 8669.0], [87.3, 8681.0], [87.4, 8683.0], [87.5, 8691.0], [87.6, 8713.0], [87.7, 8721.0], [87.8, 8731.0], [87.9, 8737.0], [88.0, 8747.0], [88.1, 8758.0], [88.2, 8791.0], [88.3, 8807.0], [88.4, 8873.0], [88.5, 8885.0], [88.6, 8888.0], [88.7, 8891.0], [88.8, 8898.0], [88.9, 8917.0], [89.0, 8928.0], [89.1, 8934.0], [89.2, 8953.0], [89.3, 8973.0], [89.4, 8985.0], [89.5, 8993.0], [89.6, 9000.0], [89.7, 9004.0], [89.8, 9011.0], [89.9, 9017.0], [90.0, 9039.0], [90.1, 9097.0], [90.2, 9114.0], [90.3, 9117.0], [90.4, 9121.0], [90.5, 9123.0], [90.6, 9129.0], [90.7, 9130.0], [90.8, 9135.0], [90.9, 9146.0], [91.0, 9149.0], [91.1, 9185.0], [91.2, 9193.0], [91.3, 9208.0], [91.4, 9212.0], [91.5, 9216.0], [91.6, 9217.0], [91.7, 9226.0], [91.8, 9229.0], [91.9, 9239.0], [92.0, 9241.0], [92.1, 9246.0], [92.2, 9249.0], [92.3, 9253.0], [92.4, 9256.0], [92.5, 9262.0], [92.6, 9272.0], [92.7, 9283.0], [92.8, 9316.0], [92.9, 9329.0], [93.0, 9390.0], [93.1, 9407.0], [93.2, 9460.0], [93.3, 9467.0], [93.4, 9469.0], [93.5, 9479.0], [93.6, 9484.0], [93.7, 9492.0], [93.8, 9495.0], [93.9, 9499.0], [94.0, 9503.0], [94.1, 9507.0], [94.2, 9509.0], [94.3, 9512.0], [94.4, 9516.0], [94.5, 9519.0], [94.6, 9522.0], [94.7, 9525.0], [94.8, 9534.0], [94.9, 9539.0], [95.0, 9555.0], [95.1, 9559.0], [95.2, 9567.0], [95.3, 9577.0], [95.4, 9580.0], [95.5, 9606.0], [95.6, 9618.0], [95.7, 9628.0], [95.8, 9641.0], [95.9, 9659.0], [96.0, 9664.0], [96.1, 9701.0], [96.2, 9717.0], [96.3, 9722.0], [96.4, 9725.0], [96.5, 9732.0], [96.6, 9742.0], [96.7, 9757.0], [96.8, 9768.0], [96.9, 9773.0], [97.0, 9780.0], [97.1, 9781.0], [97.2, 9792.0], [97.3, 9806.0], [97.4, 9815.0], [97.5, 9845.0], [97.6, 9882.0], [97.7, 9891.0], [97.8, 9900.0], [97.9, 9945.0], [98.0, 9953.0], [98.1, 9960.0], [98.2, 9966.0], [98.3, 9976.0], [98.4, 9982.0], [98.5, 9989.0], [98.6, 9996.0], [98.7, 10022.0], [98.8, 10038.0], [98.9, 10051.0], [99.0, 10062.0], [99.1, 10093.0], [99.2, 10122.0], [99.3, 10157.0], [99.4, 10196.0], [99.5, 10260.0], [99.6, 10293.0], [99.7, 10332.0], [99.8, 10373.0], [99.9, 10882.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 1692.0, "series": [{"data": [[0.0, 1692.0], [100.0, 44.0], [200.0, 17.0], [300.0, 13.0], [400.0, 6.0], [600.0, 4.0], [700.0, 13.0], [800.0, 2.0], [900.0, 1.0], [1000.0, 4.0], [1100.0, 2.0], [1200.0, 6.0], [1300.0, 4.0], [1400.0, 4.0], [1500.0, 11.0], [1600.0, 9.0], [1700.0, 1.0], [1800.0, 14.0], [1900.0, 12.0], [2000.0, 4.0], [2100.0, 2.0], [2200.0, 5.0], [2300.0, 5.0], [2400.0, 6.0], [2500.0, 5.0], [2600.0, 5.0], [2700.0, 4.0], [2800.0, 6.0], [2900.0, 11.0], [3000.0, 6.0], [3100.0, 15.0], [3200.0, 19.0], [3300.0, 8.0], [3400.0, 6.0], [3500.0, 8.0], [3600.0, 6.0], [3700.0, 7.0], [3800.0, 37.0], [3900.0, 21.0], [4000.0, 8.0], [4100.0, 10.0], [4200.0, 4.0], [4300.0, 2.0], [4400.0, 7.0], [4500.0, 21.0], [4600.0, 14.0], [4700.0, 4.0], [4800.0, 4.0], [4900.0, 6.0], [5000.0, 6.0], [5100.0, 2.0], [5200.0, 5.0], [5300.0, 3.0], [5400.0, 7.0], [5500.0, 16.0], [5600.0, 9.0], [5700.0, 24.0], [5800.0, 10.0], [5900.0, 19.0], [6100.0, 7.0], [6000.0, 6.0], [6200.0, 4.0], [6300.0, 4.0], [6400.0, 10.0], [6500.0, 5.0], [6600.0, 7.0], [6700.0, 3.0], [6800.0, 21.0], [6900.0, 2.0], [7000.0, 4.0], [7100.0, 2.0], [7200.0, 3.0], [7300.0, 12.0], [7400.0, 4.0], [7500.0, 6.0], [7600.0, 5.0], [7700.0, 8.0], [7800.0, 3.0], [7900.0, 15.0], [8000.0, 6.0], [8100.0, 76.0], [8200.0, 26.0], [8300.0, 16.0], [8500.0, 96.0], [8400.0, 12.0], [8600.0, 37.0], [8700.0, 23.0], [8800.0, 17.0], [8900.0, 22.0], [9100.0, 33.0], [9000.0, 16.0], [9200.0, 45.0], [9700.0, 35.0], [9300.0, 11.0], [9400.0, 25.0], [9600.0, 19.0], [9500.0, 46.0], [10000.0, 13.0], [9800.0, 16.0], [9900.0, 27.0], [10100.0, 9.0], [10200.0, 7.0], [10300.0, 6.0], [10700.0, 1.0], [10900.0, 2.0], [10800.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 10900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 40.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1772.0, "series": [{"data": [[1.0, 40.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1772.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1188.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 105.00478468899523, "minX": 1.5495864E12, "maxY": 249.01755643138677, "series": [{"data": [[1.54958646E12, 105.00478468899523], [1.5495864E12, 249.01755643138677]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958646E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 17.914804469273744, "minX": 1.0, "maxY": 10375.0, "series": [{"data": [[2.0, 17.914804469273744], [3.0, 72.26285714285714], [4.0, 45.0], [5.0, 218.73469387755102], [6.0, 415.5], [7.0, 488.86363636363643], [8.0, 447.9583333333333], [9.0, 657.25], [10.0, 486.72727272727275], [11.0, 492.77272727272725], [12.0, 1304.875], [13.0, 2067.2], [14.0, 10161.0], [15.0, 2047.6], [16.0, 2574.75], [17.0, 3449.0], [18.0, 3451.6666666666665], [19.0, 2585.0], [20.0, 2572.25], [21.0, 2526.75], [22.0, 2541.5], [23.0, 2541.0], [24.0, 3370.3333333333335], [25.0, 5005.5], [26.0, 3395.0], [27.0, 3405.0], [28.0, 3357.3333333333335], [29.0, 1705.0], [30.0, 2048.8], [31.0, 2540.5], [33.0, 3337.3333333333335], [32.0, 4995.0], [35.0, 2585.5], [34.0, 5041.5], [37.0, 2595.25], [36.0, 2527.5], [39.0, 1459.0], [38.0, 3327.0], [41.0, 5156.5], [40.0, 3333.0], [43.0, 5075.0], [42.0, 5045.0], [45.0, 2516.0], [44.0, 2551.25], [47.0, 5027.0], [46.0, 10110.0], [48.0, 3371.6666666666665], [49.0, 9960.0], [51.0, 2543.5], [50.0, 5077.5], [52.0, 2561.75], [53.0, 10044.0], [55.0, 9959.0], [54.0, 10038.0], [57.0, 9845.0], [56.0, 9995.0], [59.0, 2070.6], [58.0, 9891.0], [60.0, 3376.3333333333335], [61.0, 9887.0], [63.0, 3347.6666666666665], [62.0, 9815.0], [64.0, 1747.3333333333335], [65.0, 4965.5], [67.0, 9810.0], [66.0, 9882.0], [71.0, 9786.0], [70.0, 9792.0], [69.0, 9800.0], [68.0, 9797.0], [74.0, 4995.5], [75.0, 9780.0], [73.0, 9780.0], [72.0, 9786.0], [79.0, 9852.0], [78.0, 9773.0], [77.0, 9768.0], [76.0, 9775.0], [83.0, 9891.0], [82.0, 9839.0], [81.0, 9766.0], [80.0, 9769.0], [87.0, 9744.0], [86.0, 9760.0], [85.0, 10373.0], [84.0, 10375.0], [91.0, 9725.0], [90.0, 9926.0], [89.0, 9742.0], [88.0, 9739.0], [95.0, 9717.0], [94.0, 9732.0], [93.0, 9722.0], [92.0, 9781.0], [96.0, 4974.5], [97.0, 1769.6666666666665], [99.0, 9715.0], [98.0, 9723.0], [103.0, 9747.0], [102.0, 9717.0], [101.0, 9757.0], [100.0, 9722.0], [105.0, 5069.5], [107.0, 9742.0], [106.0, 9900.0], [104.0, 9781.0], [110.0, 3396.0], [111.0, 9658.0], [109.0, 9659.0], [108.0, 9664.0], [114.0, 1783.0], [113.0, 1795.0], [112.0, 4949.5], [115.0, 9628.0], [119.0, 10124.0], [118.0, 9623.0], [117.0, 9773.0], [116.0, 9641.0], [123.0, 9580.0], [122.0, 9572.0], [121.0, 9578.0], [120.0, 9577.0], [126.0, 5025.0], [127.0, 9706.0], [125.0, 9643.0], [124.0, 9634.0], [129.0, 4914.0], [135.0, 9539.0], [134.0, 9536.0], [133.0, 9525.0], [132.0, 9541.0], [131.0, 9536.0], [130.0, 9534.0], [128.0, 9631.0], [143.0, 9522.0], [142.0, 9522.0], [141.0, 9521.0], [140.0, 9578.0], [139.0, 9517.0], [138.0, 9539.0], [137.0, 9532.0], [136.0, 9522.0], [144.0, 4945.0], [151.0, 9519.0], [150.0, 9520.0], [149.0, 9513.0], [148.0, 9508.0], [147.0, 9987.0], [146.0, 9515.0], [145.0, 9574.0], [157.0, 4968.0], [159.0, 9615.0], [158.0, 9507.0], [156.0, 9509.0], [155.0, 9606.0], [154.0, 9510.0], [153.0, 9547.0], [162.0, 4963.5], [163.0, 4905.5], [167.0, 9498.0], [166.0, 9505.0], [165.0, 9490.0], [164.0, 9499.0], [161.0, 9499.0], [160.0, 9567.0], [170.0, 3401.3333333333335], [169.0, 4909.5], [171.0, 4918.0], [173.0, 2636.0], [174.0, 4912.0], [175.0, 9555.0], [172.0, 9562.0], [168.0, 9511.0], [183.0, 9467.0], [182.0, 9806.0], [181.0, 9473.0], [180.0, 9474.0], [179.0, 9480.0], [178.0, 9484.0], [177.0, 9500.0], [176.0, 9487.0], [191.0, 9460.0], [190.0, 9517.0], [189.0, 9479.0], [188.0, 9466.0], [187.0, 9467.0], [186.0, 9492.0], [185.0, 9468.0], [184.0, 9466.0], [199.0, 9616.0], [198.0, 9559.0], [197.0, 9626.0], [196.0, 9562.0], [195.0, 9503.0], [194.0, 9443.0], [193.0, 9469.0], [192.0, 9460.0], [207.0, 9282.0], [206.0, 9392.0], [205.0, 9482.0], [204.0, 9390.0], [203.0, 9407.0], [202.0, 9375.0], [201.0, 9492.0], [200.0, 9495.0], [215.0, 9256.0], [214.0, 9255.0], [213.0, 9241.0], [212.0, 9240.0], [211.0, 9233.0], [210.0, 9240.0], [209.0, 9269.0], [208.0, 9398.0], [223.0, 9253.0], [222.0, 9251.0], [221.0, 9248.0], [220.0, 9252.0], [219.0, 9329.0], [218.0, 9249.0], [217.0, 9246.0], [216.0, 9259.0], [231.0, 9254.0], [230.0, 9316.0], [229.0, 9243.0], [228.0, 9265.0], [227.0, 9216.0], [226.0, 9262.0], [225.0, 9217.0], [224.0, 9272.0], [237.0, 4902.5], [239.0, 4848.0], [238.0, 9226.0], [236.0, 9246.0], [235.0, 9324.0], [234.0, 9239.0], [233.0, 9303.0], [232.0, 9247.0], [240.0, 2657.25], [243.0, 4845.0], [247.0, 9212.0], [246.0, 9216.0], [245.0, 9211.0], [244.0, 9215.0], [242.0, 9206.0], [241.0, 9228.0], [255.0, 9356.0], [254.0, 9257.0], [253.0, 9209.0], [252.0, 9223.0], [251.0, 9208.0], [250.0, 9232.0], [249.0, 9216.0], [248.0, 9228.0], [271.0, 9149.0], [266.0, 4918.5], [270.0, 9187.0], [269.0, 9134.0], [268.0, 9130.0], [259.0, 10055.0], [258.0, 10062.0], [257.0, 10051.0], [256.0, 9283.0], [267.0, 9157.0], [265.0, 9207.0], [264.0, 9136.0], [263.0, 9148.0], [262.0, 9147.0], [261.0, 9193.0], [260.0, 9189.0], [287.0, 9114.0], [272.0, 4889.0], [277.0, 4914.5], [276.0, 9134.0], [279.0, 9122.0], [278.0, 9121.0], [282.0, 2743.25], [286.0, 9114.0], [285.0, 9117.0], [284.0, 9185.0], [275.0, 9129.0], [274.0, 9130.0], [273.0, 9129.0], [283.0, 9122.0], [281.0, 9141.0], [280.0, 9123.0], [302.0, 9009.0], [303.0, 9000.0], [301.0, 9001.0], [300.0, 9011.0], [299.0, 9004.0], [298.0, 9013.0], [297.0, 9022.0], [296.0, 9039.0], [295.0, 9046.0], [289.0, 9123.0], [288.0, 9101.0], [291.0, 9279.0], [290.0, 9181.0], [294.0, 9097.0], [293.0, 9115.0], [292.0, 9302.0], [318.0, 8931.0], [319.0, 8934.0], [317.0, 9050.0], [316.0, 9146.0], [315.0, 9027.0], [314.0, 9726.0], [313.0, 8987.0], [312.0, 8983.0], [311.0, 9017.0], [305.0, 8994.0], [304.0, 9001.0], [307.0, 9004.0], [306.0, 8994.0], [310.0, 8986.0], [309.0, 8985.0], [308.0, 8993.0], [334.0, 4890.0], [335.0, 8891.0], [333.0, 8891.0], [332.0, 8899.0], [331.0, 8898.0], [330.0, 8977.0], [329.0, 8972.0], [328.0, 9014.0], [327.0, 8970.0], [321.0, 8927.0], [320.0, 8937.0], [323.0, 8928.0], [322.0, 8931.0], [326.0, 8973.0], [325.0, 8950.0], [324.0, 8953.0], [350.0, 3408.6666666666665], [337.0, 4804.0], [339.0, 8885.0], [338.0, 8890.0], [336.0, 3514.0], [342.0, 4864.0], [341.0, 8873.0], [340.0, 8877.0], [343.0, 8888.0], [346.0, 4830.5], [347.0, 8866.0], [345.0, 4813.0], [351.0, 4735.0], [344.0, 8891.0], [349.0, 8731.0], [348.0, 8904.0], [366.0, 8628.0], [356.0, 2794.0], [357.0, 8862.0], [367.0, 8620.0], [365.0, 8625.0], [364.0, 8782.5], [362.0, 8691.0], [361.0, 8687.0], [360.0, 8790.0], [359.0, 8771.0], [353.0, 8707.0], [352.0, 8719.0], [355.0, 8755.0], [354.0, 8713.0], [358.0, 8757.0], [382.0, 8736.0], [383.0, 8649.0], [381.0, 8647.0], [380.0, 8650.0], [379.0, 8542.0], [378.0, 8531.0], [377.0, 8679.0], [376.0, 8632.0], [375.0, 8588.0], [369.0, 8615.0], [368.0, 8616.0], [371.0, 8615.0], [370.0, 8614.0], [374.0, 8580.0], [373.0, 8602.0], [372.0, 8619.0], [398.0, 8557.0], [399.0, 8552.0], [397.0, 8557.0], [396.0, 8552.0], [395.0, 8644.0], [394.0, 8552.0], [393.0, 8564.0], [392.0, 8736.0], [391.0, 8559.0], [385.0, 8746.0], [384.0, 8550.0], [387.0, 8540.0], [386.0, 8651.0], [390.0, 8559.0], [389.0, 8558.0], [388.0, 8542.0], [414.0, 8561.0], [415.0, 8670.0], [413.0, 8681.0], [412.0, 8551.0], [411.0, 8555.0], [410.0, 8560.5], [408.0, 8553.0], [407.0, 8567.0], [401.0, 8556.0], [400.0, 8551.0], [403.0, 8559.0], [402.0, 8561.0], [406.0, 8559.0], [405.0, 8545.0], [404.0, 8551.0], [419.0, 8549.0], [430.0, 8626.0], [429.0, 8555.0], [418.0, 8721.0], [417.0, 8726.0], [416.0, 8549.0], [427.0, 8613.0], [426.0, 8548.0], [424.0, 8737.0], [423.0, 8747.0], [422.0, 8547.0], [421.0, 8744.0], [420.0, 8539.0], [446.0, 8556.0], [439.0, 4834.5], [433.0, 8555.0], [432.0, 8676.0], [435.0, 8554.0], [434.0, 8628.0], [438.0, 8645.0], [437.0, 8563.0], [436.0, 8560.0], [447.0, 8582.0], [445.0, 8559.0], [444.0, 8569.0], [443.0, 8557.0], [442.0, 8557.0], [441.0, 8553.0], [440.0, 8559.0], [462.0, 8553.0], [463.0, 8543.0], [461.0, 8683.0], [460.0, 8545.0], [459.0, 8545.0], [458.0, 8557.0], [457.0, 8540.0], [456.0, 8547.0], [455.0, 8546.0], [449.0, 8552.0], [448.0, 8683.0], [451.0, 8552.0], [450.0, 8557.0], [454.0, 8683.0], [453.0, 8548.0], [452.0, 8567.0], [479.0, 8794.0], [466.0, 4844.5], [465.0, 4787.0], [464.0, 8704.0], [471.0, 8549.0], [470.0, 8616.0], [469.0, 8556.0], [468.0, 8545.0], [475.0, 4863.5], [478.0, 8662.0], [477.0, 8537.0], [476.0, 8564.0], [467.0, 8550.0], [474.0, 8588.0], [473.0, 8792.0], [472.0, 8637.0], [494.0, 8516.0], [495.0, 8516.0], [493.0, 8516.0], [492.0, 8545.0], [491.0, 8518.0], [490.0, 8521.0], [489.0, 8526.0], [488.0, 8517.0], [487.0, 8520.0], [481.0, 8527.0], [480.0, 8530.0], [483.0, 8526.0], [482.0, 8669.0], [486.0, 8598.0], [485.0, 8526.0], [484.0, 8533.0], [510.0, 8657.0], [511.0, 4851.5], [509.0, 8587.0], [508.0, 8619.0], [507.0, 8583.0], [506.0, 8529.0], [505.0, 8504.0], [504.0, 8485.0], [503.0, 8481.0], [497.0, 8496.0], [496.0, 8532.0], [499.0, 8684.0], [498.0, 8663.0], [502.0, 8486.0], [501.0, 8483.0], [500.0, 8483.0], [539.0, 8223.0], [512.0, 4750.0], [527.0, 8297.0], [526.0, 8273.0], [536.0, 8237.0], [519.0, 8401.0], [518.0, 8368.0], [517.0, 8367.0], [516.0, 8370.0], [515.0, 8551.0], [514.0, 8384.0], [513.0, 8386.0], [522.0, 4870.5], [521.0, 8311.0], [520.0, 8447.0], [524.0, 8310.0], [523.0, 8294.0], [525.0, 4766.5], [541.0, 4815.5], [543.0, 8578.0], [535.0, 8235.0], [534.0, 8240.0], [533.0, 8343.0], [532.0, 8245.0], [531.0, 8249.0], [530.0, 8264.0], [529.0, 8351.0], [528.0, 8262.0], [542.0, 8448.0], [540.0, 8346.0], [538.0, 8230.0], [537.0, 8254.0], [569.0, 8158.0], [573.0, 8139.0], [560.0, 4743.0], [562.0, 8170.0], [561.0, 8214.0], [565.0, 8217.0], [563.0, 8212.0], [567.0, 8164.0], [566.0, 8342.0], [575.0, 8144.0], [574.0, 8136.0], [572.0, 8154.0], [571.0, 8150.0], [570.0, 8158.0], [568.0, 8375.0], [551.0, 8179.0], [550.0, 8178.0], [549.0, 8171.0], [548.0, 8169.0], [547.0, 8180.0], [546.0, 8179.0], [545.0, 8182.0], [544.0, 8555.0], [559.0, 8178.0], [558.0, 8211.0], [557.0, 8208.0], [556.0, 8177.0], [555.0, 8191.0], [554.0, 8190.0], [553.0, 8173.0], [552.0, 8173.0], [603.0, 8150.0], [607.0, 8157.0], [577.0, 4859.0], [576.0, 8142.0], [578.0, 8142.0], [580.0, 8139.0], [579.0, 8192.0], [582.0, 8144.0], [581.0, 8147.0], [591.0, 8155.0], [590.0, 8182.0], [589.0, 8149.0], [588.0, 8181.0], [587.0, 8144.0], [586.0, 8140.0], [585.0, 8146.0], [584.0, 8143.0], [583.0, 4698.5], [592.0, 4730.5], [593.0, 4739.5], [598.0, 4777.5], [597.0, 8283.0], [596.0, 8174.0], [595.0, 8143.0], [594.0, 8153.0], [599.0, 8151.0], [601.0, 4782.5], [600.0, 8188.0], [602.0, 8189.0], [604.0, 8225.0], [606.0, 8145.0], [605.0, 8275.0], [636.0, 8145.0], [615.0, 4826.0], [614.0, 8160.0], [613.0, 8160.0], [612.0, 8139.0], [611.0, 8155.0], [610.0, 8159.0], [609.0, 8356.0], [608.0, 8267.0], [623.0, 8167.0], [622.0, 8177.0], [621.0, 8163.0], [620.0, 8168.0], [619.0, 8171.0], [618.0, 8179.5], [616.0, 8266.0], [639.0, 8109.0], [625.0, 8168.0], [624.0, 8182.0], [627.0, 8167.0], [626.0, 8189.0], [629.0, 8165.0], [628.0, 8172.0], [631.0, 8247.0], [630.0, 8170.0], [638.0, 8090.0], [637.0, 8090.0], [635.0, 8139.0], [634.0, 8160.0], [633.0, 8169.0], [632.0, 8167.0], [667.0, 4631.5], [644.0, 4713.0], [643.0, 8000.0], [642.0, 7952.0], [641.0, 7961.0], [640.0, 8027.0], [646.0, 7928.0], [645.0, 7984.0], [655.0, 7933.0], [654.0, 7929.0], [653.0, 7929.0], [652.0, 7928.0], [651.0, 7926.0], [650.0, 7930.0], [649.0, 7927.0], [648.0, 7980.0], [647.0, 4721.5], [656.0, 3653.3333333333335], [657.0, 7976.0], [659.0, 7887.0], [658.0, 8035.0], [661.0, 7784.0], [660.0, 7862.0], [663.0, 7779.0], [662.0, 7822.0], [664.0, 4601.5], [666.0, 7751.0], [665.0, 7745.0], [671.0, 7639.0], [670.0, 7669.0], [669.0, 7722.0], [668.0, 7749.0], [699.0, 7314.0], [685.0, 4502.5], [684.0, 4454.5], [683.0, 7356.0], [682.0, 7359.0], [681.0, 7405.0], [680.0, 7500.0], [692.0, 4455.0], [691.0, 7441.0], [690.0, 7334.0], [689.0, 7363.0], [688.0, 7410.0], [693.0, 7310.0], [695.0, 7243.0], [694.0, 7304.0], [701.0, 4341.0], [700.0, 3440.0], [703.0, 7055.0], [702.0, 7098.0], [698.0, 7319.0], [697.0, 7246.0], [696.0, 7174.0], [679.0, 7673.0], [678.0, 7529.0], [677.0, 7525.0], [676.0, 7586.0], [675.0, 7518.0], [674.0, 7561.0], [673.0, 7615.0], [672.0, 7621.0], [687.0, 7366.0], [686.0, 7384.0], [729.0, 6774.0], [733.0, 6696.0], [704.0, 4289.5], [719.0, 6895.0], [718.0, 6862.0], [717.0, 6859.0], [716.0, 6880.0], [715.0, 6860.0], [714.0, 6860.0], [713.0, 6859.0], [712.0, 6863.0], [728.0, 6868.0], [711.0, 6858.0], [710.0, 6858.0], [709.0, 6869.0], [708.0, 6868.0], [707.0, 6870.0], [706.0, 6997.0], [705.0, 7022.0], [720.0, 4267.5], [722.0, 4236.0], [721.0, 6901.0], [723.0, 6852.0], [725.0, 6853.0], [724.0, 6861.0], [727.0, 6865.0], [726.0, 6859.0], [734.0, 6675.0], [732.0, 6668.0], [731.0, 6782.0], [730.0, 6782.0], [764.0, 6180.0], [761.0, 3171.0], [767.0, 3152.666666666667], [753.0, 6403.0], [752.0, 6354.0], [755.0, 6424.0], [754.0, 6360.0], [757.0, 6250.0], [756.0, 6302.0], [766.0, 3151.0], [765.0, 6186.0], [763.0, 6191.0], [762.0, 6210.0], [760.0, 6208.0], [751.0, 6414.0], [737.0, 6617.0], [736.0, 6632.0], [739.0, 6602.0], [738.0, 6616.0], [741.0, 6541.0], [740.0, 6520.0], [743.0, 6492.0], [742.0, 6479.0], [750.0, 6453.0], [749.0, 6415.0], [748.0, 6435.0], [747.0, 6471.0], [746.0, 6505.0], [745.0, 6509.0], [744.0, 6490.0], [759.0, 6279.0], [758.0, 6326.0], [796.0, 5752.0], [770.0, 3856.5], [771.0, 3809.5], [773.0, 5968.0], [772.0, 5962.0], [775.0, 6025.0], [774.0, 5946.0], [793.0, 5874.0], [792.0, 5945.0], [777.0, 3887.0], [776.0, 5961.0], [779.0, 6005.0], [778.0, 5959.0], [781.0, 5941.0], [780.0, 6022.0], [783.0, 5953.0], [769.0, 5992.0], [768.0, 5985.0], [782.0, 5937.0], [799.0, 5730.0], [784.0, 5951.0], [787.0, 6073.5], [785.0, 6027.0], [789.0, 6151.0], [788.0, 5980.0], [791.0, 5936.0], [790.0, 5916.0], [798.0, 5728.0], [797.0, 5736.0], [795.0, 5878.0], [794.0, 5902.0], [829.0, 5703.0], [816.0, 3844.5], [817.0, 5793.0], [819.0, 5732.0], [818.0, 5799.0], [821.0, 5655.0], [820.0, 5764.0], [823.0, 5644.0], [822.0, 5645.0], [825.0, 3746.0], [831.0, 3853.5], [830.0, 5877.0], [828.0, 5698.0], [827.0, 5693.0], [826.0, 5642.0], [824.0, 5645.0], [807.0, 5838.0], [806.0, 5727.0], [805.0, 5731.0], [804.0, 5804.0], [803.0, 5772.0], [802.0, 5761.0], [801.0, 5845.0], [800.0, 5731.0], [815.0, 5789.0], [814.0, 5774.0], [813.0, 5712.0], [812.0, 5759.0], [811.0, 5727.0], [810.0, 5737.0], [809.0, 5773.0], [808.0, 5730.0], [859.0, 5586.0], [849.0, 2333.125], [847.0, 3726.0], [833.0, 5596.0], [832.0, 5884.0], [835.0, 5580.0], [834.0, 5592.0], [837.0, 5552.0], [836.0, 5576.0], [839.0, 5603.0], [838.0, 5578.0], [846.0, 5530.0], [845.0, 5514.0], [844.0, 5516.0], [843.0, 5525.0], [842.0, 5529.0], [841.0, 5874.0], [840.0, 5844.0], [852.0, 3087.666666666667], [851.0, 3097.666666666667], [850.0, 5505.0], [854.0, 3067.666666666667], [853.0, 5494.0], [855.0, 3656.0], [856.0, 3888.0], [860.0, 2602.6], [858.0, 5367.0], [857.0, 5436.0], [861.0, 3097.666666666667], [863.0, 5462.0], [848.0, 5506.0], [862.0, 5279.0], [892.0, 3338.0], [872.0, 3477.5], [873.0, 4982.0], [875.0, 5033.0], [874.0, 5031.0], [877.0, 5231.0], [876.0, 5039.0], [879.0, 4907.0], [865.0, 5205.0], [864.0, 5204.0], [867.0, 5195.0], [866.0, 5205.0], [869.0, 5065.0], [868.0, 5193.0], [871.0, 5061.0], [870.0, 5071.0], [878.0, 4940.0], [888.0, 3374.0], [895.0, 4710.0], [881.0, 4856.0], [880.0, 4832.0], [883.0, 4913.0], [882.0, 4887.0], [885.0, 4861.0], [884.0, 4932.0], [887.0, 4684.0], [886.0, 4688.0], [894.0, 4706.0], [893.0, 4703.0], [891.0, 4693.0], [890.0, 4691.0], [889.0, 4672.0], [924.0, 4529.0], [910.0, 3337.0], [909.0, 4606.0], [908.0, 4611.0], [907.0, 4601.0], [906.0, 4581.0], [905.0, 4576.0], [904.0, 4572.0], [911.0, 4563.0], [897.0, 4674.0], [896.0, 4659.0], [899.0, 4633.0], [898.0, 4617.0], [901.0, 4571.0], [900.0, 4573.0], [903.0, 4577.0], [902.0, 4571.0], [927.0, 4422.0], [913.0, 4564.0], [912.0, 4570.0], [915.0, 4554.0], [914.0, 4550.0], [917.0, 4523.0], [916.0, 4516.0], [919.0, 4511.0], [918.0, 4554.0], [926.0, 4417.0], [925.0, 4418.0], [923.0, 4507.0], [922.0, 4511.0], [921.0, 4529.0], [920.0, 4556.0], [956.0, 4041.0], [930.0, 3262.0], [929.0, 4435.0], [928.0, 4426.0], [931.0, 4441.0], [933.0, 4241.0], [932.0, 4324.0], [935.0, 4239.0], [934.0, 4269.0], [943.0, 4135.0], [942.0, 4092.0], [941.0, 4102.0], [940.0, 4191.0], [939.0, 4157.0], [938.0, 4194.0], [937.0, 4177.0], [936.0, 4379.0], [959.0, 4108.0], [945.0, 4114.0], [944.0, 4176.0], [947.0, 4014.0], [946.0, 4227.0], [949.0, 4069.0], [948.0, 4067.0], [951.0, 3981.0], [950.0, 4022.0], [958.0, 4114.0], [957.0, 4041.0], [955.0, 3941.0], [954.0, 3882.0], [953.0, 3885.0], [952.0, 3930.0], [984.0, 3957.0], [990.0, 3821.0], [986.0, 3061.5], [962.0, 3001.0], [961.0, 3849.0], [960.0, 3851.0], [964.0, 3854.0], [963.0, 3964.0], [966.0, 3847.0], [965.0, 3980.0], [975.0, 3940.0], [974.0, 3894.0], [973.0, 3884.0], [972.0, 3876.0], [971.0, 3868.0], [970.0, 3994.0], [969.0, 3846.0], [968.0, 3911.5], [991.0, 3821.0], [977.0, 3979.0], [976.0, 3931.0], [979.0, 3934.0], [978.0, 4016.0], [981.0, 3912.0], [980.0, 3809.0], [983.0, 3953.0], [982.0, 3957.0], [989.0, 3878.0], [988.0, 3980.0], [987.0, 3914.0], [985.0, 3909.0], [1021.0, 3744.0], [996.0, 3034.0], [995.0, 3820.0], [994.0, 3819.0], [993.0, 3822.0], [992.0, 3822.0], [1007.0, 3800.0], [1006.0, 3906.0], [1005.0, 3854.0], [1004.0, 3839.0], [1003.0, 3903.0], [1002.0, 3818.0], [1001.0, 3813.0], [1000.0, 3814.0], [997.0, 2805.0], [1011.0, 2811.3333333333335], [1010.0, 3828.0], [1009.0, 3874.0], [1008.0, 3828.0], [1013.0, 3864.0], [1012.0, 3830.0], [1015.0, 3722.0], [1014.0, 3778.0], [1016.0, 3014.5], [999.0, 3833.0], [998.0, 3815.0], [1018.0, 3739.0], [1017.0, 3737.0], [1023.0, 3680.0], [1022.0, 3681.0], [1020.0, 3728.0], [1019.0, 3677.0], [1028.0, 2948.0], [1044.0, 3239.0], [1042.0, 3259.0], [1040.0, 3460.0], [1046.0, 3228.0], [1048.0, 3272.0], [1050.0, 3302.0], [1024.0, 3667.0], [1026.0, 3605.0], [1054.0, 3237.0], [1058.0, 3189.0], [1056.0, 3277.0], [1060.0, 3188.0], [1062.0, 3190.0], [1064.0, 3263.0], [1066.0, 3242.0], [1068.0, 3359.0], [1070.0, 3171.0], [1086.0, 3038.0], [1084.0, 3130.0], [1082.0, 3107.0], [1080.0, 3248.0], [1078.0, 3138.0], [1076.0, 3193.0], [1074.0, 3219.0], [1072.0, 3191.0], [1038.0, 3466.0], [1036.0, 3480.0], [1034.0, 3542.0], [1032.0, 3480.0], [1030.0, 3579.0], [1110.0, 2695.0], [1118.0, 2537.5], [1096.0, 2674.5], [1098.0, 2704.5], [1100.0, 2853.0], [1102.0, 2843.0], [1106.0, 2596.5], [1104.0, 2824.0], [1108.0, 2723.0], [1112.0, 2608.5], [1088.0, 2976.0], [1090.0, 3031.0], [1092.0, 2975.0], [1094.0, 2952.0], [1116.0, 2534.0], [1114.0, 2568.0], [1055.0, 3247.0], [1081.0, 3098.0], [1085.0, 3056.0], [1045.0, 2681.6666666666665], [1043.0, 3331.0], [1041.0, 3354.0], [1047.0, 3313.0], [1049.0, 3298.0], [1053.0, 3274.5], [1051.0, 3311.0], [1025.0, 3650.0], [1027.0, 3560.0], [1059.0, 2789.0], [1057.0, 3286.0], [1061.0, 3188.0], [1063.0, 3215.0], [1065.0, 3333.0], [1067.0, 3249.0], [1069.0, 3190.0], [1071.0, 3170.0], [1087.0, 2977.0], [1083.0, 3057.0], [1079.0, 3158.0], [1077.0, 3268.0], [1075.0, 3162.0], [1073.0, 3200.0], [1039.0, 3476.0], [1037.0, 3466.0], [1035.0, 3544.0], [1033.0, 3562.0], [1031.0, 3547.0], [1029.0, 3574.0], [1111.0, 2706.0], [1097.0, 2931.0], [1099.0, 2953.0], [1101.0, 2832.0], [1103.0, 2825.0], [1105.0, 2821.0], [1107.0, 2715.0], [1109.0, 2676.0], [1115.0, 2506.5], [1119.0, 2488.0], [1089.0, 2995.0], [1091.0, 3038.0], [1093.0, 2971.0], [1095.0, 2914.0], [1113.0, 2601.0], [1.0, 42.047272727272734]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[238.98466666666664, 2803.841666666671]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1119.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1316.7, "minX": 1.5495864E12, "maxY": 17629.816666666666, "series": [{"data": [[1.54958646E12, 1320.1833333333334], [1.5495864E12, 17629.816666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958646E12, 1316.7], [1.5495864E12, 17583.3]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958646E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2282.1053385883224, "minX": 1.5495864E12, "maxY": 9771.14354066986, "series": [{"data": [[1.54958646E12, 9771.14354066986], [1.5495864E12, 2282.1053385883224]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958646E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 2282.0935148692233, "minX": 1.5495864E12, "maxY": 9771.133971291869, "series": [{"data": [[1.54958646E12, 9771.133971291869], [1.5495864E12, 2282.0935148692233]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958646E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 2.865997850232885, "minX": 1.5495864E12, "maxY": 2.9330143540669873, "series": [{"data": [[1.54958646E12, 2.9330143540669873], [1.5495864E12, 2.865997850232885]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958646E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.5495864E12, "maxY": 10903.0, "series": [{"data": [[1.54958646E12, 10903.0], [1.5495864E12, 10062.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958646E12, 9269.0], [1.5495864E12, 1.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958646E12, 9037.800000000001], [1.5495864E12, 8539.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958646E12, 10061.98], [1.5495864E12, 9246.08]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958646E12, 9554.299999999997], [1.5495864E12, 8868.800000000001]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958646E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 4.0, "minX": 3.0, "maxY": 9723.0, "series": [{"data": [[46.0, 4.0], [3.0, 9723.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 46.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 4.0, "minX": 3.0, "maxY": 9723.0, "series": [{"data": [[46.0, 4.0], [3.0, 9723.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 46.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.5495864E12, "maxY": 50.0, "series": [{"data": [[1.5495864E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495864E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 3.4833333333333334, "minX": 1.5495864E12, "maxY": 46.516666666666666, "series": [{"data": [[1.54958646E12, 3.4833333333333334], [1.5495864E12, 46.516666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958646E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 3.4833333333333334, "minX": 1.5495864E12, "maxY": 46.516666666666666, "series": [{"data": [[1.54958646E12, 3.4833333333333334], [1.5495864E12, 46.516666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958646E12, "title": "Transactions Per Second"}},
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
