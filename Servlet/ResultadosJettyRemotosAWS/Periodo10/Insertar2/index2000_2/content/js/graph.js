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
        data: {"result": {"minY": 30.0, "minX": 0.0, "maxY": 2246.0, "series": [{"data": [[0.0, 30.0], [0.1, 33.0], [0.2, 33.0], [0.3, 33.0], [0.4, 33.0], [0.5, 34.0], [0.6, 34.0], [0.7, 34.0], [0.8, 34.0], [0.9, 34.0], [1.0, 34.0], [1.1, 34.0], [1.2, 35.0], [1.3, 35.0], [1.4, 35.0], [1.5, 35.0], [1.6, 35.0], [1.7, 35.0], [1.8, 35.0], [1.9, 35.0], [2.0, 35.0], [2.1, 35.0], [2.2, 35.0], [2.3, 35.0], [2.4, 36.0], [2.5, 36.0], [2.6, 36.0], [2.7, 36.0], [2.8, 36.0], [2.9, 36.0], [3.0, 36.0], [3.1, 36.0], [3.2, 36.0], [3.3, 36.0], [3.4, 36.0], [3.5, 36.0], [3.6, 36.0], [3.7, 36.0], [3.8, 36.0], [3.9, 37.0], [4.0, 37.0], [4.1, 37.0], [4.2, 37.0], [4.3, 37.0], [4.4, 37.0], [4.5, 37.0], [4.6, 37.0], [4.7, 37.0], [4.8, 37.0], [4.9, 37.0], [5.0, 37.0], [5.1, 37.0], [5.2, 37.0], [5.3, 37.0], [5.4, 37.0], [5.5, 37.0], [5.6, 37.0], [5.7, 37.0], [5.8, 37.0], [5.9, 37.0], [6.0, 37.0], [6.1, 37.0], [6.2, 37.0], [6.3, 37.0], [6.4, 37.0], [6.5, 38.0], [6.6, 38.0], [6.7, 38.0], [6.8, 38.0], [6.9, 38.0], [7.0, 38.0], [7.1, 38.0], [7.2, 38.0], [7.3, 38.0], [7.4, 38.0], [7.5, 38.0], [7.6, 38.0], [7.7, 38.0], [7.8, 38.0], [7.9, 38.0], [8.0, 38.0], [8.1, 38.0], [8.2, 38.0], [8.3, 38.0], [8.4, 38.0], [8.5, 38.0], [8.6, 38.0], [8.7, 38.0], [8.8, 38.0], [8.9, 38.0], [9.0, 38.0], [9.1, 38.0], [9.2, 38.0], [9.3, 38.0], [9.4, 39.0], [9.5, 39.0], [9.6, 39.0], [9.7, 39.0], [9.8, 39.0], [9.9, 39.0], [10.0, 39.0], [10.1, 39.0], [10.2, 39.0], [10.3, 39.0], [10.4, 39.0], [10.5, 39.0], [10.6, 39.0], [10.7, 39.0], [10.8, 39.0], [10.9, 39.0], [11.0, 39.0], [11.1, 39.0], [11.2, 39.0], [11.3, 39.0], [11.4, 39.0], [11.5, 39.0], [11.6, 39.0], [11.7, 39.0], [11.8, 39.0], [11.9, 39.0], [12.0, 40.0], [12.1, 40.0], [12.2, 40.0], [12.3, 40.0], [12.4, 40.0], [12.5, 40.0], [12.6, 40.0], [12.7, 40.0], [12.8, 40.0], [12.9, 40.0], [13.0, 40.0], [13.1, 40.0], [13.2, 40.0], [13.3, 40.0], [13.4, 40.0], [13.5, 40.0], [13.6, 40.0], [13.7, 40.0], [13.8, 40.0], [13.9, 40.0], [14.0, 40.0], [14.1, 40.0], [14.2, 40.0], [14.3, 40.0], [14.4, 41.0], [14.5, 41.0], [14.6, 41.0], [14.7, 41.0], [14.8, 41.0], [14.9, 41.0], [15.0, 41.0], [15.1, 41.0], [15.2, 41.0], [15.3, 41.0], [15.4, 41.0], [15.5, 41.0], [15.6, 41.0], [15.7, 41.0], [15.8, 41.0], [15.9, 41.0], [16.0, 41.0], [16.1, 41.0], [16.2, 41.0], [16.3, 41.0], [16.4, 41.0], [16.5, 41.0], [16.6, 41.0], [16.7, 41.0], [16.8, 41.0], [16.9, 42.0], [17.0, 42.0], [17.1, 42.0], [17.2, 42.0], [17.3, 42.0], [17.4, 42.0], [17.5, 42.0], [17.6, 42.0], [17.7, 42.0], [17.8, 42.0], [17.9, 42.0], [18.0, 42.0], [18.1, 42.0], [18.2, 42.0], [18.3, 42.0], [18.4, 42.0], [18.5, 42.0], [18.6, 42.0], [18.7, 42.0], [18.8, 42.0], [18.9, 42.0], [19.0, 42.0], [19.1, 42.0], [19.2, 42.0], [19.3, 42.0], [19.4, 42.0], [19.5, 42.0], [19.6, 42.0], [19.7, 42.0], [19.8, 42.0], [19.9, 43.0], [20.0, 43.0], [20.1, 43.0], [20.2, 43.0], [20.3, 43.0], [20.4, 43.0], [20.5, 43.0], [20.6, 43.0], [20.7, 43.0], [20.8, 43.0], [20.9, 43.0], [21.0, 43.0], [21.1, 43.0], [21.2, 43.0], [21.3, 43.0], [21.4, 43.0], [21.5, 43.0], [21.6, 43.0], [21.7, 43.0], [21.8, 43.0], [21.9, 43.0], [22.0, 43.0], [22.1, 43.0], [22.2, 43.0], [22.3, 43.0], [22.4, 43.0], [22.5, 43.0], [22.6, 43.0], [22.7, 43.0], [22.8, 43.0], [22.9, 43.0], [23.0, 44.0], [23.1, 44.0], [23.2, 44.0], [23.3, 44.0], [23.4, 44.0], [23.5, 44.0], [23.6, 44.0], [23.7, 44.0], [23.8, 44.0], [23.9, 44.0], [24.0, 44.0], [24.1, 44.0], [24.2, 44.0], [24.3, 44.0], [24.4, 44.0], [24.5, 44.0], [24.6, 44.0], [24.7, 44.0], [24.8, 44.0], [24.9, 44.0], [25.0, 44.0], [25.1, 44.0], [25.2, 44.0], [25.3, 44.0], [25.4, 44.0], [25.5, 44.0], [25.6, 44.0], [25.7, 44.0], [25.8, 44.0], [25.9, 44.0], [26.0, 44.0], [26.1, 45.0], [26.2, 45.0], [26.3, 45.0], [26.4, 45.0], [26.5, 45.0], [26.6, 45.0], [26.7, 45.0], [26.8, 45.0], [26.9, 45.0], [27.0, 45.0], [27.1, 45.0], [27.2, 45.0], [27.3, 45.0], [27.4, 45.0], [27.5, 45.0], [27.6, 45.0], [27.7, 45.0], [27.8, 45.0], [27.9, 45.0], [28.0, 45.0], [28.1, 45.0], [28.2, 45.0], [28.3, 45.0], [28.4, 45.0], [28.5, 46.0], [28.6, 46.0], [28.7, 46.0], [28.8, 46.0], [28.9, 46.0], [29.0, 46.0], [29.1, 46.0], [29.2, 46.0], [29.3, 46.0], [29.4, 46.0], [29.5, 46.0], [29.6, 46.0], [29.7, 46.0], [29.8, 46.0], [29.9, 46.0], [30.0, 46.0], [30.1, 46.0], [30.2, 46.0], [30.3, 46.0], [30.4, 46.0], [30.5, 46.0], [30.6, 46.0], [30.7, 46.0], [30.8, 46.0], [30.9, 47.0], [31.0, 47.0], [31.1, 47.0], [31.2, 47.0], [31.3, 47.0], [31.4, 47.0], [31.5, 47.0], [31.6, 47.0], [31.7, 47.0], [31.8, 47.0], [31.9, 47.0], [32.0, 47.0], [32.1, 47.0], [32.2, 47.0], [32.3, 47.0], [32.4, 47.0], [32.5, 47.0], [32.6, 47.0], [32.7, 47.0], [32.8, 47.0], [32.9, 47.0], [33.0, 47.0], [33.1, 47.0], [33.2, 47.0], [33.3, 47.0], [33.4, 47.0], [33.5, 47.0], [33.6, 47.0], [33.7, 47.0], [33.8, 47.0], [33.9, 47.0], [34.0, 47.0], [34.1, 47.0], [34.2, 47.0], [34.3, 47.0], [34.4, 48.0], [34.5, 48.0], [34.6, 48.0], [34.7, 48.0], [34.8, 48.0], [34.9, 48.0], [35.0, 48.0], [35.1, 48.0], [35.2, 48.0], [35.3, 48.0], [35.4, 48.0], [35.5, 48.0], [35.6, 48.0], [35.7, 48.0], [35.8, 48.0], [35.9, 48.0], [36.0, 48.0], [36.1, 49.0], [36.2, 49.0], [36.3, 49.0], [36.4, 49.0], [36.5, 49.0], [36.6, 49.0], [36.7, 49.0], [36.8, 49.0], [36.9, 49.0], [37.0, 49.0], [37.1, 49.0], [37.2, 49.0], [37.3, 49.0], [37.4, 49.0], [37.5, 49.0], [37.6, 49.0], [37.7, 49.0], [37.8, 49.0], [37.9, 49.0], [38.0, 49.0], [38.1, 49.0], [38.2, 49.0], [38.3, 49.0], [38.4, 49.0], [38.5, 49.0], [38.6, 49.0], [38.7, 50.0], [38.8, 50.0], [38.9, 50.0], [39.0, 50.0], [39.1, 50.0], [39.2, 50.0], [39.3, 50.0], [39.4, 50.0], [39.5, 50.0], [39.6, 50.0], [39.7, 50.0], [39.8, 50.0], [39.9, 50.0], [40.0, 50.0], [40.1, 50.0], [40.2, 51.0], [40.3, 51.0], [40.4, 51.0], [40.5, 51.0], [40.6, 51.0], [40.7, 51.0], [40.8, 51.0], [40.9, 51.0], [41.0, 51.0], [41.1, 51.0], [41.2, 51.0], [41.3, 51.0], [41.4, 52.0], [41.5, 52.0], [41.6, 52.0], [41.7, 52.0], [41.8, 52.0], [41.9, 52.0], [42.0, 52.0], [42.1, 52.0], [42.2, 52.0], [42.3, 52.0], [42.4, 52.0], [42.5, 52.0], [42.6, 52.0], [42.7, 52.0], [42.8, 52.0], [42.9, 52.0], [43.0, 52.0], [43.1, 52.0], [43.2, 53.0], [43.3, 53.0], [43.4, 53.0], [43.5, 53.0], [43.6, 53.0], [43.7, 53.0], [43.8, 53.0], [43.9, 53.0], [44.0, 53.0], [44.1, 53.0], [44.2, 54.0], [44.3, 54.0], [44.4, 54.0], [44.5, 54.0], [44.6, 54.0], [44.7, 55.0], [44.8, 55.0], [44.9, 55.0], [45.0, 55.0], [45.1, 55.0], [45.2, 55.0], [45.3, 55.0], [45.4, 55.0], [45.5, 55.0], [45.6, 56.0], [45.7, 56.0], [45.8, 56.0], [45.9, 56.0], [46.0, 56.0], [46.1, 56.0], [46.2, 56.0], [46.3, 56.0], [46.4, 56.0], [46.5, 56.0], [46.6, 56.0], [46.7, 56.0], [46.8, 57.0], [46.9, 57.0], [47.0, 57.0], [47.1, 57.0], [47.2, 57.0], [47.3, 57.0], [47.4, 58.0], [47.5, 58.0], [47.6, 58.0], [47.7, 58.0], [47.8, 58.0], [47.9, 58.0], [48.0, 59.0], [48.1, 59.0], [48.2, 60.0], [48.3, 60.0], [48.4, 60.0], [48.5, 60.0], [48.6, 61.0], [48.7, 61.0], [48.8, 62.0], [48.9, 62.0], [49.0, 62.0], [49.1, 63.0], [49.2, 63.0], [49.3, 63.0], [49.4, 64.0], [49.5, 65.0], [49.6, 65.0], [49.7, 66.0], [49.8, 66.0], [49.9, 66.0], [50.0, 68.0], [50.1, 71.0], [50.2, 72.0], [50.3, 72.0], [50.4, 77.0], [50.5, 78.0], [50.6, 79.0], [50.7, 83.0], [50.8, 93.0], [50.9, 95.0], [51.0, 98.0], [51.1, 106.0], [51.2, 116.0], [51.3, 118.0], [51.4, 125.0], [51.5, 128.0], [51.6, 142.0], [51.7, 145.0], [51.8, 153.0], [51.9, 158.0], [52.0, 163.0], [52.1, 169.0], [52.2, 174.0], [52.3, 178.0], [52.4, 184.0], [52.5, 190.0], [52.6, 194.0], [52.7, 206.0], [52.8, 218.0], [52.9, 220.0], [53.0, 225.0], [53.1, 228.0], [53.2, 233.0], [53.3, 242.0], [53.4, 246.0], [53.5, 250.0], [53.6, 252.0], [53.7, 266.0], [53.8, 277.0], [53.9, 283.0], [54.0, 297.0], [54.1, 301.0], [54.2, 303.0], [54.3, 304.0], [54.4, 308.0], [54.5, 309.0], [54.6, 310.0], [54.7, 318.0], [54.8, 321.0], [54.9, 323.0], [55.0, 326.0], [55.1, 328.0], [55.2, 329.0], [55.3, 333.0], [55.4, 342.0], [55.5, 348.0], [55.6, 353.0], [55.7, 357.0], [55.8, 359.0], [55.9, 364.0], [56.0, 366.0], [56.1, 371.0], [56.2, 375.0], [56.3, 376.0], [56.4, 377.0], [56.5, 380.0], [56.6, 381.0], [56.7, 384.0], [56.8, 385.0], [56.9, 388.0], [57.0, 391.0], [57.1, 392.0], [57.2, 394.0], [57.3, 396.0], [57.4, 397.0], [57.5, 397.0], [57.6, 402.0], [57.7, 404.0], [57.8, 407.0], [57.9, 408.0], [58.0, 414.0], [58.1, 415.0], [58.2, 417.0], [58.3, 420.0], [58.4, 421.0], [58.5, 422.0], [58.6, 424.0], [58.7, 427.0], [58.8, 427.0], [58.9, 429.0], [59.0, 431.0], [59.1, 433.0], [59.2, 434.0], [59.3, 437.0], [59.4, 438.0], [59.5, 439.0], [59.6, 441.0], [59.7, 442.0], [59.8, 443.0], [59.9, 444.0], [60.0, 445.0], [60.1, 449.0], [60.2, 451.0], [60.3, 453.0], [60.4, 457.0], [60.5, 457.0], [60.6, 459.0], [60.7, 462.0], [60.8, 464.0], [60.9, 465.0], [61.0, 465.0], [61.1, 466.0], [61.2, 469.0], [61.3, 470.0], [61.4, 472.0], [61.5, 472.0], [61.6, 476.0], [61.7, 477.0], [61.8, 477.0], [61.9, 478.0], [62.0, 479.0], [62.1, 479.0], [62.2, 481.0], [62.3, 482.0], [62.4, 483.0], [62.5, 484.0], [62.6, 485.0], [62.7, 486.0], [62.8, 488.0], [62.9, 489.0], [63.0, 489.0], [63.1, 490.0], [63.2, 491.0], [63.3, 493.0], [63.4, 494.0], [63.5, 496.0], [63.6, 499.0], [63.7, 501.0], [63.8, 502.0], [63.9, 503.0], [64.0, 504.0], [64.1, 505.0], [64.2, 505.0], [64.3, 507.0], [64.4, 508.0], [64.5, 510.0], [64.6, 511.0], [64.7, 512.0], [64.8, 513.0], [64.9, 514.0], [65.0, 516.0], [65.1, 517.0], [65.2, 519.0], [65.3, 520.0], [65.4, 521.0], [65.5, 523.0], [65.6, 524.0], [65.7, 525.0], [65.8, 527.0], [65.9, 527.0], [66.0, 529.0], [66.1, 530.0], [66.2, 531.0], [66.3, 532.0], [66.4, 538.0], [66.5, 538.0], [66.6, 538.0], [66.7, 539.0], [66.8, 539.0], [66.9, 542.0], [67.0, 542.0], [67.1, 543.0], [67.2, 546.0], [67.3, 546.0], [67.4, 547.0], [67.5, 549.0], [67.6, 550.0], [67.7, 553.0], [67.8, 556.0], [67.9, 557.0], [68.0, 557.0], [68.1, 559.0], [68.2, 559.0], [68.3, 560.0], [68.4, 560.0], [68.5, 561.0], [68.6, 561.0], [68.7, 566.0], [68.8, 567.0], [68.9, 572.0], [69.0, 574.0], [69.1, 577.0], [69.2, 579.0], [69.3, 581.0], [69.4, 586.0], [69.5, 586.0], [69.6, 587.0], [69.7, 589.0], [69.8, 590.0], [69.9, 591.0], [70.0, 592.0], [70.1, 596.0], [70.2, 597.0], [70.3, 597.0], [70.4, 598.0], [70.5, 598.0], [70.6, 598.0], [70.7, 599.0], [70.8, 599.0], [70.9, 600.0], [71.0, 600.0], [71.1, 601.0], [71.2, 602.0], [71.3, 602.0], [71.4, 603.0], [71.5, 604.0], [71.6, 605.0], [71.7, 607.0], [71.8, 607.0], [71.9, 609.0], [72.0, 609.0], [72.1, 611.0], [72.2, 612.0], [72.3, 612.0], [72.4, 613.0], [72.5, 614.0], [72.6, 615.0], [72.7, 615.0], [72.8, 617.0], [72.9, 617.0], [73.0, 619.0], [73.1, 621.0], [73.2, 622.0], [73.3, 623.0], [73.4, 624.0], [73.5, 626.0], [73.6, 627.0], [73.7, 631.0], [73.8, 632.0], [73.9, 633.0], [74.0, 633.0], [74.1, 635.0], [74.2, 638.0], [74.3, 640.0], [74.4, 641.0], [74.5, 642.0], [74.6, 644.0], [74.7, 645.0], [74.8, 646.0], [74.9, 647.0], [75.0, 650.0], [75.1, 650.0], [75.2, 651.0], [75.3, 651.0], [75.4, 652.0], [75.5, 654.0], [75.6, 655.0], [75.7, 656.0], [75.8, 656.0], [75.9, 657.0], [76.0, 659.0], [76.1, 660.0], [76.2, 661.0], [76.3, 661.0], [76.4, 662.0], [76.5, 663.0], [76.6, 663.0], [76.7, 664.0], [76.8, 664.0], [76.9, 666.0], [77.0, 668.0], [77.1, 669.0], [77.2, 670.0], [77.3, 671.0], [77.4, 673.0], [77.5, 674.0], [77.6, 674.0], [77.7, 677.0], [77.8, 678.0], [77.9, 680.0], [78.0, 680.0], [78.1, 680.0], [78.2, 682.0], [78.3, 682.0], [78.4, 684.0], [78.5, 685.0], [78.6, 686.0], [78.7, 687.0], [78.8, 688.0], [78.9, 690.0], [79.0, 691.0], [79.1, 693.0], [79.2, 695.0], [79.3, 697.0], [79.4, 698.0], [79.5, 698.0], [79.6, 700.0], [79.7, 702.0], [79.8, 703.0], [79.9, 705.0], [80.0, 705.0], [80.1, 707.0], [80.2, 709.0], [80.3, 710.0], [80.4, 717.0], [80.5, 717.0], [80.6, 719.0], [80.7, 720.0], [80.8, 721.0], [80.9, 727.0], [81.0, 727.0], [81.1, 728.0], [81.2, 730.0], [81.3, 731.0], [81.4, 732.0], [81.5, 733.0], [81.6, 736.0], [81.7, 737.0], [81.8, 739.0], [81.9, 739.0], [82.0, 740.0], [82.1, 740.0], [82.2, 742.0], [82.3, 743.0], [82.4, 744.0], [82.5, 745.0], [82.6, 745.0], [82.7, 746.0], [82.8, 749.0], [82.9, 751.0], [83.0, 753.0], [83.1, 754.0], [83.2, 755.0], [83.3, 755.0], [83.4, 758.0], [83.5, 759.0], [83.6, 762.0], [83.7, 763.0], [83.8, 764.0], [83.9, 766.0], [84.0, 768.0], [84.1, 768.0], [84.2, 770.0], [84.3, 774.0], [84.4, 776.0], [84.5, 779.0], [84.6, 781.0], [84.7, 782.0], [84.8, 783.0], [84.9, 784.0], [85.0, 785.0], [85.1, 788.0], [85.2, 789.0], [85.3, 790.0], [85.4, 791.0], [85.5, 792.0], [85.6, 793.0], [85.7, 794.0], [85.8, 794.0], [85.9, 796.0], [86.0, 797.0], [86.1, 799.0], [86.2, 800.0], [86.3, 802.0], [86.4, 804.0], [86.5, 805.0], [86.6, 811.0], [86.7, 812.0], [86.8, 815.0], [86.9, 819.0], [87.0, 820.0], [87.1, 821.0], [87.2, 823.0], [87.3, 825.0], [87.4, 826.0], [87.5, 828.0], [87.6, 831.0], [87.7, 833.0], [87.8, 833.0], [87.9, 836.0], [88.0, 838.0], [88.1, 845.0], [88.2, 846.0], [88.3, 852.0], [88.4, 853.0], [88.5, 854.0], [88.6, 855.0], [88.7, 857.0], [88.8, 859.0], [88.9, 859.0], [89.0, 861.0], [89.1, 862.0], [89.2, 865.0], [89.3, 866.0], [89.4, 870.0], [89.5, 871.0], [89.6, 872.0], [89.7, 877.0], [89.8, 877.0], [89.9, 880.0], [90.0, 883.0], [90.1, 885.0], [90.2, 888.0], [90.3, 894.0], [90.4, 896.0], [90.5, 898.0], [90.6, 906.0], [90.7, 907.0], [90.8, 911.0], [90.9, 915.0], [91.0, 916.0], [91.1, 920.0], [91.2, 921.0], [91.3, 922.0], [91.4, 924.0], [91.5, 924.0], [91.6, 925.0], [91.7, 928.0], [91.8, 929.0], [91.9, 929.0], [92.0, 931.0], [92.1, 933.0], [92.2, 935.0], [92.3, 944.0], [92.4, 950.0], [92.5, 957.0], [92.6, 965.0], [92.7, 966.0], [92.8, 970.0], [92.9, 971.0], [93.0, 974.0], [93.1, 977.0], [93.2, 978.0], [93.3, 980.0], [93.4, 984.0], [93.5, 985.0], [93.6, 987.0], [93.7, 992.0], [93.8, 993.0], [93.9, 995.0], [94.0, 1001.0], [94.1, 1005.0], [94.2, 1006.0], [94.3, 1010.0], [94.4, 1016.0], [94.5, 1021.0], [94.6, 1024.0], [94.7, 1036.0], [94.8, 1038.0], [94.9, 1043.0], [95.0, 1052.0], [95.1, 1062.0], [95.2, 1065.0], [95.3, 1066.0], [95.4, 1074.0], [95.5, 1080.0], [95.6, 1091.0], [95.7, 1096.0], [95.8, 1099.0], [95.9, 1105.0], [96.0, 1106.0], [96.1, 1113.0], [96.2, 1121.0], [96.3, 1126.0], [96.4, 1144.0], [96.5, 1158.0], [96.6, 1189.0], [96.7, 1202.0], [96.8, 1241.0], [96.9, 1252.0], [97.0, 1273.0], [97.1, 1337.0], [97.2, 1408.0], [97.3, 1432.0], [97.4, 1478.0], [97.5, 1485.0], [97.6, 1539.0], [97.7, 1564.0], [97.8, 1586.0], [97.9, 1608.0], [98.0, 1617.0], [98.1, 1645.0], [98.2, 1680.0], [98.3, 1717.0], [98.4, 1745.0], [98.5, 1768.0], [98.6, 1779.0], [98.7, 1792.0], [98.8, 1797.0], [98.9, 1842.0], [99.0, 1863.0], [99.1, 1881.0], [99.2, 1888.0], [99.3, 1904.0], [99.4, 1921.0], [99.5, 1949.0], [99.6, 1974.0], [99.7, 2070.0], [99.8, 2110.0], [99.9, 2186.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 1021.0, "series": [{"data": [[0.0, 1021.0], [2100.0, 3.0], [2200.0, 1.0], [600.0, 173.0], [700.0, 132.0], [200.0, 29.0], [800.0, 88.0], [900.0, 68.0], [1000.0, 38.0], [1100.0, 16.0], [300.0, 70.0], [1200.0, 9.0], [1300.0, 2.0], [1400.0, 7.0], [1500.0, 6.0], [100.0, 32.0], [400.0, 121.0], [1600.0, 9.0], [1700.0, 11.0], [1800.0, 9.0], [1900.0, 7.0], [500.0, 145.0], [2000.0, 3.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 49.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1273.0, "series": [{"data": [[1.0, 678.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1273.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 49.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 69.44149999999993, "minX": 1.54961868E12, "maxY": 69.44149999999993, "series": [{"data": [[1.54961868E12, 69.44149999999993]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 39.821917808219176, "minX": 1.0, "maxY": 1228.8999999999999, "series": [{"data": [[2.0, 129.66666666666669], [3.0, 107.0], [4.0, 87.71428571428571], [5.0, 50.80952380952381], [6.0, 39.821917808219176], [7.0, 45.52380952380952], [8.0, 43.23737373737375], [9.0, 45.085937499999986], [10.0, 53.039548022598886], [11.0, 54.066666666666656], [12.0, 75.25641025641025], [13.0, 78.6551724137931], [14.0, 100.30000000000001], [15.0, 142.5], [16.0, 256.0], [17.0, 284.5], [18.0, 275.5], [19.0, 309.0], [20.0, 173.0], [21.0, 258.25], [22.0, 283.6666666666667], [23.0, 206.66666666666666], [24.0, 259.1666666666667], [25.0, 231.5], [26.0, 258.0], [27.0, 186.75], [28.0, 409.6666666666667], [29.0, 355.5], [30.0, 298.6666666666667], [31.0, 484.0], [33.0, 257.3333333333333], [32.0, 300.6666666666667], [34.0, 244.5], [35.0, 252.0], [36.0, 256.0], [37.0, 483.0], [39.0, 254.25], [38.0, 303.0], [40.0, 163.5], [41.0, 273.5], [43.0, 601.0], [42.0, 494.0], [45.0, 397.0], [44.0, 283.0], [47.0, 348.0], [46.0, 539.0], [49.0, 421.0], [48.0, 728.0], [51.0, 308.0], [50.0, 709.0], [53.0, 532.0], [52.0, 444.0], [55.0, 340.0], [54.0, 538.0], [57.0, 542.0], [56.0, 612.0], [59.0, 381.0], [58.0, 529.0], [61.0, 670.0], [60.0, 321.0], [63.0, 557.0], [62.0, 682.0], [67.0, 429.5], [65.0, 465.0], [64.0, 437.0], [71.0, 547.0], [70.0, 743.0], [69.0, 586.0], [68.0, 420.0], [75.0, 560.0], [74.0, 505.0], [73.0, 680.0], [72.0, 774.0], [78.0, 301.0], [77.0, 466.0], [76.0, 577.0], [83.0, 520.0], [82.0, 598.0], [81.0, 512.0], [80.0, 346.5], [87.0, 472.0], [86.0, 397.0], [85.0, 457.5], [91.0, 598.0], [90.0, 390.0], [89.0, 809.0], [88.0, 484.0], [95.0, 646.0], [94.0, 821.0], [93.0, 680.5], [99.0, 604.0], [98.0, 613.0], [97.0, 489.0], [96.0, 318.0], [103.0, 764.0], [102.0, 590.0], [101.0, 567.0], [100.0, 862.0], [107.0, 536.0], [106.0, 554.0], [105.0, 472.0], [104.0, 855.0], [111.0, 513.2], [110.0, 553.6666666666666], [109.0, 494.8571428571429], [108.0, 502.25], [115.0, 555.5], [114.0, 606.0], [113.0, 602.5], [112.0, 569.6666666666666], [119.0, 644.4545454545455], [118.0, 632.6666666666666], [117.0, 761.8], [116.0, 689.0], [123.0, 640.8461538461539], [122.0, 614.1764705882352], [121.0, 579.7272727272727], [120.0, 621.4], [127.0, 558.9999999999999], [126.0, 702.4210526315788], [125.0, 664.5], [124.0, 621.2], [128.0, 684.1666666666667], [130.0, 668.6666666666666], [132.0, 569.111111111111], [135.0, 740.2307692307693], [134.0, 732.8125], [133.0, 829.7272727272726], [131.0, 563.0], [129.0, 602.75], [136.0, 686.8181818181819], [143.0, 652.0], [142.0, 765.8], [141.0, 722.8571428571428], [140.0, 669.3333333333334], [139.0, 685.0], [138.0, 759.8], [137.0, 675.2], [151.0, 579.3333333333334], [150.0, 803.0], [149.0, 624.625], [148.0, 495.2727272727273], [147.0, 686.111111111111], [146.0, 691.0], [145.0, 768.3], [144.0, 750.0], [154.0, 751.3333333333335], [155.0, 711.8333333333334], [159.0, 876.111111111111], [158.0, 603.1999999999999], [157.0, 758.125], [156.0, 672.9999999999999], [153.0, 579.7692307692308], [152.0, 767.1428571428572], [163.0, 831.4000000000001], [164.0, 846.6923076923077], [165.0, 800.9200000000001], [167.0, 823.9999999999999], [166.0, 732.8749999999998], [162.0, 887.6666666666666], [161.0, 887.9333333333335], [160.0, 799.7916666666667], [168.0, 717.0], [169.0, 750.8], [171.0, 785.5454545454545], [170.0, 989.75], [172.0, 860.7777777777778], [173.0, 1033.0], [174.0, 1228.8421052631577], [175.0, 1213.0], [176.0, 1044.0], [178.0, 1040.782608695652], [177.0, 1118.5833333333335], [179.0, 1228.8999999999999], [180.0, 1076.3333333333335], [182.0, 521.0], [181.0, 1189.75], [1.0, 333.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[69.441, 369.52650000000006]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 182.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.54961868E12, "maxY": 14031.5, "series": [{"data": [[1.54961868E12, 14031.5]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961868E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 369.52650000000006, "minX": 1.54961868E12, "maxY": 369.52650000000006, "series": [{"data": [[1.54961868E12, 369.52650000000006]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961868E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 369.51350000000014, "minX": 1.54961868E12, "maxY": 369.51350000000014, "series": [{"data": [[1.54961868E12, 369.51350000000014]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961868E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 29.804000000000027, "minX": 1.54961868E12, "maxY": 29.804000000000027, "series": [{"data": [[1.54961868E12, 29.804000000000027]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961868E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 30.0, "minX": 1.54961868E12, "maxY": 2246.0, "series": [{"data": [[1.54961868E12, 2246.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961868E12, 30.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961868E12, 882.8000000000002]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961868E12, 1862.8300000000002]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961868E12, 1051.9499999999998]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 68.0, "minX": 33.0, "maxY": 68.0, "series": [{"data": [[33.0, 68.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 68.0, "minX": 33.0, "maxY": 68.0, "series": [{"data": [[33.0, 68.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961868E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961868E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961868E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961868E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961868E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961868E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961868E12, "title": "Transactions Per Second"}},
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
