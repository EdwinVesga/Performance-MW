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
        data: {"result": {"minY": 67.0, "minX": 0.0, "maxY": 2188.0, "series": [{"data": [[0.0, 67.0], [0.1, 70.0], [0.2, 72.0], [0.3, 72.0], [0.4, 73.0], [0.5, 74.0], [0.6, 74.0], [0.7, 74.0], [0.8, 75.0], [0.9, 75.0], [1.0, 75.0], [1.1, 75.0], [1.2, 75.0], [1.3, 76.0], [1.4, 76.0], [1.5, 76.0], [1.6, 76.0], [1.7, 76.0], [1.8, 77.0], [1.9, 77.0], [2.0, 77.0], [2.1, 77.0], [2.2, 78.0], [2.3, 78.0], [2.4, 78.0], [2.5, 78.0], [2.6, 78.0], [2.7, 79.0], [2.8, 79.0], [2.9, 79.0], [3.0, 80.0], [3.1, 80.0], [3.2, 80.0], [3.3, 80.0], [3.4, 81.0], [3.5, 81.0], [3.6, 81.0], [3.7, 81.0], [3.8, 81.0], [3.9, 81.0], [4.0, 81.0], [4.1, 81.0], [4.2, 81.0], [4.3, 82.0], [4.4, 82.0], [4.5, 82.0], [4.6, 82.0], [4.7, 82.0], [4.8, 82.0], [4.9, 83.0], [5.0, 83.0], [5.1, 83.0], [5.2, 83.0], [5.3, 83.0], [5.4, 83.0], [5.5, 83.0], [5.6, 83.0], [5.7, 83.0], [5.8, 83.0], [5.9, 83.0], [6.0, 83.0], [6.1, 83.0], [6.2, 84.0], [6.3, 84.0], [6.4, 84.0], [6.5, 84.0], [6.6, 84.0], [6.7, 84.0], [6.8, 84.0], [6.9, 84.0], [7.0, 84.0], [7.1, 84.0], [7.2, 85.0], [7.3, 85.0], [7.4, 85.0], [7.5, 85.0], [7.6, 85.0], [7.7, 85.0], [7.8, 85.0], [7.9, 85.0], [8.0, 85.0], [8.1, 85.0], [8.2, 86.0], [8.3, 86.0], [8.4, 86.0], [8.5, 86.0], [8.6, 86.0], [8.7, 86.0], [8.8, 86.0], [8.9, 86.0], [9.0, 86.0], [9.1, 86.0], [9.2, 86.0], [9.3, 86.0], [9.4, 86.0], [9.5, 87.0], [9.6, 87.0], [9.7, 87.0], [9.8, 87.0], [9.9, 87.0], [10.0, 87.0], [10.1, 87.0], [10.2, 87.0], [10.3, 87.0], [10.4, 87.0], [10.5, 87.0], [10.6, 87.0], [10.7, 87.0], [10.8, 88.0], [10.9, 88.0], [11.0, 88.0], [11.1, 88.0], [11.2, 88.0], [11.3, 88.0], [11.4, 88.0], [11.5, 88.0], [11.6, 88.0], [11.7, 88.0], [11.8, 88.0], [11.9, 88.0], [12.0, 88.0], [12.1, 88.0], [12.2, 89.0], [12.3, 89.0], [12.4, 89.0], [12.5, 89.0], [12.6, 89.0], [12.7, 89.0], [12.8, 89.0], [12.9, 89.0], [13.0, 89.0], [13.1, 90.0], [13.2, 90.0], [13.3, 90.0], [13.4, 90.0], [13.5, 90.0], [13.6, 90.0], [13.7, 90.0], [13.8, 90.0], [13.9, 90.0], [14.0, 90.0], [14.1, 90.0], [14.2, 90.0], [14.3, 90.0], [14.4, 90.0], [14.5, 90.0], [14.6, 90.0], [14.7, 90.0], [14.8, 90.0], [14.9, 90.0], [15.0, 90.0], [15.1, 90.0], [15.2, 90.0], [15.3, 90.0], [15.4, 90.0], [15.5, 91.0], [15.6, 91.0], [15.7, 91.0], [15.8, 91.0], [15.9, 91.0], [16.0, 91.0], [16.1, 91.0], [16.2, 91.0], [16.3, 91.0], [16.4, 91.0], [16.5, 91.0], [16.6, 92.0], [16.7, 92.0], [16.8, 92.0], [16.9, 92.0], [17.0, 92.0], [17.1, 92.0], [17.2, 92.0], [17.3, 92.0], [17.4, 92.0], [17.5, 92.0], [17.6, 92.0], [17.7, 92.0], [17.8, 92.0], [17.9, 92.0], [18.0, 92.0], [18.1, 92.0], [18.2, 92.0], [18.3, 93.0], [18.4, 93.0], [18.5, 93.0], [18.6, 93.0], [18.7, 93.0], [18.8, 93.0], [18.9, 93.0], [19.0, 93.0], [19.1, 93.0], [19.2, 93.0], [19.3, 93.0], [19.4, 93.0], [19.5, 93.0], [19.6, 93.0], [19.7, 93.0], [19.8, 93.0], [19.9, 93.0], [20.0, 93.0], [20.1, 94.0], [20.2, 94.0], [20.3, 94.0], [20.4, 94.0], [20.5, 94.0], [20.6, 94.0], [20.7, 94.0], [20.8, 94.0], [20.9, 95.0], [21.0, 95.0], [21.1, 95.0], [21.2, 95.0], [21.3, 95.0], [21.4, 95.0], [21.5, 95.0], [21.6, 95.0], [21.7, 95.0], [21.8, 95.0], [21.9, 95.0], [22.0, 95.0], [22.1, 95.0], [22.2, 95.0], [22.3, 95.0], [22.4, 95.0], [22.5, 95.0], [22.6, 96.0], [22.7, 96.0], [22.8, 96.0], [22.9, 96.0], [23.0, 96.0], [23.1, 96.0], [23.2, 96.0], [23.3, 96.0], [23.4, 96.0], [23.5, 96.0], [23.6, 96.0], [23.7, 97.0], [23.8, 97.0], [23.9, 97.0], [24.0, 97.0], [24.1, 97.0], [24.2, 97.0], [24.3, 97.0], [24.4, 97.0], [24.5, 97.0], [24.6, 97.0], [24.7, 97.0], [24.8, 97.0], [24.9, 97.0], [25.0, 97.0], [25.1, 97.0], [25.2, 97.0], [25.3, 97.0], [25.4, 97.0], [25.5, 98.0], [25.6, 98.0], [25.7, 98.0], [25.8, 98.0], [25.9, 98.0], [26.0, 98.0], [26.1, 98.0], [26.2, 98.0], [26.3, 98.0], [26.4, 98.0], [26.5, 98.0], [26.6, 98.0], [26.7, 99.0], [26.8, 99.0], [26.9, 99.0], [27.0, 99.0], [27.1, 99.0], [27.2, 99.0], [27.3, 99.0], [27.4, 99.0], [27.5, 99.0], [27.6, 99.0], [27.7, 99.0], [27.8, 99.0], [27.9, 99.0], [28.0, 99.0], [28.1, 100.0], [28.2, 100.0], [28.3, 100.0], [28.4, 100.0], [28.5, 100.0], [28.6, 100.0], [28.7, 100.0], [28.8, 101.0], [28.9, 101.0], [29.0, 101.0], [29.1, 101.0], [29.2, 101.0], [29.3, 101.0], [29.4, 101.0], [29.5, 102.0], [29.6, 102.0], [29.7, 102.0], [29.8, 102.0], [29.9, 102.0], [30.0, 102.0], [30.1, 102.0], [30.2, 102.0], [30.3, 102.0], [30.4, 102.0], [30.5, 103.0], [30.6, 103.0], [30.7, 103.0], [30.8, 103.0], [30.9, 103.0], [31.0, 103.0], [31.1, 104.0], [31.2, 104.0], [31.3, 104.0], [31.4, 104.0], [31.5, 104.0], [31.6, 104.0], [31.7, 104.0], [31.8, 104.0], [31.9, 104.0], [32.0, 104.0], [32.1, 104.0], [32.2, 105.0], [32.3, 105.0], [32.4, 105.0], [32.5, 105.0], [32.6, 105.0], [32.7, 105.0], [32.8, 105.0], [32.9, 105.0], [33.0, 106.0], [33.1, 106.0], [33.2, 106.0], [33.3, 106.0], [33.4, 106.0], [33.5, 106.0], [33.6, 106.0], [33.7, 107.0], [33.8, 107.0], [33.9, 107.0], [34.0, 108.0], [34.1, 108.0], [34.2, 108.0], [34.3, 108.0], [34.4, 109.0], [34.5, 109.0], [34.6, 109.0], [34.7, 109.0], [34.8, 110.0], [34.9, 110.0], [35.0, 110.0], [35.1, 111.0], [35.2, 111.0], [35.3, 111.0], [35.4, 111.0], [35.5, 112.0], [35.6, 112.0], [35.7, 112.0], [35.8, 112.0], [35.9, 112.0], [36.0, 113.0], [36.1, 113.0], [36.2, 113.0], [36.3, 114.0], [36.4, 114.0], [36.5, 115.0], [36.6, 115.0], [36.7, 116.0], [36.8, 116.0], [36.9, 116.0], [37.0, 116.0], [37.1, 116.0], [37.2, 116.0], [37.3, 118.0], [37.4, 119.0], [37.5, 119.0], [37.6, 119.0], [37.7, 119.0], [37.8, 120.0], [37.9, 120.0], [38.0, 121.0], [38.1, 121.0], [38.2, 121.0], [38.3, 121.0], [38.4, 122.0], [38.5, 122.0], [38.6, 122.0], [38.7, 123.0], [38.8, 124.0], [38.9, 124.0], [39.0, 125.0], [39.1, 125.0], [39.2, 126.0], [39.3, 126.0], [39.4, 126.0], [39.5, 127.0], [39.6, 128.0], [39.7, 129.0], [39.8, 129.0], [39.9, 129.0], [40.0, 130.0], [40.1, 130.0], [40.2, 130.0], [40.3, 131.0], [40.4, 132.0], [40.5, 133.0], [40.6, 133.0], [40.7, 133.0], [40.8, 133.0], [40.9, 133.0], [41.0, 134.0], [41.1, 134.0], [41.2, 135.0], [41.3, 135.0], [41.4, 135.0], [41.5, 137.0], [41.6, 138.0], [41.7, 138.0], [41.8, 138.0], [41.9, 139.0], [42.0, 140.0], [42.1, 140.0], [42.2, 142.0], [42.3, 142.0], [42.4, 142.0], [42.5, 143.0], [42.6, 145.0], [42.7, 146.0], [42.8, 146.0], [42.9, 156.0], [43.0, 156.0], [43.1, 166.0], [43.2, 167.0], [43.3, 171.0], [43.4, 172.0], [43.5, 178.0], [43.6, 180.0], [43.7, 187.0], [43.8, 195.0], [43.9, 199.0], [44.0, 199.0], [44.1, 199.0], [44.2, 201.0], [44.3, 202.0], [44.4, 207.0], [44.5, 209.0], [44.6, 209.0], [44.7, 210.0], [44.8, 215.0], [44.9, 217.0], [45.0, 220.0], [45.1, 223.0], [45.2, 227.0], [45.3, 229.0], [45.4, 229.0], [45.5, 233.0], [45.6, 242.0], [45.7, 246.0], [45.8, 247.0], [45.9, 247.0], [46.0, 248.0], [46.1, 250.0], [46.2, 252.0], [46.3, 261.0], [46.4, 264.0], [46.5, 273.0], [46.6, 277.0], [46.7, 278.0], [46.8, 279.0], [46.9, 280.0], [47.0, 284.0], [47.1, 292.0], [47.2, 297.0], [47.3, 298.0], [47.4, 299.0], [47.5, 301.0], [47.6, 306.0], [47.7, 308.0], [47.8, 308.0], [47.9, 311.0], [48.0, 317.0], [48.1, 320.0], [48.2, 324.0], [48.3, 326.0], [48.4, 328.0], [48.5, 329.0], [48.6, 332.0], [48.7, 333.0], [48.8, 334.0], [48.9, 336.0], [49.0, 339.0], [49.1, 341.0], [49.2, 342.0], [49.3, 345.0], [49.4, 357.0], [49.5, 367.0], [49.6, 371.0], [49.7, 375.0], [49.8, 379.0], [49.9, 382.0], [50.0, 388.0], [50.1, 388.0], [50.2, 393.0], [50.3, 395.0], [50.4, 405.0], [50.5, 414.0], [50.6, 417.0], [50.7, 426.0], [50.8, 432.0], [50.9, 437.0], [51.0, 437.0], [51.1, 439.0], [51.2, 449.0], [51.3, 450.0], [51.4, 456.0], [51.5, 460.0], [51.6, 463.0], [51.7, 463.0], [51.8, 472.0], [51.9, 477.0], [52.0, 477.0], [52.1, 479.0], [52.2, 491.0], [52.3, 491.0], [52.4, 492.0], [52.5, 493.0], [52.6, 494.0], [52.7, 495.0], [52.8, 500.0], [52.9, 501.0], [53.0, 503.0], [53.1, 507.0], [53.2, 508.0], [53.3, 508.0], [53.4, 511.0], [53.5, 513.0], [53.6, 514.0], [53.7, 523.0], [53.8, 525.0], [53.9, 526.0], [54.0, 529.0], [54.1, 530.0], [54.2, 531.0], [54.3, 542.0], [54.4, 543.0], [54.5, 545.0], [54.6, 545.0], [54.7, 547.0], [54.8, 553.0], [54.9, 558.0], [55.0, 559.0], [55.1, 570.0], [55.2, 571.0], [55.3, 573.0], [55.4, 574.0], [55.5, 582.0], [55.6, 583.0], [55.7, 585.0], [55.8, 586.0], [55.9, 590.0], [56.0, 591.0], [56.1, 592.0], [56.2, 593.0], [56.3, 595.0], [56.4, 595.0], [56.5, 597.0], [56.6, 599.0], [56.7, 599.0], [56.8, 601.0], [56.9, 604.0], [57.0, 604.0], [57.1, 607.0], [57.2, 608.0], [57.3, 609.0], [57.4, 611.0], [57.5, 612.0], [57.6, 613.0], [57.7, 614.0], [57.8, 614.0], [57.9, 616.0], [58.0, 616.0], [58.1, 616.0], [58.2, 618.0], [58.3, 620.0], [58.4, 620.0], [58.5, 623.0], [58.6, 624.0], [58.7, 626.0], [58.8, 626.0], [58.9, 627.0], [59.0, 628.0], [59.1, 628.0], [59.2, 628.0], [59.3, 629.0], [59.4, 632.0], [59.5, 632.0], [59.6, 633.0], [59.7, 635.0], [59.8, 637.0], [59.9, 639.0], [60.0, 641.0], [60.1, 643.0], [60.2, 643.0], [60.3, 643.0], [60.4, 644.0], [60.5, 646.0], [60.6, 646.0], [60.7, 646.0], [60.8, 647.0], [60.9, 648.0], [61.0, 649.0], [61.1, 652.0], [61.2, 652.0], [61.3, 653.0], [61.4, 656.0], [61.5, 658.0], [61.6, 659.0], [61.7, 664.0], [61.8, 664.0], [61.9, 664.0], [62.0, 664.0], [62.1, 665.0], [62.2, 665.0], [62.3, 669.0], [62.4, 670.0], [62.5, 672.0], [62.6, 674.0], [62.7, 678.0], [62.8, 679.0], [62.9, 681.0], [63.0, 682.0], [63.1, 685.0], [63.2, 687.0], [63.3, 687.0], [63.4, 688.0], [63.5, 688.0], [63.6, 689.0], [63.7, 690.0], [63.8, 690.0], [63.9, 693.0], [64.0, 694.0], [64.1, 694.0], [64.2, 697.0], [64.3, 698.0], [64.4, 699.0], [64.5, 699.0], [64.6, 700.0], [64.7, 701.0], [64.8, 701.0], [64.9, 701.0], [65.0, 702.0], [65.1, 703.0], [65.2, 704.0], [65.3, 704.0], [65.4, 706.0], [65.5, 706.0], [65.6, 710.0], [65.7, 711.0], [65.8, 711.0], [65.9, 712.0], [66.0, 712.0], [66.1, 713.0], [66.2, 714.0], [66.3, 716.0], [66.4, 716.0], [66.5, 717.0], [66.6, 717.0], [66.7, 721.0], [66.8, 721.0], [66.9, 721.0], [67.0, 725.0], [67.1, 725.0], [67.2, 725.0], [67.3, 728.0], [67.4, 729.0], [67.5, 730.0], [67.6, 731.0], [67.7, 731.0], [67.8, 733.0], [67.9, 733.0], [68.0, 734.0], [68.1, 734.0], [68.2, 734.0], [68.3, 734.0], [68.4, 735.0], [68.5, 735.0], [68.6, 736.0], [68.7, 736.0], [68.8, 739.0], [68.9, 739.0], [69.0, 742.0], [69.1, 743.0], [69.2, 744.0], [69.3, 747.0], [69.4, 749.0], [69.5, 749.0], [69.6, 751.0], [69.7, 751.0], [69.8, 752.0], [69.9, 752.0], [70.0, 754.0], [70.1, 755.0], [70.2, 755.0], [70.3, 757.0], [70.4, 759.0], [70.5, 762.0], [70.6, 762.0], [70.7, 764.0], [70.8, 765.0], [70.9, 765.0], [71.0, 765.0], [71.1, 766.0], [71.2, 767.0], [71.3, 768.0], [71.4, 768.0], [71.5, 768.0], [71.6, 769.0], [71.7, 770.0], [71.8, 772.0], [71.9, 774.0], [72.0, 774.0], [72.1, 775.0], [72.2, 777.0], [72.3, 781.0], [72.4, 782.0], [72.5, 783.0], [72.6, 787.0], [72.7, 788.0], [72.8, 789.0], [72.9, 789.0], [73.0, 791.0], [73.1, 792.0], [73.2, 795.0], [73.3, 795.0], [73.4, 796.0], [73.5, 796.0], [73.6, 797.0], [73.7, 798.0], [73.8, 798.0], [73.9, 798.0], [74.0, 799.0], [74.1, 801.0], [74.2, 801.0], [74.3, 802.0], [74.4, 802.0], [74.5, 809.0], [74.6, 810.0], [74.7, 811.0], [74.8, 814.0], [74.9, 814.0], [75.0, 815.0], [75.1, 815.0], [75.2, 820.0], [75.3, 822.0], [75.4, 823.0], [75.5, 825.0], [75.6, 827.0], [75.7, 827.0], [75.8, 827.0], [75.9, 827.0], [76.0, 828.0], [76.1, 831.0], [76.2, 831.0], [76.3, 831.0], [76.4, 832.0], [76.5, 833.0], [76.6, 833.0], [76.7, 834.0], [76.8, 834.0], [76.9, 837.0], [77.0, 837.0], [77.1, 838.0], [77.2, 838.0], [77.3, 839.0], [77.4, 839.0], [77.5, 840.0], [77.6, 842.0], [77.7, 843.0], [77.8, 843.0], [77.9, 849.0], [78.0, 849.0], [78.1, 850.0], [78.2, 851.0], [78.3, 851.0], [78.4, 853.0], [78.5, 853.0], [78.6, 854.0], [78.7, 856.0], [78.8, 857.0], [78.9, 861.0], [79.0, 862.0], [79.1, 862.0], [79.2, 863.0], [79.3, 864.0], [79.4, 866.0], [79.5, 868.0], [79.6, 868.0], [79.7, 869.0], [79.8, 870.0], [79.9, 872.0], [80.0, 873.0], [80.1, 873.0], [80.2, 878.0], [80.3, 878.0], [80.4, 880.0], [80.5, 881.0], [80.6, 881.0], [80.7, 882.0], [80.8, 886.0], [80.9, 888.0], [81.0, 889.0], [81.1, 889.0], [81.2, 890.0], [81.3, 892.0], [81.4, 892.0], [81.5, 893.0], [81.6, 894.0], [81.7, 900.0], [81.8, 900.0], [81.9, 901.0], [82.0, 906.0], [82.1, 907.0], [82.2, 910.0], [82.3, 910.0], [82.4, 910.0], [82.5, 911.0], [82.6, 913.0], [82.7, 915.0], [82.8, 918.0], [82.9, 919.0], [83.0, 921.0], [83.1, 922.0], [83.2, 922.0], [83.3, 922.0], [83.4, 923.0], [83.5, 924.0], [83.6, 924.0], [83.7, 924.0], [83.8, 927.0], [83.9, 929.0], [84.0, 931.0], [84.1, 934.0], [84.2, 935.0], [84.3, 935.0], [84.4, 935.0], [84.5, 935.0], [84.6, 939.0], [84.7, 940.0], [84.8, 940.0], [84.9, 940.0], [85.0, 944.0], [85.1, 946.0], [85.2, 948.0], [85.3, 948.0], [85.4, 949.0], [85.5, 950.0], [85.6, 951.0], [85.7, 951.0], [85.8, 953.0], [85.9, 957.0], [86.0, 959.0], [86.1, 961.0], [86.2, 961.0], [86.3, 965.0], [86.4, 967.0], [86.5, 967.0], [86.6, 968.0], [86.7, 971.0], [86.8, 973.0], [86.9, 976.0], [87.0, 976.0], [87.1, 978.0], [87.2, 980.0], [87.3, 980.0], [87.4, 981.0], [87.5, 981.0], [87.6, 982.0], [87.7, 985.0], [87.8, 985.0], [87.9, 986.0], [88.0, 990.0], [88.1, 996.0], [88.2, 997.0], [88.3, 998.0], [88.4, 998.0], [88.5, 998.0], [88.6, 1001.0], [88.7, 1003.0], [88.8, 1004.0], [88.9, 1008.0], [89.0, 1010.0], [89.1, 1018.0], [89.2, 1018.0], [89.3, 1019.0], [89.4, 1020.0], [89.5, 1024.0], [89.6, 1027.0], [89.7, 1031.0], [89.8, 1033.0], [89.9, 1035.0], [90.0, 1035.0], [90.1, 1036.0], [90.2, 1036.0], [90.3, 1037.0], [90.4, 1038.0], [90.5, 1039.0], [90.6, 1041.0], [90.7, 1041.0], [90.8, 1044.0], [90.9, 1045.0], [91.0, 1045.0], [91.1, 1046.0], [91.2, 1050.0], [91.3, 1050.0], [91.4, 1051.0], [91.5, 1051.0], [91.6, 1053.0], [91.7, 1067.0], [91.8, 1075.0], [91.9, 1075.0], [92.0, 1081.0], [92.1, 1088.0], [92.2, 1089.0], [92.3, 1092.0], [92.4, 1092.0], [92.5, 1094.0], [92.6, 1096.0], [92.7, 1098.0], [92.8, 1102.0], [92.9, 1106.0], [93.0, 1108.0], [93.1, 1108.0], [93.2, 1110.0], [93.3, 1112.0], [93.4, 1113.0], [93.5, 1122.0], [93.6, 1126.0], [93.7, 1126.0], [93.8, 1132.0], [93.9, 1135.0], [94.0, 1139.0], [94.1, 1140.0], [94.2, 1140.0], [94.3, 1145.0], [94.4, 1146.0], [94.5, 1152.0], [94.6, 1153.0], [94.7, 1160.0], [94.8, 1165.0], [94.9, 1167.0], [95.0, 1180.0], [95.1, 1184.0], [95.2, 1186.0], [95.3, 1190.0], [95.4, 1192.0], [95.5, 1195.0], [95.6, 1203.0], [95.7, 1205.0], [95.8, 1216.0], [95.9, 1221.0], [96.0, 1222.0], [96.1, 1239.0], [96.2, 1239.0], [96.3, 1248.0], [96.4, 1259.0], [96.5, 1282.0], [96.6, 1291.0], [96.7, 1303.0], [96.8, 1325.0], [96.9, 1327.0], [97.0, 1341.0], [97.1, 1363.0], [97.2, 1366.0], [97.3, 1367.0], [97.4, 1373.0], [97.5, 1378.0], [97.6, 1384.0], [97.7, 1387.0], [97.8, 1391.0], [97.9, 1392.0], [98.0, 1409.0], [98.1, 1411.0], [98.2, 1417.0], [98.3, 1425.0], [98.4, 1431.0], [98.5, 1432.0], [98.6, 1463.0], [98.7, 1464.0], [98.8, 1474.0], [98.9, 1476.0], [99.0, 1511.0], [99.1, 1534.0], [99.2, 1558.0], [99.3, 1572.0], [99.4, 1669.0], [99.5, 1752.0], [99.6, 1812.0], [99.7, 1863.0], [99.8, 1914.0], [99.9, 2188.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 280.0, "series": [{"data": [[0.0, 280.0], [2100.0, 1.0], [600.0, 78.0], [700.0, 95.0], [200.0, 33.0], [800.0, 77.0], [900.0, 69.0], [1000.0, 42.0], [1100.0, 28.0], [300.0, 29.0], [1200.0, 11.0], [1300.0, 13.0], [1400.0, 10.0], [1500.0, 4.0], [100.0, 161.0], [1600.0, 1.0], [400.0, 24.0], [1700.0, 1.0], [1800.0, 2.0], [1900.0, 1.0], [500.0, 40.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 10.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 528.0, "series": [{"data": [[1.0, 462.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 528.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 10.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 46.77499999999999, "minX": 1.54961916E12, "maxY": 46.77499999999999, "series": [{"data": [[1.54961916E12, 46.77499999999999]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961916E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 89.1206896551724, "minX": 1.0, "maxY": 1511.0, "series": [{"data": [[2.0, 450.0], [4.0, 303.0], [5.0, 128.4], [6.0, 104.81818181818183], [7.0, 99.18750000000001], [8.0, 89.1206896551724], [9.0, 89.78030303030305], [10.0, 106.45833333333333], [11.0, 112.45283018867923], [12.0, 119.83333333333334], [13.0, 150.24], [14.0, 186.5], [15.0, 228.0], [16.0, 352.5], [17.0, 208.28571428571428], [18.0, 218.375], [19.0, 251.5], [20.0, 265.75], [21.0, 274.3333333333333], [22.0, 295.5], [23.0, 375.2], [24.0, 283.6666666666667], [25.0, 301.25], [26.0, 312.3333333333333], [27.0, 392.5], [28.0, 438.5], [29.0, 380.25], [30.0, 331.75], [31.0, 309.66666666666663], [33.0, 417.0], [32.0, 613.0], [35.0, 682.0], [34.0, 514.0], [37.0, 607.0], [36.0, 463.0], [39.0, 530.0], [38.0, 491.0], [41.0, 491.0], [40.0, 543.0], [43.0, 570.0], [42.0, 688.0], [45.0, 616.0], [44.0, 439.0], [47.0, 395.0], [46.0, 632.0], [49.0, 698.5], [51.0, 494.0], [50.0, 333.0], [53.0, 477.0], [52.0, 542.0], [55.0, 635.2], [54.0, 598.0], [57.0, 573.0], [56.0, 550.75], [59.0, 612.0], [58.0, 633.0], [61.0, 538.6666666666666], [60.0, 873.0], [63.0, 666.6153846153846], [62.0, 610.5555555555555], [67.0, 653.1111111111112], [66.0, 625.4285714285714], [65.0, 704.3333333333334], [64.0, 591.0], [68.0, 722.75], [71.0, 762.1250000000001], [70.0, 670.7777777777778], [69.0, 724.9166666666666], [72.0, 706.3333333333334], [75.0, 749.0], [74.0, 702.6], [73.0, 746.5714285714286], [79.0, 820.1818181818181], [78.0, 843.5], [77.0, 769.1764705882352], [76.0, 881.3333333333334], [83.0, 952.0], [82.0, 911.0], [81.0, 833.0], [80.0, 821.4], [87.0, 883.1666666666667], [86.0, 1003.0000000000001], [85.0, 928.0], [84.0, 901.0], [91.0, 918.1538461538462], [90.0, 908.0], [89.0, 878.9047619047618], [88.0, 843.2], [95.0, 1004.9999999999999], [94.0, 1058.4444444444443], [93.0, 979.8], [92.0, 895.5714285714286], [96.0, 1103.8333333333333], [99.0, 1216.8333333333333], [98.0, 1105.857142857143], [97.0, 956.3636363636364], [100.0, 968.9], [103.0, 842.4444444444446], [102.0, 1103.4444444444443], [101.0, 1203.75], [107.0, 1295.5], [106.0, 1302.5], [105.0, 1221.75], [104.0, 1007.6666666666666], [111.0, 1511.0], [110.0, 1142.0], [109.0, 1216.0], [108.0, 853.0], [115.0, 1162.6666666666667], [114.0, 1222.0], [113.0, 824.0], [112.0, 1087.5], [119.0, 749.0], [118.0, 968.6666666666666], [117.0, 1165.0], [116.0, 1035.6666666666667], [123.0, 1084.0], [122.0, 1189.5], [121.0, 1125.5], [120.0, 1073.3333333333333], [124.0, 973.3333333333333], [125.0, 1013.5], [127.0, 1115.5], [126.0, 1186.0], [1.0, 301.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[46.77499999999999, 486.9699999999997]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 127.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6283.333333333333, "minX": 1.54961916E12, "maxY": 7015.65, "series": [{"data": [[1.54961916E12, 7015.65]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961916E12, 6283.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961916E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 486.9699999999997, "minX": 1.54961916E12, "maxY": 486.9699999999997, "series": [{"data": [[1.54961916E12, 486.9699999999997]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961916E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 486.95800000000025, "minX": 1.54961916E12, "maxY": 486.95800000000025, "series": [{"data": [[1.54961916E12, 486.95800000000025]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961916E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 6.522999999999996, "minX": 1.54961916E12, "maxY": 6.522999999999996, "series": [{"data": [[1.54961916E12, 6.522999999999996]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961916E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 67.0, "minX": 1.54961916E12, "maxY": 2188.0, "series": [{"data": [[1.54961916E12, 2188.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961916E12, 67.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961916E12, 1035.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961916E12, 1510.6500000000003]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961916E12, 1179.349999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961916E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 388.0, "minX": 16.0, "maxY": 388.0, "series": [{"data": [[16.0, 388.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 388.0, "minX": 16.0, "maxY": 388.0, "series": [{"data": [[16.0, 388.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
