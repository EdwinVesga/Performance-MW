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
        data: {"result": {"minY": 70.0, "minX": 0.0, "maxY": 1883.0, "series": [{"data": [[0.0, 70.0], [0.1, 71.0], [0.2, 72.0], [0.3, 72.0], [0.4, 76.0], [0.5, 76.0], [0.6, 76.0], [0.7, 77.0], [0.8, 77.0], [0.9, 78.0], [1.0, 79.0], [1.1, 79.0], [1.2, 79.0], [1.3, 79.0], [1.4, 80.0], [1.5, 80.0], [1.6, 80.0], [1.7, 80.0], [1.8, 80.0], [1.9, 80.0], [2.0, 80.0], [2.1, 80.0], [2.2, 81.0], [2.3, 81.0], [2.4, 81.0], [2.5, 81.0], [2.6, 82.0], [2.7, 82.0], [2.8, 82.0], [2.9, 82.0], [3.0, 82.0], [3.1, 82.0], [3.2, 82.0], [3.3, 83.0], [3.4, 83.0], [3.5, 83.0], [3.6, 83.0], [3.7, 83.0], [3.8, 83.0], [3.9, 83.0], [4.0, 84.0], [4.1, 84.0], [4.2, 84.0], [4.3, 84.0], [4.4, 84.0], [4.5, 84.0], [4.6, 84.0], [4.7, 84.0], [4.8, 85.0], [4.9, 85.0], [5.0, 85.0], [5.1, 85.0], [5.2, 85.0], [5.3, 85.0], [5.4, 85.0], [5.5, 85.0], [5.6, 85.0], [5.7, 86.0], [5.8, 86.0], [5.9, 86.0], [6.0, 86.0], [6.1, 86.0], [6.2, 86.0], [6.3, 86.0], [6.4, 86.0], [6.5, 86.0], [6.6, 86.0], [6.7, 86.0], [6.8, 86.0], [6.9, 87.0], [7.0, 87.0], [7.1, 87.0], [7.2, 87.0], [7.3, 88.0], [7.4, 88.0], [7.5, 88.0], [7.6, 88.0], [7.7, 88.0], [7.8, 88.0], [7.9, 88.0], [8.0, 88.0], [8.1, 88.0], [8.2, 89.0], [8.3, 89.0], [8.4, 89.0], [8.5, 89.0], [8.6, 89.0], [8.7, 89.0], [8.8, 89.0], [8.9, 89.0], [9.0, 89.0], [9.1, 89.0], [9.2, 90.0], [9.3, 90.0], [9.4, 90.0], [9.5, 90.0], [9.6, 90.0], [9.7, 90.0], [9.8, 91.0], [9.9, 91.0], [10.0, 91.0], [10.1, 91.0], [10.2, 91.0], [10.3, 91.0], [10.4, 91.0], [10.5, 91.0], [10.6, 92.0], [10.7, 92.0], [10.8, 92.0], [10.9, 92.0], [11.0, 92.0], [11.1, 92.0], [11.2, 92.0], [11.3, 92.0], [11.4, 92.0], [11.5, 92.0], [11.6, 93.0], [11.7, 93.0], [11.8, 93.0], [11.9, 93.0], [12.0, 93.0], [12.1, 93.0], [12.2, 94.0], [12.3, 94.0], [12.4, 94.0], [12.5, 94.0], [12.6, 94.0], [12.7, 94.0], [12.8, 94.0], [12.9, 94.0], [13.0, 94.0], [13.1, 94.0], [13.2, 94.0], [13.3, 94.0], [13.4, 94.0], [13.5, 94.0], [13.6, 95.0], [13.7, 95.0], [13.8, 95.0], [13.9, 95.0], [14.0, 95.0], [14.1, 95.0], [14.2, 95.0], [14.3, 95.0], [14.4, 95.0], [14.5, 95.0], [14.6, 95.0], [14.7, 95.0], [14.8, 95.0], [14.9, 95.0], [15.0, 95.0], [15.1, 95.0], [15.2, 95.0], [15.3, 95.0], [15.4, 95.0], [15.5, 95.0], [15.6, 95.0], [15.7, 96.0], [15.8, 96.0], [15.9, 96.0], [16.0, 96.0], [16.1, 96.0], [16.2, 96.0], [16.3, 96.0], [16.4, 96.0], [16.5, 97.0], [16.6, 97.0], [16.7, 97.0], [16.8, 97.0], [16.9, 97.0], [17.0, 97.0], [17.1, 97.0], [17.2, 97.0], [17.3, 97.0], [17.4, 97.0], [17.5, 97.0], [17.6, 98.0], [17.7, 98.0], [17.8, 98.0], [17.9, 98.0], [18.0, 98.0], [18.1, 98.0], [18.2, 98.0], [18.3, 98.0], [18.4, 98.0], [18.5, 98.0], [18.6, 98.0], [18.7, 98.0], [18.8, 98.0], [18.9, 98.0], [19.0, 99.0], [19.1, 99.0], [19.2, 99.0], [19.3, 99.0], [19.4, 99.0], [19.5, 99.0], [19.6, 99.0], [19.7, 99.0], [19.8, 99.0], [19.9, 99.0], [20.0, 99.0], [20.1, 99.0], [20.2, 99.0], [20.3, 99.0], [20.4, 99.0], [20.5, 99.0], [20.6, 100.0], [20.7, 100.0], [20.8, 100.0], [20.9, 100.0], [21.0, 100.0], [21.1, 100.0], [21.2, 100.0], [21.3, 100.0], [21.4, 100.0], [21.5, 100.0], [21.6, 100.0], [21.7, 100.0], [21.8, 100.0], [21.9, 100.0], [22.0, 100.0], [22.1, 101.0], [22.2, 101.0], [22.3, 101.0], [22.4, 101.0], [22.5, 101.0], [22.6, 101.0], [22.7, 101.0], [22.8, 101.0], [22.9, 101.0], [23.0, 101.0], [23.1, 101.0], [23.2, 101.0], [23.3, 101.0], [23.4, 101.0], [23.5, 101.0], [23.6, 101.0], [23.7, 101.0], [23.8, 101.0], [23.9, 101.0], [24.0, 101.0], [24.1, 101.0], [24.2, 101.0], [24.3, 102.0], [24.4, 102.0], [24.5, 102.0], [24.6, 102.0], [24.7, 102.0], [24.8, 102.0], [24.9, 102.0], [25.0, 102.0], [25.1, 102.0], [25.2, 102.0], [25.3, 102.0], [25.4, 102.0], [25.5, 102.0], [25.6, 103.0], [25.7, 103.0], [25.8, 103.0], [25.9, 103.0], [26.0, 103.0], [26.1, 103.0], [26.2, 103.0], [26.3, 103.0], [26.4, 103.0], [26.5, 103.0], [26.6, 103.0], [26.7, 103.0], [26.8, 104.0], [26.9, 104.0], [27.0, 104.0], [27.1, 104.0], [27.2, 104.0], [27.3, 104.0], [27.4, 104.0], [27.5, 104.0], [27.6, 104.0], [27.7, 104.0], [27.8, 104.0], [27.9, 104.0], [28.0, 104.0], [28.1, 104.0], [28.2, 104.0], [28.3, 104.0], [28.4, 105.0], [28.5, 105.0], [28.6, 105.0], [28.7, 105.0], [28.8, 105.0], [28.9, 105.0], [29.0, 105.0], [29.1, 105.0], [29.2, 105.0], [29.3, 105.0], [29.4, 105.0], [29.5, 105.0], [29.6, 105.0], [29.7, 105.0], [29.8, 106.0], [29.9, 106.0], [30.0, 106.0], [30.1, 106.0], [30.2, 106.0], [30.3, 106.0], [30.4, 106.0], [30.5, 106.0], [30.6, 107.0], [30.7, 107.0], [30.8, 107.0], [30.9, 107.0], [31.0, 107.0], [31.1, 107.0], [31.2, 107.0], [31.3, 108.0], [31.4, 108.0], [31.5, 108.0], [31.6, 108.0], [31.7, 108.0], [31.8, 108.0], [31.9, 108.0], [32.0, 109.0], [32.1, 109.0], [32.2, 109.0], [32.3, 109.0], [32.4, 109.0], [32.5, 109.0], [32.6, 109.0], [32.7, 109.0], [32.8, 109.0], [32.9, 109.0], [33.0, 109.0], [33.1, 109.0], [33.2, 110.0], [33.3, 110.0], [33.4, 110.0], [33.5, 110.0], [33.6, 110.0], [33.7, 110.0], [33.8, 110.0], [33.9, 110.0], [34.0, 111.0], [34.1, 111.0], [34.2, 111.0], [34.3, 111.0], [34.4, 111.0], [34.5, 112.0], [34.6, 112.0], [34.7, 112.0], [34.8, 113.0], [34.9, 113.0], [35.0, 113.0], [35.1, 113.0], [35.2, 113.0], [35.3, 114.0], [35.4, 114.0], [35.5, 114.0], [35.6, 114.0], [35.7, 114.0], [35.8, 114.0], [35.9, 115.0], [36.0, 115.0], [36.1, 115.0], [36.2, 115.0], [36.3, 115.0], [36.4, 116.0], [36.5, 116.0], [36.6, 116.0], [36.7, 116.0], [36.8, 116.0], [36.9, 117.0], [37.0, 117.0], [37.1, 117.0], [37.2, 118.0], [37.3, 118.0], [37.4, 118.0], [37.5, 118.0], [37.6, 119.0], [37.7, 119.0], [37.8, 119.0], [37.9, 119.0], [38.0, 119.0], [38.1, 120.0], [38.2, 120.0], [38.3, 126.0], [38.4, 127.0], [38.5, 128.0], [38.6, 129.0], [38.7, 129.0], [38.8, 129.0], [38.9, 130.0], [39.0, 131.0], [39.1, 132.0], [39.2, 135.0], [39.3, 140.0], [39.4, 140.0], [39.5, 142.0], [39.6, 146.0], [39.7, 158.0], [39.8, 160.0], [39.9, 162.0], [40.0, 174.0], [40.1, 179.0], [40.2, 180.0], [40.3, 182.0], [40.4, 184.0], [40.5, 189.0], [40.6, 194.0], [40.7, 194.0], [40.8, 196.0], [40.9, 197.0], [41.0, 201.0], [41.1, 208.0], [41.2, 212.0], [41.3, 212.0], [41.4, 214.0], [41.5, 217.0], [41.6, 222.0], [41.7, 223.0], [41.8, 223.0], [41.9, 224.0], [42.0, 226.0], [42.1, 226.0], [42.2, 241.0], [42.3, 244.0], [42.4, 244.0], [42.5, 245.0], [42.6, 246.0], [42.7, 250.0], [42.8, 259.0], [42.9, 263.0], [43.0, 267.0], [43.1, 269.0], [43.2, 271.0], [43.3, 274.0], [43.4, 275.0], [43.5, 276.0], [43.6, 277.0], [43.7, 286.0], [43.8, 288.0], [43.9, 288.0], [44.0, 289.0], [44.1, 289.0], [44.2, 291.0], [44.3, 295.0], [44.4, 304.0], [44.5, 304.0], [44.6, 311.0], [44.7, 319.0], [44.8, 319.0], [44.9, 322.0], [45.0, 328.0], [45.1, 334.0], [45.2, 336.0], [45.3, 337.0], [45.4, 340.0], [45.5, 344.0], [45.6, 346.0], [45.7, 347.0], [45.8, 348.0], [45.9, 354.0], [46.0, 354.0], [46.1, 355.0], [46.2, 362.0], [46.3, 362.0], [46.4, 363.0], [46.5, 364.0], [46.6, 368.0], [46.7, 369.0], [46.8, 373.0], [46.9, 385.0], [47.0, 393.0], [47.1, 400.0], [47.2, 400.0], [47.3, 402.0], [47.4, 407.0], [47.5, 425.0], [47.6, 429.0], [47.7, 429.0], [47.8, 433.0], [47.9, 437.0], [48.0, 444.0], [48.1, 444.0], [48.2, 445.0], [48.3, 445.0], [48.4, 449.0], [48.5, 451.0], [48.6, 452.0], [48.7, 453.0], [48.8, 455.0], [48.9, 456.0], [49.0, 457.0], [49.1, 461.0], [49.2, 462.0], [49.3, 462.0], [49.4, 467.0], [49.5, 468.0], [49.6, 470.0], [49.7, 472.0], [49.8, 475.0], [49.9, 475.0], [50.0, 476.0], [50.1, 481.0], [50.2, 483.0], [50.3, 483.0], [50.4, 484.0], [50.5, 484.0], [50.6, 496.0], [50.7, 498.0], [50.8, 499.0], [50.9, 500.0], [51.0, 500.0], [51.1, 502.0], [51.2, 503.0], [51.3, 506.0], [51.4, 507.0], [51.5, 507.0], [51.6, 510.0], [51.7, 510.0], [51.8, 511.0], [51.9, 513.0], [52.0, 513.0], [52.1, 513.0], [52.2, 524.0], [52.3, 527.0], [52.4, 527.0], [52.5, 529.0], [52.6, 537.0], [52.7, 537.0], [52.8, 538.0], [52.9, 539.0], [53.0, 540.0], [53.1, 542.0], [53.2, 542.0], [53.3, 542.0], [53.4, 543.0], [53.5, 544.0], [53.6, 545.0], [53.7, 546.0], [53.8, 547.0], [53.9, 548.0], [54.0, 549.0], [54.1, 549.0], [54.2, 549.0], [54.3, 549.0], [54.4, 549.0], [54.5, 550.0], [54.6, 550.0], [54.7, 551.0], [54.8, 557.0], [54.9, 557.0], [55.0, 562.0], [55.1, 563.0], [55.2, 565.0], [55.3, 566.0], [55.4, 566.0], [55.5, 567.0], [55.6, 567.0], [55.7, 570.0], [55.8, 571.0], [55.9, 573.0], [56.0, 573.0], [56.1, 577.0], [56.2, 578.0], [56.3, 580.0], [56.4, 580.0], [56.5, 585.0], [56.6, 590.0], [56.7, 591.0], [56.8, 591.0], [56.9, 593.0], [57.0, 594.0], [57.1, 595.0], [57.2, 595.0], [57.3, 596.0], [57.4, 598.0], [57.5, 598.0], [57.6, 601.0], [57.7, 601.0], [57.8, 602.0], [57.9, 602.0], [58.0, 602.0], [58.1, 604.0], [58.2, 605.0], [58.3, 608.0], [58.4, 612.0], [58.5, 613.0], [58.6, 614.0], [58.7, 615.0], [58.8, 621.0], [58.9, 621.0], [59.0, 622.0], [59.1, 622.0], [59.2, 622.0], [59.3, 624.0], [59.4, 627.0], [59.5, 629.0], [59.6, 629.0], [59.7, 630.0], [59.8, 630.0], [59.9, 632.0], [60.0, 632.0], [60.1, 634.0], [60.2, 635.0], [60.3, 636.0], [60.4, 636.0], [60.5, 637.0], [60.6, 639.0], [60.7, 640.0], [60.8, 640.0], [60.9, 641.0], [61.0, 644.0], [61.1, 644.0], [61.2, 645.0], [61.3, 646.0], [61.4, 646.0], [61.5, 646.0], [61.6, 647.0], [61.7, 649.0], [61.8, 649.0], [61.9, 650.0], [62.0, 651.0], [62.1, 654.0], [62.2, 654.0], [62.3, 654.0], [62.4, 654.0], [62.5, 656.0], [62.6, 657.0], [62.7, 658.0], [62.8, 661.0], [62.9, 661.0], [63.0, 661.0], [63.1, 662.0], [63.2, 663.0], [63.3, 663.0], [63.4, 663.0], [63.5, 664.0], [63.6, 666.0], [63.7, 666.0], [63.8, 666.0], [63.9, 668.0], [64.0, 671.0], [64.1, 671.0], [64.2, 671.0], [64.3, 672.0], [64.4, 673.0], [64.5, 675.0], [64.6, 676.0], [64.7, 677.0], [64.8, 677.0], [64.9, 678.0], [65.0, 679.0], [65.1, 680.0], [65.2, 683.0], [65.3, 683.0], [65.4, 684.0], [65.5, 686.0], [65.6, 688.0], [65.7, 688.0], [65.8, 691.0], [65.9, 693.0], [66.0, 694.0], [66.1, 694.0], [66.2, 695.0], [66.3, 696.0], [66.4, 697.0], [66.5, 697.0], [66.6, 698.0], [66.7, 699.0], [66.8, 701.0], [66.9, 703.0], [67.0, 703.0], [67.1, 705.0], [67.2, 705.0], [67.3, 707.0], [67.4, 709.0], [67.5, 711.0], [67.6, 711.0], [67.7, 713.0], [67.8, 717.0], [67.9, 717.0], [68.0, 719.0], [68.1, 719.0], [68.2, 720.0], [68.3, 722.0], [68.4, 722.0], [68.5, 723.0], [68.6, 724.0], [68.7, 724.0], [68.8, 727.0], [68.9, 729.0], [69.0, 729.0], [69.1, 730.0], [69.2, 732.0], [69.3, 734.0], [69.4, 737.0], [69.5, 741.0], [69.6, 742.0], [69.7, 743.0], [69.8, 744.0], [69.9, 744.0], [70.0, 745.0], [70.1, 746.0], [70.2, 749.0], [70.3, 755.0], [70.4, 756.0], [70.5, 757.0], [70.6, 757.0], [70.7, 757.0], [70.8, 758.0], [70.9, 758.0], [71.0, 760.0], [71.1, 761.0], [71.2, 761.0], [71.3, 761.0], [71.4, 763.0], [71.5, 763.0], [71.6, 764.0], [71.7, 768.0], [71.8, 769.0], [71.9, 770.0], [72.0, 771.0], [72.1, 773.0], [72.2, 773.0], [72.3, 777.0], [72.4, 778.0], [72.5, 780.0], [72.6, 781.0], [72.7, 782.0], [72.8, 785.0], [72.9, 785.0], [73.0, 786.0], [73.1, 787.0], [73.2, 788.0], [73.3, 791.0], [73.4, 793.0], [73.5, 794.0], [73.6, 794.0], [73.7, 796.0], [73.8, 796.0], [73.9, 799.0], [74.0, 800.0], [74.1, 802.0], [74.2, 805.0], [74.3, 805.0], [74.4, 807.0], [74.5, 809.0], [74.6, 809.0], [74.7, 810.0], [74.8, 811.0], [74.9, 812.0], [75.0, 813.0], [75.1, 814.0], [75.2, 815.0], [75.3, 815.0], [75.4, 816.0], [75.5, 816.0], [75.6, 821.0], [75.7, 823.0], [75.8, 825.0], [75.9, 825.0], [76.0, 827.0], [76.1, 827.0], [76.2, 832.0], [76.3, 834.0], [76.4, 834.0], [76.5, 836.0], [76.6, 836.0], [76.7, 836.0], [76.8, 836.0], [76.9, 837.0], [77.0, 837.0], [77.1, 837.0], [77.2, 842.0], [77.3, 844.0], [77.4, 846.0], [77.5, 846.0], [77.6, 854.0], [77.7, 854.0], [77.8, 856.0], [77.9, 858.0], [78.0, 859.0], [78.1, 859.0], [78.2, 860.0], [78.3, 861.0], [78.4, 864.0], [78.5, 864.0], [78.6, 865.0], [78.7, 865.0], [78.8, 865.0], [78.9, 866.0], [79.0, 866.0], [79.1, 867.0], [79.2, 868.0], [79.3, 869.0], [79.4, 871.0], [79.5, 871.0], [79.6, 871.0], [79.7, 878.0], [79.8, 878.0], [79.9, 878.0], [80.0, 878.0], [80.1, 878.0], [80.2, 879.0], [80.3, 880.0], [80.4, 880.0], [80.5, 880.0], [80.6, 881.0], [80.7, 885.0], [80.8, 886.0], [80.9, 886.0], [81.0, 888.0], [81.1, 890.0], [81.2, 892.0], [81.3, 892.0], [81.4, 893.0], [81.5, 894.0], [81.6, 895.0], [81.7, 896.0], [81.8, 896.0], [81.9, 898.0], [82.0, 898.0], [82.1, 899.0], [82.2, 901.0], [82.3, 902.0], [82.4, 903.0], [82.5, 903.0], [82.6, 904.0], [82.7, 906.0], [82.8, 906.0], [82.9, 907.0], [83.0, 908.0], [83.1, 909.0], [83.2, 909.0], [83.3, 910.0], [83.4, 913.0], [83.5, 915.0], [83.6, 918.0], [83.7, 918.0], [83.8, 918.0], [83.9, 926.0], [84.0, 926.0], [84.1, 927.0], [84.2, 928.0], [84.3, 931.0], [84.4, 932.0], [84.5, 932.0], [84.6, 933.0], [84.7, 935.0], [84.8, 937.0], [84.9, 937.0], [85.0, 938.0], [85.1, 938.0], [85.2, 939.0], [85.3, 939.0], [85.4, 940.0], [85.5, 942.0], [85.6, 944.0], [85.7, 944.0], [85.8, 946.0], [85.9, 947.0], [86.0, 948.0], [86.1, 950.0], [86.2, 951.0], [86.3, 955.0], [86.4, 959.0], [86.5, 963.0], [86.6, 966.0], [86.7, 966.0], [86.8, 973.0], [86.9, 974.0], [87.0, 978.0], [87.1, 980.0], [87.2, 980.0], [87.3, 980.0], [87.4, 983.0], [87.5, 984.0], [87.6, 985.0], [87.7, 985.0], [87.8, 985.0], [87.9, 987.0], [88.0, 992.0], [88.1, 993.0], [88.2, 994.0], [88.3, 995.0], [88.4, 996.0], [88.5, 997.0], [88.6, 1001.0], [88.7, 1005.0], [88.8, 1010.0], [88.9, 1012.0], [89.0, 1014.0], [89.1, 1015.0], [89.2, 1016.0], [89.3, 1017.0], [89.4, 1017.0], [89.5, 1020.0], [89.6, 1021.0], [89.7, 1022.0], [89.8, 1023.0], [89.9, 1023.0], [90.0, 1026.0], [90.1, 1028.0], [90.2, 1029.0], [90.3, 1032.0], [90.4, 1033.0], [90.5, 1035.0], [90.6, 1039.0], [90.7, 1042.0], [90.8, 1046.0], [90.9, 1048.0], [91.0, 1053.0], [91.1, 1053.0], [91.2, 1057.0], [91.3, 1060.0], [91.4, 1060.0], [91.5, 1061.0], [91.6, 1061.0], [91.7, 1062.0], [91.8, 1065.0], [91.9, 1065.0], [92.0, 1070.0], [92.1, 1070.0], [92.2, 1082.0], [92.3, 1082.0], [92.4, 1083.0], [92.5, 1086.0], [92.6, 1096.0], [92.7, 1097.0], [92.8, 1104.0], [92.9, 1107.0], [93.0, 1113.0], [93.1, 1114.0], [93.2, 1114.0], [93.3, 1115.0], [93.4, 1121.0], [93.5, 1122.0], [93.6, 1126.0], [93.7, 1131.0], [93.8, 1132.0], [93.9, 1136.0], [94.0, 1137.0], [94.1, 1139.0], [94.2, 1140.0], [94.3, 1143.0], [94.4, 1147.0], [94.5, 1151.0], [94.6, 1156.0], [94.7, 1157.0], [94.8, 1163.0], [94.9, 1179.0], [95.0, 1179.0], [95.1, 1180.0], [95.2, 1188.0], [95.3, 1189.0], [95.4, 1191.0], [95.5, 1192.0], [95.6, 1192.0], [95.7, 1193.0], [95.8, 1193.0], [95.9, 1210.0], [96.0, 1216.0], [96.1, 1223.0], [96.2, 1225.0], [96.3, 1230.0], [96.4, 1236.0], [96.5, 1237.0], [96.6, 1240.0], [96.7, 1249.0], [96.8, 1252.0], [96.9, 1253.0], [97.0, 1254.0], [97.1, 1254.0], [97.2, 1257.0], [97.3, 1258.0], [97.4, 1271.0], [97.5, 1273.0], [97.6, 1274.0], [97.7, 1293.0], [97.8, 1300.0], [97.9, 1315.0], [98.0, 1329.0], [98.1, 1365.0], [98.2, 1382.0], [98.3, 1392.0], [98.4, 1423.0], [98.5, 1424.0], [98.6, 1443.0], [98.7, 1480.0], [98.8, 1485.0], [98.9, 1488.0], [99.0, 1494.0], [99.1, 1510.0], [99.2, 1520.0], [99.3, 1550.0], [99.4, 1563.0], [99.5, 1604.0], [99.6, 1606.0], [99.7, 1754.0], [99.8, 1832.0], [99.9, 1883.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 206.0, "series": [{"data": [[0.0, 206.0], [600.0, 92.0], [700.0, 72.0], [200.0, 34.0], [800.0, 83.0], [900.0, 64.0], [1000.0, 42.0], [1100.0, 31.0], [300.0, 27.0], [1200.0, 19.0], [1300.0, 6.0], [1400.0, 7.0], [1500.0, 4.0], [100.0, 203.0], [1600.0, 2.0], [400.0, 38.0], [1700.0, 1.0], [1800.0, 2.0], [500.0, 67.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 9.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 510.0, "series": [{"data": [[1.0, 481.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 510.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 9.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 47.14496314496315, "minX": 1.54961898E12, "maxY": 50.06451612903227, "series": [{"data": [[1.54961904E12, 50.06451612903227], [1.54961898E12, 47.14496314496315]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 83.85000000000001, "minX": 1.0, "maxY": 1404.0, "series": [{"data": [[2.0, 288.0], [3.0, 246.0], [4.0, 319.0], [5.0, 165.33333333333331], [6.0, 112.1], [7.0, 83.85000000000001], [8.0, 102.03124999999999], [9.0, 92.92134831460673], [10.0, 101.33587786259545], [11.0, 109.69135802469138], [12.0, 121.99999999999997], [13.0, 168.14285714285717], [14.0, 258.3333333333333], [15.0, 262.0], [16.0, 228.40000000000003], [17.0, 246.66666666666666], [18.0, 252.0], [19.0, 271.0], [20.0, 293.25], [21.0, 273.0], [22.0, 325.1666666666667], [23.0, 284.75], [24.0, 422.0], [25.0, 342.0], [26.0, 334.3333333333333], [27.0, 329.0], [28.0, 244.0], [29.0, 367.5], [30.0, 362.0], [31.0, 294.6666666666667], [32.0, 371.3333333333333], [33.0, 400.0], [35.0, 429.0], [34.0, 462.0], [37.0, 578.0], [36.0, 437.0], [39.0, 513.0], [38.0, 467.0], [41.0, 668.0], [40.0, 483.0], [43.0, 484.0], [42.0, 425.0], [45.0, 677.0], [44.0, 544.0], [47.0, 503.0], [46.0, 549.0], [49.0, 545.5], [48.0, 470.0], [51.0, 515.1999999999999], [50.0, 509.4], [53.0, 472.75], [52.0, 541.875], [55.0, 583.6666666666665], [54.0, 584.8333333333334], [57.0, 550.3333333333334], [56.0, 541.6000000000001], [59.0, 655.2], [58.0, 594.875], [61.0, 584.6666666666666], [60.0, 692.6666666666666], [63.0, 667.9], [62.0, 603.3636363636365], [67.0, 671.0], [66.0, 679.7777777777778], [65.0, 686.6666666666666], [64.0, 666.0], [70.0, 694.2499999999999], [71.0, 714.5714285714286], [69.0, 694.4545454545455], [68.0, 712.1999999999999], [75.0, 774.8571428571429], [74.0, 704.5714285714286], [73.0, 736.1538461538462], [72.0, 694.5], [79.0, 835.125], [78.0, 820.0000000000001], [77.0, 790.3846153846154], [76.0, 828.7777777777777], [83.0, 942.5], [82.0, 900.5], [81.0, 784.7777777777778], [80.0, 785.25], [86.0, 893.5263157894736], [87.0, 917.6363636363635], [85.0, 845.9166666666665], [84.0, 927.1666666666666], [91.0, 742.5], [90.0, 904.4], [89.0, 939.5], [88.0, 790.625], [95.0, 1089.0], [94.0, 881.6666666666666], [93.0, 1230.0], [92.0, 997.0], [99.0, 1077.818181818182], [98.0, 1044.6666666666667], [97.0, 994.3333333333334], [96.0, 1022.0], [103.0, 996.5], [102.0, 1093.4444444444446], [101.0, 1115.9375], [100.0, 1049.0], [107.0, 1114.0], [106.0, 1233.3333333333333], [105.0, 946.0], [104.0, 1006.1249999999999], [111.0, 1298.0], [110.0, 1293.0], [109.0, 1174.25], [108.0, 1404.0], [114.0, 1032.75], [115.0, 926.125], [113.0, 1308.5], [112.0, 1210.75], [117.0, 939.8333333333333], [116.0, 1049.4], [118.0, 1023.8333333333334], [119.0, 1121.0], [1.0, 277.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[47.688, 495.20899999999995]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 119.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1168.7, "minX": 1.54961898E12, "maxY": 5710.716666666666, "series": [{"data": [[1.54961904E12, 1304.7333333333333], [1.54961898E12, 5710.716666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961904E12, 1168.7], [1.54961898E12, 5114.633333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 482.19287469287445, "minX": 1.54961898E12, "maxY": 552.1720430107529, "series": [{"data": [[1.54961904E12, 552.1720430107529], [1.54961898E12, 482.19287469287445]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 482.17321867321886, "minX": 1.54961898E12, "maxY": 552.1666666666666, "series": [{"data": [[1.54961904E12, 552.1666666666666], [1.54961898E12, 482.17321867321886]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.30645161290322565, "minX": 1.54961898E12, "maxY": 3.9840294840294894, "series": [{"data": [[1.54961904E12, 0.30645161290322565], [1.54961898E12, 3.9840294840294894]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 70.0, "minX": 1.54961898E12, "maxY": 1883.0, "series": [{"data": [[1.54961904E12, 892.0], [1.54961898E12, 1883.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961904E12, 245.0], [1.54961898E12, 70.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961904E12, 1025.6999999999998], [1.54961898E12, 1065.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961904E12, 1493.94], [1.54961898E12, 1518.5000000000002]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961904E12, 1179.0], [1.54961898E12, 1211.5]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 195.0, "minX": 3.0, "maxY": 549.0, "series": [{"data": [[3.0, 549.0], [13.0, 195.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 13.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 195.0, "minX": 3.0, "maxY": 549.0, "series": [{"data": [[3.0, 549.0], [13.0, 195.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 13.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 1.9333333333333333, "minX": 1.54961898E12, "maxY": 14.733333333333333, "series": [{"data": [[1.54961904E12, 1.9333333333333333], [1.54961898E12, 14.733333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 3.1, "minX": 1.54961898E12, "maxY": 13.566666666666666, "series": [{"data": [[1.54961904E12, 3.1], [1.54961898E12, 13.566666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 3.1, "minX": 1.54961898E12, "maxY": 13.566666666666666, "series": [{"data": [[1.54961904E12, 3.1], [1.54961898E12, 13.566666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Transactions Per Second"}},
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
