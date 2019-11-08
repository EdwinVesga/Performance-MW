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
        data: {"result": {"minY": 69.0, "minX": 0.0, "maxY": 2240.0, "series": [{"data": [[0.0, 69.0], [0.1, 70.0], [0.2, 71.0], [0.3, 71.0], [0.4, 72.0], [0.5, 72.0], [0.6, 72.0], [0.7, 72.0], [0.8, 73.0], [0.9, 73.0], [1.0, 73.0], [1.1, 73.0], [1.2, 73.0], [1.3, 74.0], [1.4, 74.0], [1.5, 74.0], [1.6, 74.0], [1.7, 74.0], [1.8, 74.0], [1.9, 74.0], [2.0, 74.0], [2.1, 74.0], [2.2, 74.0], [2.3, 75.0], [2.4, 75.0], [2.5, 75.0], [2.6, 75.0], [2.7, 75.0], [2.8, 75.0], [2.9, 75.0], [3.0, 76.0], [3.1, 76.0], [3.2, 76.0], [3.3, 76.0], [3.4, 77.0], [3.5, 77.0], [3.6, 77.0], [3.7, 77.0], [3.8, 77.0], [3.9, 77.0], [4.0, 77.0], [4.1, 77.0], [4.2, 77.0], [4.3, 78.0], [4.4, 78.0], [4.5, 78.0], [4.6, 78.0], [4.7, 78.0], [4.8, 78.0], [4.9, 78.0], [5.0, 78.0], [5.1, 79.0], [5.2, 79.0], [5.3, 79.0], [5.4, 79.0], [5.5, 79.0], [5.6, 79.0], [5.7, 79.0], [5.8, 79.0], [5.9, 80.0], [6.0, 80.0], [6.1, 80.0], [6.2, 80.0], [6.3, 80.0], [6.4, 80.0], [6.5, 80.0], [6.6, 81.0], [6.7, 81.0], [6.8, 81.0], [6.9, 81.0], [7.0, 82.0], [7.1, 82.0], [7.2, 82.0], [7.3, 82.0], [7.4, 82.0], [7.5, 82.0], [7.6, 82.0], [7.7, 82.0], [7.8, 82.0], [7.9, 83.0], [8.0, 83.0], [8.1, 83.0], [8.2, 83.0], [8.3, 83.0], [8.4, 83.0], [8.5, 83.0], [8.6, 83.0], [8.7, 83.0], [8.8, 83.0], [8.9, 83.0], [9.0, 83.0], [9.1, 84.0], [9.2, 84.0], [9.3, 84.0], [9.4, 84.0], [9.5, 84.0], [9.6, 84.0], [9.7, 84.0], [9.8, 85.0], [9.9, 85.0], [10.0, 85.0], [10.1, 85.0], [10.2, 85.0], [10.3, 85.0], [10.4, 85.0], [10.5, 85.0], [10.6, 85.0], [10.7, 86.0], [10.8, 86.0], [10.9, 86.0], [11.0, 86.0], [11.1, 86.0], [11.2, 86.0], [11.3, 86.0], [11.4, 87.0], [11.5, 87.0], [11.6, 87.0], [11.7, 87.0], [11.8, 87.0], [11.9, 87.0], [12.0, 87.0], [12.1, 87.0], [12.2, 87.0], [12.3, 87.0], [12.4, 87.0], [12.5, 87.0], [12.6, 87.0], [12.7, 87.0], [12.8, 87.0], [12.9, 87.0], [13.0, 88.0], [13.1, 88.0], [13.2, 88.0], [13.3, 88.0], [13.4, 88.0], [13.5, 88.0], [13.6, 88.0], [13.7, 88.0], [13.8, 88.0], [13.9, 88.0], [14.0, 88.0], [14.1, 89.0], [14.2, 89.0], [14.3, 89.0], [14.4, 89.0], [14.5, 89.0], [14.6, 89.0], [14.7, 89.0], [14.8, 89.0], [14.9, 89.0], [15.0, 89.0], [15.1, 89.0], [15.2, 89.0], [15.3, 89.0], [15.4, 89.0], [15.5, 90.0], [15.6, 90.0], [15.7, 90.0], [15.8, 90.0], [15.9, 90.0], [16.0, 90.0], [16.1, 90.0], [16.2, 90.0], [16.3, 90.0], [16.4, 90.0], [16.5, 91.0], [16.6, 91.0], [16.7, 91.0], [16.8, 91.0], [16.9, 91.0], [17.0, 91.0], [17.1, 91.0], [17.2, 91.0], [17.3, 91.0], [17.4, 91.0], [17.5, 91.0], [17.6, 91.0], [17.7, 91.0], [17.8, 91.0], [17.9, 91.0], [18.0, 91.0], [18.1, 92.0], [18.2, 92.0], [18.3, 92.0], [18.4, 92.0], [18.5, 92.0], [18.6, 92.0], [18.7, 92.0], [18.8, 92.0], [18.9, 92.0], [19.0, 93.0], [19.1, 93.0], [19.2, 93.0], [19.3, 93.0], [19.4, 93.0], [19.5, 93.0], [19.6, 93.0], [19.7, 93.0], [19.8, 93.0], [19.9, 93.0], [20.0, 93.0], [20.1, 94.0], [20.2, 94.0], [20.3, 94.0], [20.4, 94.0], [20.5, 94.0], [20.6, 94.0], [20.7, 94.0], [20.8, 94.0], [20.9, 94.0], [21.0, 94.0], [21.1, 94.0], [21.2, 94.0], [21.3, 94.0], [21.4, 94.0], [21.5, 95.0], [21.6, 95.0], [21.7, 95.0], [21.8, 95.0], [21.9, 95.0], [22.0, 95.0], [22.1, 95.0], [22.2, 95.0], [22.3, 95.0], [22.4, 95.0], [22.5, 95.0], [22.6, 95.0], [22.7, 95.0], [22.8, 95.0], [22.9, 95.0], [23.0, 95.0], [23.1, 95.0], [23.2, 95.0], [23.3, 95.0], [23.4, 95.0], [23.5, 95.0], [23.6, 96.0], [23.7, 96.0], [23.8, 96.0], [23.9, 96.0], [24.0, 96.0], [24.1, 96.0], [24.2, 96.0], [24.3, 96.0], [24.4, 96.0], [24.5, 96.0], [24.6, 96.0], [24.7, 96.0], [24.8, 97.0], [24.9, 97.0], [25.0, 97.0], [25.1, 97.0], [25.2, 97.0], [25.3, 97.0], [25.4, 97.0], [25.5, 97.0], [25.6, 97.0], [25.7, 97.0], [25.8, 97.0], [25.9, 97.0], [26.0, 97.0], [26.1, 97.0], [26.2, 97.0], [26.3, 97.0], [26.4, 98.0], [26.5, 98.0], [26.6, 98.0], [26.7, 98.0], [26.8, 98.0], [26.9, 98.0], [27.0, 98.0], [27.1, 98.0], [27.2, 99.0], [27.3, 99.0], [27.4, 99.0], [27.5, 99.0], [27.6, 99.0], [27.7, 99.0], [27.8, 99.0], [27.9, 99.0], [28.0, 99.0], [28.1, 99.0], [28.2, 99.0], [28.3, 99.0], [28.4, 99.0], [28.5, 100.0], [28.6, 100.0], [28.7, 100.0], [28.8, 100.0], [28.9, 100.0], [29.0, 100.0], [29.1, 100.0], [29.2, 100.0], [29.3, 100.0], [29.4, 100.0], [29.5, 101.0], [29.6, 101.0], [29.7, 101.0], [29.8, 101.0], [29.9, 101.0], [30.0, 101.0], [30.1, 101.0], [30.2, 101.0], [30.3, 101.0], [30.4, 101.0], [30.5, 101.0], [30.6, 101.0], [30.7, 101.0], [30.8, 101.0], [30.9, 101.0], [31.0, 102.0], [31.1, 102.0], [31.2, 102.0], [31.3, 102.0], [31.4, 102.0], [31.5, 102.0], [31.6, 102.0], [31.7, 102.0], [31.8, 103.0], [31.9, 103.0], [32.0, 103.0], [32.1, 103.0], [32.2, 104.0], [32.3, 104.0], [32.4, 104.0], [32.5, 104.0], [32.6, 104.0], [32.7, 104.0], [32.8, 104.0], [32.9, 104.0], [33.0, 104.0], [33.1, 105.0], [33.2, 105.0], [33.3, 105.0], [33.4, 105.0], [33.5, 105.0], [33.6, 105.0], [33.7, 105.0], [33.8, 105.0], [33.9, 105.0], [34.0, 105.0], [34.1, 105.0], [34.2, 105.0], [34.3, 105.0], [34.4, 106.0], [34.5, 106.0], [34.6, 106.0], [34.7, 106.0], [34.8, 106.0], [34.9, 106.0], [35.0, 106.0], [35.1, 106.0], [35.2, 107.0], [35.3, 107.0], [35.4, 107.0], [35.5, 107.0], [35.6, 107.0], [35.7, 107.0], [35.8, 107.0], [35.9, 107.0], [36.0, 108.0], [36.1, 108.0], [36.2, 108.0], [36.3, 108.0], [36.4, 108.0], [36.5, 108.0], [36.6, 108.0], [36.7, 108.0], [36.8, 108.0], [36.9, 110.0], [37.0, 110.0], [37.1, 110.0], [37.2, 110.0], [37.3, 110.0], [37.4, 110.0], [37.5, 111.0], [37.6, 111.0], [37.7, 111.0], [37.8, 111.0], [37.9, 111.0], [38.0, 112.0], [38.1, 112.0], [38.2, 112.0], [38.3, 112.0], [38.4, 112.0], [38.5, 112.0], [38.6, 114.0], [38.7, 116.0], [38.8, 116.0], [38.9, 117.0], [39.0, 117.0], [39.1, 117.0], [39.2, 118.0], [39.3, 118.0], [39.4, 118.0], [39.5, 119.0], [39.6, 121.0], [39.7, 122.0], [39.8, 122.0], [39.9, 124.0], [40.0, 124.0], [40.1, 146.0], [40.2, 148.0], [40.3, 156.0], [40.4, 162.0], [40.5, 172.0], [40.6, 175.0], [40.7, 182.0], [40.8, 188.0], [40.9, 189.0], [41.0, 189.0], [41.1, 192.0], [41.2, 195.0], [41.3, 196.0], [41.4, 199.0], [41.5, 203.0], [41.6, 212.0], [41.7, 213.0], [41.8, 218.0], [41.9, 224.0], [42.0, 228.0], [42.1, 229.0], [42.2, 230.0], [42.3, 233.0], [42.4, 233.0], [42.5, 233.0], [42.6, 235.0], [42.7, 236.0], [42.8, 237.0], [42.9, 238.0], [43.0, 241.0], [43.1, 242.0], [43.2, 247.0], [43.3, 254.0], [43.4, 259.0], [43.5, 263.0], [43.6, 266.0], [43.7, 277.0], [43.8, 282.0], [43.9, 283.0], [44.0, 288.0], [44.1, 291.0], [44.2, 293.0], [44.3, 304.0], [44.4, 304.0], [44.5, 304.0], [44.6, 305.0], [44.7, 308.0], [44.8, 311.0], [44.9, 311.0], [45.0, 312.0], [45.1, 313.0], [45.2, 313.0], [45.3, 316.0], [45.4, 320.0], [45.5, 321.0], [45.6, 324.0], [45.7, 326.0], [45.8, 328.0], [45.9, 335.0], [46.0, 337.0], [46.1, 342.0], [46.2, 345.0], [46.3, 370.0], [46.4, 374.0], [46.5, 375.0], [46.6, 376.0], [46.7, 394.0], [46.8, 401.0], [46.9, 401.0], [47.0, 411.0], [47.1, 427.0], [47.2, 429.0], [47.3, 435.0], [47.4, 436.0], [47.5, 438.0], [47.6, 443.0], [47.7, 454.0], [47.8, 455.0], [47.9, 455.0], [48.0, 456.0], [48.1, 458.0], [48.2, 459.0], [48.3, 460.0], [48.4, 466.0], [48.5, 471.0], [48.6, 474.0], [48.7, 475.0], [48.8, 477.0], [48.9, 478.0], [49.0, 480.0], [49.1, 480.0], [49.2, 481.0], [49.3, 481.0], [49.4, 485.0], [49.5, 487.0], [49.6, 490.0], [49.7, 490.0], [49.8, 492.0], [49.9, 492.0], [50.0, 498.0], [50.1, 500.0], [50.2, 502.0], [50.3, 504.0], [50.4, 507.0], [50.5, 508.0], [50.6, 509.0], [50.7, 509.0], [50.8, 510.0], [50.9, 511.0], [51.0, 515.0], [51.1, 518.0], [51.2, 519.0], [51.3, 523.0], [51.4, 524.0], [51.5, 529.0], [51.6, 530.0], [51.7, 532.0], [51.8, 532.0], [51.9, 533.0], [52.0, 534.0], [52.1, 535.0], [52.2, 545.0], [52.3, 547.0], [52.4, 548.0], [52.5, 551.0], [52.6, 554.0], [52.7, 555.0], [52.8, 555.0], [52.9, 556.0], [53.0, 560.0], [53.1, 560.0], [53.2, 561.0], [53.3, 562.0], [53.4, 563.0], [53.5, 564.0], [53.6, 565.0], [53.7, 566.0], [53.8, 566.0], [53.9, 568.0], [54.0, 568.0], [54.1, 569.0], [54.2, 570.0], [54.3, 571.0], [54.4, 572.0], [54.5, 572.0], [54.6, 573.0], [54.7, 575.0], [54.8, 575.0], [54.9, 576.0], [55.0, 576.0], [55.1, 577.0], [55.2, 580.0], [55.3, 581.0], [55.4, 583.0], [55.5, 584.0], [55.6, 586.0], [55.7, 589.0], [55.8, 590.0], [55.9, 591.0], [56.0, 593.0], [56.1, 596.0], [56.2, 599.0], [56.3, 601.0], [56.4, 601.0], [56.5, 602.0], [56.6, 605.0], [56.7, 608.0], [56.8, 611.0], [56.9, 612.0], [57.0, 616.0], [57.1, 618.0], [57.2, 619.0], [57.3, 621.0], [57.4, 621.0], [57.5, 623.0], [57.6, 626.0], [57.7, 627.0], [57.8, 628.0], [57.9, 630.0], [58.0, 631.0], [58.1, 632.0], [58.2, 633.0], [58.3, 633.0], [58.4, 633.0], [58.5, 633.0], [58.6, 635.0], [58.7, 636.0], [58.8, 637.0], [58.9, 637.0], [59.0, 637.0], [59.1, 638.0], [59.2, 638.0], [59.3, 641.0], [59.4, 643.0], [59.5, 645.0], [59.6, 646.0], [59.7, 646.0], [59.8, 646.0], [59.9, 649.0], [60.0, 650.0], [60.1, 650.0], [60.2, 650.0], [60.3, 650.0], [60.4, 651.0], [60.5, 653.0], [60.6, 654.0], [60.7, 656.0], [60.8, 656.0], [60.9, 660.0], [61.0, 661.0], [61.1, 664.0], [61.2, 666.0], [61.3, 666.0], [61.4, 667.0], [61.5, 668.0], [61.6, 669.0], [61.7, 671.0], [61.8, 673.0], [61.9, 677.0], [62.0, 677.0], [62.1, 678.0], [62.2, 683.0], [62.3, 684.0], [62.4, 685.0], [62.5, 685.0], [62.6, 685.0], [62.7, 685.0], [62.8, 688.0], [62.9, 688.0], [63.0, 693.0], [63.1, 694.0], [63.2, 695.0], [63.3, 695.0], [63.4, 696.0], [63.5, 700.0], [63.6, 700.0], [63.7, 702.0], [63.8, 702.0], [63.9, 702.0], [64.0, 703.0], [64.1, 706.0], [64.2, 707.0], [64.3, 708.0], [64.4, 708.0], [64.5, 709.0], [64.6, 710.0], [64.7, 711.0], [64.8, 714.0], [64.9, 716.0], [65.0, 718.0], [65.1, 719.0], [65.2, 719.0], [65.3, 721.0], [65.4, 722.0], [65.5, 723.0], [65.6, 723.0], [65.7, 723.0], [65.8, 725.0], [65.9, 726.0], [66.0, 726.0], [66.1, 726.0], [66.2, 727.0], [66.3, 728.0], [66.4, 729.0], [66.5, 731.0], [66.6, 733.0], [66.7, 733.0], [66.8, 733.0], [66.9, 735.0], [67.0, 736.0], [67.1, 737.0], [67.2, 738.0], [67.3, 739.0], [67.4, 739.0], [67.5, 740.0], [67.6, 740.0], [67.7, 742.0], [67.8, 743.0], [67.9, 745.0], [68.0, 746.0], [68.1, 748.0], [68.2, 748.0], [68.3, 750.0], [68.4, 751.0], [68.5, 751.0], [68.6, 751.0], [68.7, 752.0], [68.8, 752.0], [68.9, 755.0], [69.0, 755.0], [69.1, 757.0], [69.2, 759.0], [69.3, 759.0], [69.4, 759.0], [69.5, 760.0], [69.6, 761.0], [69.7, 762.0], [69.8, 763.0], [69.9, 765.0], [70.0, 767.0], [70.1, 768.0], [70.2, 768.0], [70.3, 768.0], [70.4, 771.0], [70.5, 773.0], [70.6, 773.0], [70.7, 774.0], [70.8, 775.0], [70.9, 777.0], [71.0, 782.0], [71.1, 782.0], [71.2, 782.0], [71.3, 783.0], [71.4, 784.0], [71.5, 785.0], [71.6, 786.0], [71.7, 788.0], [71.8, 788.0], [71.9, 788.0], [72.0, 788.0], [72.1, 791.0], [72.2, 791.0], [72.3, 792.0], [72.4, 792.0], [72.5, 792.0], [72.6, 792.0], [72.7, 793.0], [72.8, 796.0], [72.9, 797.0], [73.0, 798.0], [73.1, 798.0], [73.2, 799.0], [73.3, 800.0], [73.4, 800.0], [73.5, 801.0], [73.6, 801.0], [73.7, 801.0], [73.8, 801.0], [73.9, 801.0], [74.0, 802.0], [74.1, 803.0], [74.2, 808.0], [74.3, 809.0], [74.4, 809.0], [74.5, 810.0], [74.6, 813.0], [74.7, 813.0], [74.8, 813.0], [74.9, 816.0], [75.0, 817.0], [75.1, 818.0], [75.2, 820.0], [75.3, 820.0], [75.4, 822.0], [75.5, 822.0], [75.6, 822.0], [75.7, 823.0], [75.8, 823.0], [75.9, 823.0], [76.0, 823.0], [76.1, 823.0], [76.2, 824.0], [76.3, 825.0], [76.4, 827.0], [76.5, 827.0], [76.6, 827.0], [76.7, 830.0], [76.8, 830.0], [76.9, 831.0], [77.0, 831.0], [77.1, 831.0], [77.2, 832.0], [77.3, 835.0], [77.4, 836.0], [77.5, 837.0], [77.6, 839.0], [77.7, 841.0], [77.8, 842.0], [77.9, 842.0], [78.0, 843.0], [78.1, 845.0], [78.2, 845.0], [78.3, 845.0], [78.4, 847.0], [78.5, 847.0], [78.6, 849.0], [78.7, 850.0], [78.8, 851.0], [78.9, 852.0], [79.0, 852.0], [79.1, 852.0], [79.2, 853.0], [79.3, 853.0], [79.4, 854.0], [79.5, 859.0], [79.6, 860.0], [79.7, 861.0], [79.8, 863.0], [79.9, 865.0], [80.0, 867.0], [80.1, 873.0], [80.2, 873.0], [80.3, 874.0], [80.4, 875.0], [80.5, 875.0], [80.6, 877.0], [80.7, 878.0], [80.8, 879.0], [80.9, 882.0], [81.0, 883.0], [81.1, 885.0], [81.2, 890.0], [81.3, 892.0], [81.4, 894.0], [81.5, 898.0], [81.6, 898.0], [81.7, 901.0], [81.8, 903.0], [81.9, 903.0], [82.0, 904.0], [82.1, 905.0], [82.2, 907.0], [82.3, 908.0], [82.4, 909.0], [82.5, 910.0], [82.6, 911.0], [82.7, 911.0], [82.8, 911.0], [82.9, 913.0], [83.0, 916.0], [83.1, 917.0], [83.2, 918.0], [83.3, 919.0], [83.4, 920.0], [83.5, 922.0], [83.6, 924.0], [83.7, 924.0], [83.8, 925.0], [83.9, 929.0], [84.0, 929.0], [84.1, 931.0], [84.2, 931.0], [84.3, 931.0], [84.4, 931.0], [84.5, 933.0], [84.6, 934.0], [84.7, 934.0], [84.8, 935.0], [84.9, 935.0], [85.0, 936.0], [85.1, 940.0], [85.2, 941.0], [85.3, 942.0], [85.4, 945.0], [85.5, 945.0], [85.6, 946.0], [85.7, 948.0], [85.8, 948.0], [85.9, 949.0], [86.0, 950.0], [86.1, 951.0], [86.2, 952.0], [86.3, 957.0], [86.4, 963.0], [86.5, 963.0], [86.6, 964.0], [86.7, 966.0], [86.8, 967.0], [86.9, 971.0], [87.0, 971.0], [87.1, 971.0], [87.2, 971.0], [87.3, 972.0], [87.4, 975.0], [87.5, 977.0], [87.6, 983.0], [87.7, 984.0], [87.8, 984.0], [87.9, 987.0], [88.0, 990.0], [88.1, 992.0], [88.2, 994.0], [88.3, 996.0], [88.4, 998.0], [88.5, 998.0], [88.6, 1004.0], [88.7, 1006.0], [88.8, 1011.0], [88.9, 1016.0], [89.0, 1016.0], [89.1, 1017.0], [89.2, 1019.0], [89.3, 1021.0], [89.4, 1026.0], [89.5, 1029.0], [89.6, 1029.0], [89.7, 1030.0], [89.8, 1038.0], [89.9, 1038.0], [90.0, 1038.0], [90.1, 1039.0], [90.2, 1040.0], [90.3, 1040.0], [90.4, 1042.0], [90.5, 1044.0], [90.6, 1047.0], [90.7, 1051.0], [90.8, 1057.0], [90.9, 1059.0], [91.0, 1060.0], [91.1, 1061.0], [91.2, 1063.0], [91.3, 1063.0], [91.4, 1066.0], [91.5, 1068.0], [91.6, 1070.0], [91.7, 1072.0], [91.8, 1075.0], [91.9, 1075.0], [92.0, 1077.0], [92.1, 1088.0], [92.2, 1092.0], [92.3, 1095.0], [92.4, 1103.0], [92.5, 1105.0], [92.6, 1106.0], [92.7, 1115.0], [92.8, 1118.0], [92.9, 1120.0], [93.0, 1120.0], [93.1, 1120.0], [93.2, 1123.0], [93.3, 1125.0], [93.4, 1125.0], [93.5, 1131.0], [93.6, 1132.0], [93.7, 1133.0], [93.8, 1134.0], [93.9, 1134.0], [94.0, 1141.0], [94.1, 1153.0], [94.2, 1154.0], [94.3, 1156.0], [94.4, 1157.0], [94.5, 1158.0], [94.6, 1160.0], [94.7, 1165.0], [94.8, 1166.0], [94.9, 1166.0], [95.0, 1168.0], [95.1, 1169.0], [95.2, 1170.0], [95.3, 1173.0], [95.4, 1180.0], [95.5, 1187.0], [95.6, 1188.0], [95.7, 1192.0], [95.8, 1205.0], [95.9, 1210.0], [96.0, 1215.0], [96.1, 1216.0], [96.2, 1219.0], [96.3, 1220.0], [96.4, 1231.0], [96.5, 1236.0], [96.6, 1239.0], [96.7, 1243.0], [96.8, 1246.0], [96.9, 1250.0], [97.0, 1251.0], [97.1, 1257.0], [97.2, 1266.0], [97.3, 1267.0], [97.4, 1275.0], [97.5, 1279.0], [97.6, 1282.0], [97.7, 1285.0], [97.8, 1286.0], [97.9, 1291.0], [98.0, 1303.0], [98.1, 1334.0], [98.2, 1337.0], [98.3, 1338.0], [98.4, 1353.0], [98.5, 1364.0], [98.6, 1378.0], [98.7, 1383.0], [98.8, 1430.0], [98.9, 1479.0], [99.0, 1492.0], [99.1, 1493.0], [99.2, 1499.0], [99.3, 1537.0], [99.4, 1579.0], [99.5, 1753.0], [99.6, 1786.0], [99.7, 1986.0], [99.8, 2000.0], [99.9, 2240.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 284.0, "series": [{"data": [[0.0, 284.0], [2200.0, 1.0], [600.0, 72.0], [700.0, 98.0], [200.0, 28.0], [800.0, 85.0], [900.0, 69.0], [1000.0, 38.0], [1100.0, 34.0], [300.0, 25.0], [1200.0, 22.0], [1300.0, 8.0], [1400.0, 5.0], [1500.0, 2.0], [100.0, 130.0], [400.0, 33.0], [1700.0, 2.0], [1900.0, 1.0], [500.0, 62.0], [2000.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 7.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 501.0, "series": [{"data": [[1.0, 492.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 501.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 7.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 29.599999999999998, "minX": 1.5496188E12, "maxY": 48.34111675126903, "series": [{"data": [[1.5496188E12, 29.599999999999998], [1.54961886E12, 48.34111675126903]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 86.13043478260869, "minX": 1.0, "maxY": 1286.0, "series": [{"data": [[2.0, 313.0], [3.0, 283.0], [4.0, 376.0], [5.0, 150.66666666666669], [6.0, 88.47368421052632], [7.0, 86.13043478260869], [8.0, 94.41379310344827], [9.0, 97.88732394366197], [10.0, 99.56], [11.0, 112.38596491228068], [12.0, 140.1818181818182], [13.0, 273.3333333333333], [14.0, 259.0], [15.0, 277.6666666666667], [16.0, 290.0], [17.0, 332.5], [18.0, 289.5], [19.0, 295.0], [20.0, 328.5], [21.0, 519.0], [22.0, 338.0], [23.0, 361.6666666666667], [24.0, 268.44444444444446], [25.0, 293.57142857142856], [26.0, 317.0], [27.0, 315.6666666666667], [28.0, 361.0], [29.0, 371.0], [30.0, 364.6666666666667], [31.0, 407.0], [33.0, 383.4], [32.0, 298.5], [35.0, 474.0], [34.0, 569.0], [37.0, 584.0], [36.0, 726.0], [39.0, 635.0], [38.0, 455.0], [41.0, 508.0], [40.0, 702.0], [43.0, 460.0], [42.0, 509.0], [45.0, 554.0], [44.0, 565.0], [47.0, 583.0], [46.0, 534.0], [49.0, 500.0], [48.0, 401.0], [51.0, 633.0], [50.0, 547.0], [53.0, 504.0], [52.0, 568.0], [55.0, 600.75], [54.0, 725.5], [57.0, 573.3333333333334], [56.0, 593.4], [59.0, 604.75], [58.0, 559.25], [61.0, 663.375], [60.0, 583.2857142857143], [63.0, 544.2], [62.0, 641.1], [67.0, 689.1666666666667], [66.0, 671.7647058823529], [65.0, 644.5294117647059], [64.0, 656.5], [68.0, 624.8181818181818], [71.0, 586.5], [70.0, 940.0], [69.0, 701.2], [75.0, 848.8181818181818], [74.0, 767.0], [73.0, 796.5714285714287], [72.0, 666.0], [77.0, 752.8333333333334], [79.0, 768.0], [78.0, 792.2222222222222], [76.0, 750.6500000000001], [81.0, 828.3000000000001], [83.0, 905.2142857142857], [82.0, 880.3125000000001], [80.0, 702.1428571428572], [87.0, 842.6], [86.0, 899.0], [84.0, 831.7857142857143], [85.0, 864.0999999999999], [91.0, 1146.2857142857142], [90.0, 835.25], [89.0, 1027.6666666666667], [88.0, 964.2], [95.0, 1001.0714285714287], [94.0, 1059.142857142857], [93.0, 970.3], [92.0, 856.9166666666666], [96.0, 983.6923076923077], [97.0, 921.7826086956521], [98.0, 922.3333333333334], [99.0, 1023.7692307692308], [103.0, 1223.25], [102.0, 1089.0], [101.0, 1044.0], [100.0, 1148.5555555555557], [105.0, 958.5714285714286], [107.0, 1073.6666666666667], [106.0, 1245.6], [104.0, 1161.0], [108.0, 832.2], [111.0, 1021.3333333333333], [110.0, 930.0], [109.0, 1209.5], [114.0, 1008.0000000000001], [113.0, 1057.0], [115.0, 1066.0], [112.0, 1192.0], [116.0, 1140.0], [117.0, 967.6], [118.0, 1286.0], [1.0, 375.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[48.060000000000045, 498.4009999999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 118.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 94.25, "minX": 1.5496188E12, "maxY": 6910.1, "series": [{"data": [[1.5496188E12, 105.3], [1.54961886E12, 6910.1]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5496188E12, 94.25], [1.54961886E12, 6189.083333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 284.6666666666667, "minX": 1.5496188E12, "maxY": 501.655837563452, "series": [{"data": [[1.5496188E12, 284.6666666666667], [1.54961886E12, 501.655837563452]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 284.6666666666667, "minX": 1.5496188E12, "maxY": 501.64974619289376, "series": [{"data": [[1.5496188E12, 284.6666666666667], [1.54961886E12, 501.64974619289376]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 3.616243654822332, "minX": 1.5496188E12, "maxY": 38.2, "series": [{"data": [[1.5496188E12, 38.2], [1.54961886E12, 3.616243654822332]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 69.0, "minX": 1.5496188E12, "maxY": 2240.0, "series": [{"data": [[1.5496188E12, 335.0], [1.54961886E12, 2240.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5496188E12, 228.0], [1.54961886E12, 69.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5496188E12, 330.8], [1.54961886E12, 1038.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5496188E12, 335.0], [1.54961886E12, 1491.8700000000001]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5496188E12, 335.0], [1.54961886E12, 1167.8999999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 304.0, "minX": 0.0, "maxY": 510.0, "series": [{"data": [[0.0, 304.0], [16.0, 510.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 304.0, "minX": 0.0, "maxY": 510.0, "series": [{"data": [[0.0, 304.0], [16.0, 510.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.6666666666666666, "minX": 1.5496188E12, "maxY": 16.0, "series": [{"data": [[1.5496188E12, 0.6666666666666666], [1.54961886E12, 16.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.25, "minX": 1.5496188E12, "maxY": 16.416666666666668, "series": [{"data": [[1.5496188E12, 0.25], [1.54961886E12, 16.416666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.25, "minX": 1.5496188E12, "maxY": 16.416666666666668, "series": [{"data": [[1.5496188E12, 0.25], [1.54961886E12, 16.416666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Transactions Per Second"}},
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
