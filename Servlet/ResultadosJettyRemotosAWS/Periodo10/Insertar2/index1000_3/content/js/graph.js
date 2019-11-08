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
        data: {"result": {"minY": 71.0, "minX": 0.0, "maxY": 1932.0, "series": [{"data": [[0.0, 71.0], [0.1, 72.0], [0.2, 73.0], [0.3, 73.0], [0.4, 74.0], [0.5, 74.0], [0.6, 74.0], [0.7, 75.0], [0.8, 75.0], [0.9, 75.0], [1.0, 75.0], [1.1, 75.0], [1.2, 75.0], [1.3, 76.0], [1.4, 76.0], [1.5, 76.0], [1.6, 76.0], [1.7, 76.0], [1.8, 76.0], [1.9, 76.0], [2.0, 76.0], [2.1, 77.0], [2.2, 77.0], [2.3, 77.0], [2.4, 77.0], [2.5, 77.0], [2.6, 77.0], [2.7, 77.0], [2.8, 78.0], [2.9, 78.0], [3.0, 78.0], [3.1, 78.0], [3.2, 78.0], [3.3, 78.0], [3.4, 79.0], [3.5, 79.0], [3.6, 79.0], [3.7, 79.0], [3.8, 79.0], [3.9, 79.0], [4.0, 79.0], [4.1, 80.0], [4.2, 80.0], [4.3, 80.0], [4.4, 80.0], [4.5, 80.0], [4.6, 80.0], [4.7, 80.0], [4.8, 80.0], [4.9, 81.0], [5.0, 81.0], [5.1, 81.0], [5.2, 81.0], [5.3, 81.0], [5.4, 81.0], [5.5, 82.0], [5.6, 82.0], [5.7, 82.0], [5.8, 82.0], [5.9, 82.0], [6.0, 82.0], [6.1, 82.0], [6.2, 82.0], [6.3, 82.0], [6.4, 83.0], [6.5, 83.0], [6.6, 83.0], [6.7, 83.0], [6.8, 83.0], [6.9, 83.0], [7.0, 83.0], [7.1, 83.0], [7.2, 83.0], [7.3, 84.0], [7.4, 84.0], [7.5, 84.0], [7.6, 84.0], [7.7, 84.0], [7.8, 84.0], [7.9, 85.0], [8.0, 85.0], [8.1, 85.0], [8.2, 85.0], [8.3, 85.0], [8.4, 85.0], [8.5, 85.0], [8.6, 85.0], [8.7, 85.0], [8.8, 86.0], [8.9, 86.0], [9.0, 86.0], [9.1, 86.0], [9.2, 86.0], [9.3, 86.0], [9.4, 87.0], [9.5, 87.0], [9.6, 87.0], [9.7, 87.0], [9.8, 87.0], [9.9, 87.0], [10.0, 87.0], [10.1, 87.0], [10.2, 87.0], [10.3, 87.0], [10.4, 87.0], [10.5, 87.0], [10.6, 87.0], [10.7, 87.0], [10.8, 87.0], [10.9, 88.0], [11.0, 88.0], [11.1, 88.0], [11.2, 88.0], [11.3, 88.0], [11.4, 88.0], [11.5, 88.0], [11.6, 88.0], [11.7, 89.0], [11.8, 89.0], [11.9, 89.0], [12.0, 89.0], [12.1, 89.0], [12.2, 89.0], [12.3, 89.0], [12.4, 89.0], [12.5, 90.0], [12.6, 90.0], [12.7, 90.0], [12.8, 90.0], [12.9, 90.0], [13.0, 90.0], [13.1, 90.0], [13.2, 91.0], [13.3, 91.0], [13.4, 91.0], [13.5, 91.0], [13.6, 91.0], [13.7, 91.0], [13.8, 92.0], [13.9, 92.0], [14.0, 93.0], [14.1, 93.0], [14.2, 93.0], [14.3, 93.0], [14.4, 93.0], [14.5, 93.0], [14.6, 93.0], [14.7, 93.0], [14.8, 94.0], [14.9, 94.0], [15.0, 95.0], [15.1, 95.0], [15.2, 95.0], [15.3, 95.0], [15.4, 96.0], [15.5, 96.0], [15.6, 96.0], [15.7, 96.0], [15.8, 96.0], [15.9, 96.0], [16.0, 96.0], [16.1, 97.0], [16.2, 97.0], [16.3, 97.0], [16.4, 97.0], [16.5, 97.0], [16.6, 98.0], [16.7, 98.0], [16.8, 99.0], [16.9, 99.0], [17.0, 99.0], [17.1, 100.0], [17.2, 100.0], [17.3, 101.0], [17.4, 101.0], [17.5, 101.0], [17.6, 102.0], [17.7, 102.0], [17.8, 102.0], [17.9, 102.0], [18.0, 103.0], [18.1, 104.0], [18.2, 104.0], [18.3, 105.0], [18.4, 107.0], [18.5, 107.0], [18.6, 109.0], [18.7, 111.0], [18.8, 111.0], [18.9, 113.0], [19.0, 118.0], [19.1, 142.0], [19.2, 142.0], [19.3, 147.0], [19.4, 155.0], [19.5, 158.0], [19.6, 158.0], [19.7, 163.0], [19.8, 164.0], [19.9, 169.0], [20.0, 174.0], [20.1, 176.0], [20.2, 176.0], [20.3, 183.0], [20.4, 184.0], [20.5, 186.0], [20.6, 187.0], [20.7, 188.0], [20.8, 190.0], [20.9, 195.0], [21.0, 210.0], [21.1, 211.0], [21.2, 212.0], [21.3, 214.0], [21.4, 215.0], [21.5, 222.0], [21.6, 222.0], [21.7, 222.0], [21.8, 223.0], [21.9, 223.0], [22.0, 223.0], [22.1, 224.0], [22.2, 227.0], [22.3, 229.0], [22.4, 232.0], [22.5, 235.0], [22.6, 235.0], [22.7, 238.0], [22.8, 238.0], [22.9, 238.0], [23.0, 238.0], [23.1, 239.0], [23.2, 239.0], [23.3, 239.0], [23.4, 240.0], [23.5, 241.0], [23.6, 241.0], [23.7, 245.0], [23.8, 246.0], [23.9, 250.0], [24.0, 250.0], [24.1, 253.0], [24.2, 253.0], [24.3, 254.0], [24.4, 254.0], [24.5, 256.0], [24.6, 256.0], [24.7, 258.0], [24.8, 258.0], [24.9, 259.0], [25.0, 259.0], [25.1, 260.0], [25.2, 262.0], [25.3, 262.0], [25.4, 266.0], [25.5, 266.0], [25.6, 266.0], [25.7, 267.0], [25.8, 267.0], [25.9, 268.0], [26.0, 269.0], [26.1, 270.0], [26.2, 271.0], [26.3, 271.0], [26.4, 273.0], [26.5, 277.0], [26.6, 279.0], [26.7, 283.0], [26.8, 283.0], [26.9, 284.0], [27.0, 285.0], [27.1, 285.0], [27.2, 286.0], [27.3, 287.0], [27.4, 288.0], [27.5, 288.0], [27.6, 289.0], [27.7, 291.0], [27.8, 291.0], [27.9, 291.0], [28.0, 292.0], [28.1, 292.0], [28.2, 292.0], [28.3, 294.0], [28.4, 296.0], [28.5, 297.0], [28.6, 298.0], [28.7, 298.0], [28.8, 300.0], [28.9, 300.0], [29.0, 301.0], [29.1, 301.0], [29.2, 302.0], [29.3, 304.0], [29.4, 304.0], [29.5, 305.0], [29.6, 306.0], [29.7, 309.0], [29.8, 309.0], [29.9, 310.0], [30.0, 311.0], [30.1, 311.0], [30.2, 311.0], [30.3, 312.0], [30.4, 312.0], [30.5, 313.0], [30.6, 319.0], [30.7, 319.0], [30.8, 321.0], [30.9, 325.0], [31.0, 325.0], [31.1, 327.0], [31.2, 328.0], [31.3, 329.0], [31.4, 332.0], [31.5, 336.0], [31.6, 337.0], [31.7, 338.0], [31.8, 339.0], [31.9, 339.0], [32.0, 339.0], [32.1, 339.0], [32.2, 339.0], [32.3, 340.0], [32.4, 341.0], [32.5, 343.0], [32.6, 343.0], [32.7, 346.0], [32.8, 346.0], [32.9, 347.0], [33.0, 350.0], [33.1, 353.0], [33.2, 354.0], [33.3, 358.0], [33.4, 358.0], [33.5, 362.0], [33.6, 362.0], [33.7, 363.0], [33.8, 364.0], [33.9, 366.0], [34.0, 366.0], [34.1, 366.0], [34.2, 367.0], [34.3, 367.0], [34.4, 369.0], [34.5, 373.0], [34.6, 375.0], [34.7, 377.0], [34.8, 378.0], [34.9, 379.0], [35.0, 380.0], [35.1, 380.0], [35.2, 381.0], [35.3, 382.0], [35.4, 385.0], [35.5, 386.0], [35.6, 387.0], [35.7, 389.0], [35.8, 389.0], [35.9, 390.0], [36.0, 390.0], [36.1, 392.0], [36.2, 393.0], [36.3, 393.0], [36.4, 394.0], [36.5, 394.0], [36.6, 395.0], [36.7, 396.0], [36.8, 397.0], [36.9, 400.0], [37.0, 401.0], [37.1, 402.0], [37.2, 403.0], [37.3, 404.0], [37.4, 405.0], [37.5, 408.0], [37.6, 409.0], [37.7, 410.0], [37.8, 412.0], [37.9, 416.0], [38.0, 416.0], [38.1, 416.0], [38.2, 417.0], [38.3, 420.0], [38.4, 420.0], [38.5, 423.0], [38.6, 425.0], [38.7, 426.0], [38.8, 427.0], [38.9, 429.0], [39.0, 429.0], [39.1, 430.0], [39.2, 430.0], [39.3, 431.0], [39.4, 431.0], [39.5, 432.0], [39.6, 432.0], [39.7, 433.0], [39.8, 438.0], [39.9, 441.0], [40.0, 442.0], [40.1, 442.0], [40.2, 447.0], [40.3, 449.0], [40.4, 449.0], [40.5, 450.0], [40.6, 451.0], [40.7, 451.0], [40.8, 452.0], [40.9, 456.0], [41.0, 457.0], [41.1, 458.0], [41.2, 458.0], [41.3, 459.0], [41.4, 459.0], [41.5, 459.0], [41.6, 459.0], [41.7, 462.0], [41.8, 462.0], [41.9, 464.0], [42.0, 466.0], [42.1, 469.0], [42.2, 470.0], [42.3, 473.0], [42.4, 473.0], [42.5, 475.0], [42.6, 477.0], [42.7, 480.0], [42.8, 480.0], [42.9, 480.0], [43.0, 482.0], [43.1, 483.0], [43.2, 484.0], [43.3, 485.0], [43.4, 485.0], [43.5, 487.0], [43.6, 487.0], [43.7, 488.0], [43.8, 490.0], [43.9, 490.0], [44.0, 491.0], [44.1, 492.0], [44.2, 492.0], [44.3, 492.0], [44.4, 493.0], [44.5, 494.0], [44.6, 494.0], [44.7, 497.0], [44.8, 500.0], [44.9, 501.0], [45.0, 502.0], [45.1, 503.0], [45.2, 505.0], [45.3, 507.0], [45.4, 508.0], [45.5, 509.0], [45.6, 510.0], [45.7, 512.0], [45.8, 514.0], [45.9, 514.0], [46.0, 516.0], [46.1, 516.0], [46.2, 517.0], [46.3, 518.0], [46.4, 519.0], [46.5, 520.0], [46.6, 522.0], [46.7, 523.0], [46.8, 524.0], [46.9, 525.0], [47.0, 525.0], [47.1, 531.0], [47.2, 532.0], [47.3, 532.0], [47.4, 532.0], [47.5, 540.0], [47.6, 541.0], [47.7, 546.0], [47.8, 546.0], [47.9, 547.0], [48.0, 548.0], [48.1, 548.0], [48.2, 548.0], [48.3, 553.0], [48.4, 553.0], [48.5, 556.0], [48.6, 556.0], [48.7, 558.0], [48.8, 558.0], [48.9, 559.0], [49.0, 561.0], [49.1, 562.0], [49.2, 563.0], [49.3, 563.0], [49.4, 564.0], [49.5, 566.0], [49.6, 566.0], [49.7, 567.0], [49.8, 573.0], [49.9, 576.0], [50.0, 577.0], [50.1, 578.0], [50.2, 579.0], [50.3, 579.0], [50.4, 580.0], [50.5, 584.0], [50.6, 586.0], [50.7, 586.0], [50.8, 588.0], [50.9, 588.0], [51.0, 588.0], [51.1, 590.0], [51.2, 590.0], [51.3, 593.0], [51.4, 594.0], [51.5, 595.0], [51.6, 595.0], [51.7, 596.0], [51.8, 597.0], [51.9, 601.0], [52.0, 601.0], [52.1, 602.0], [52.2, 604.0], [52.3, 604.0], [52.4, 607.0], [52.5, 607.0], [52.6, 607.0], [52.7, 607.0], [52.8, 610.0], [52.9, 611.0], [53.0, 612.0], [53.1, 612.0], [53.2, 615.0], [53.3, 620.0], [53.4, 622.0], [53.5, 623.0], [53.6, 624.0], [53.7, 624.0], [53.8, 625.0], [53.9, 626.0], [54.0, 627.0], [54.1, 629.0], [54.2, 630.0], [54.3, 631.0], [54.4, 631.0], [54.5, 637.0], [54.6, 637.0], [54.7, 638.0], [54.8, 640.0], [54.9, 642.0], [55.0, 642.0], [55.1, 644.0], [55.2, 644.0], [55.3, 647.0], [55.4, 651.0], [55.5, 652.0], [55.6, 654.0], [55.7, 655.0], [55.8, 655.0], [55.9, 656.0], [56.0, 656.0], [56.1, 658.0], [56.2, 660.0], [56.3, 662.0], [56.4, 663.0], [56.5, 663.0], [56.6, 664.0], [56.7, 664.0], [56.8, 666.0], [56.9, 670.0], [57.0, 671.0], [57.1, 672.0], [57.2, 672.0], [57.3, 674.0], [57.4, 675.0], [57.5, 675.0], [57.6, 677.0], [57.7, 677.0], [57.8, 678.0], [57.9, 679.0], [58.0, 681.0], [58.1, 681.0], [58.2, 683.0], [58.3, 683.0], [58.4, 683.0], [58.5, 684.0], [58.6, 686.0], [58.7, 686.0], [58.8, 686.0], [58.9, 689.0], [59.0, 690.0], [59.1, 691.0], [59.2, 692.0], [59.3, 694.0], [59.4, 694.0], [59.5, 697.0], [59.6, 697.0], [59.7, 697.0], [59.8, 698.0], [59.9, 698.0], [60.0, 700.0], [60.1, 701.0], [60.2, 702.0], [60.3, 703.0], [60.4, 706.0], [60.5, 709.0], [60.6, 711.0], [60.7, 713.0], [60.8, 714.0], [60.9, 715.0], [61.0, 715.0], [61.1, 716.0], [61.2, 716.0], [61.3, 716.0], [61.4, 717.0], [61.5, 718.0], [61.6, 719.0], [61.7, 719.0], [61.8, 721.0], [61.9, 723.0], [62.0, 723.0], [62.1, 725.0], [62.2, 725.0], [62.3, 727.0], [62.4, 729.0], [62.5, 731.0], [62.6, 732.0], [62.7, 733.0], [62.8, 734.0], [62.9, 734.0], [63.0, 734.0], [63.1, 737.0], [63.2, 737.0], [63.3, 738.0], [63.4, 741.0], [63.5, 742.0], [63.6, 743.0], [63.7, 745.0], [63.8, 746.0], [63.9, 747.0], [64.0, 747.0], [64.1, 748.0], [64.2, 748.0], [64.3, 749.0], [64.4, 749.0], [64.5, 750.0], [64.6, 750.0], [64.7, 751.0], [64.8, 752.0], [64.9, 752.0], [65.0, 752.0], [65.1, 755.0], [65.2, 756.0], [65.3, 756.0], [65.4, 757.0], [65.5, 758.0], [65.6, 758.0], [65.7, 761.0], [65.8, 761.0], [65.9, 764.0], [66.0, 764.0], [66.1, 765.0], [66.2, 769.0], [66.3, 769.0], [66.4, 771.0], [66.5, 772.0], [66.6, 773.0], [66.7, 775.0], [66.8, 778.0], [66.9, 780.0], [67.0, 780.0], [67.1, 781.0], [67.2, 785.0], [67.3, 785.0], [67.4, 788.0], [67.5, 793.0], [67.6, 793.0], [67.7, 794.0], [67.8, 795.0], [67.9, 795.0], [68.0, 796.0], [68.1, 799.0], [68.2, 801.0], [68.3, 801.0], [68.4, 801.0], [68.5, 801.0], [68.6, 807.0], [68.7, 807.0], [68.8, 807.0], [68.9, 808.0], [69.0, 809.0], [69.1, 809.0], [69.2, 809.0], [69.3, 810.0], [69.4, 811.0], [69.5, 816.0], [69.6, 818.0], [69.7, 818.0], [69.8, 819.0], [69.9, 819.0], [70.0, 821.0], [70.1, 821.0], [70.2, 822.0], [70.3, 822.0], [70.4, 824.0], [70.5, 824.0], [70.6, 825.0], [70.7, 829.0], [70.8, 830.0], [70.9, 830.0], [71.0, 831.0], [71.1, 831.0], [71.2, 832.0], [71.3, 832.0], [71.4, 834.0], [71.5, 835.0], [71.6, 835.0], [71.7, 837.0], [71.8, 838.0], [71.9, 839.0], [72.0, 839.0], [72.1, 839.0], [72.2, 839.0], [72.3, 841.0], [72.4, 842.0], [72.5, 842.0], [72.6, 842.0], [72.7, 843.0], [72.8, 843.0], [72.9, 847.0], [73.0, 847.0], [73.1, 848.0], [73.2, 851.0], [73.3, 852.0], [73.4, 853.0], [73.5, 855.0], [73.6, 857.0], [73.7, 859.0], [73.8, 859.0], [73.9, 861.0], [74.0, 862.0], [74.1, 862.0], [74.2, 863.0], [74.3, 864.0], [74.4, 866.0], [74.5, 867.0], [74.6, 868.0], [74.7, 868.0], [74.8, 869.0], [74.9, 871.0], [75.0, 871.0], [75.1, 871.0], [75.2, 872.0], [75.3, 875.0], [75.4, 876.0], [75.5, 876.0], [75.6, 876.0], [75.7, 879.0], [75.8, 882.0], [75.9, 882.0], [76.0, 882.0], [76.1, 883.0], [76.2, 883.0], [76.3, 883.0], [76.4, 886.0], [76.5, 886.0], [76.6, 888.0], [76.7, 888.0], [76.8, 888.0], [76.9, 891.0], [77.0, 893.0], [77.1, 894.0], [77.2, 896.0], [77.3, 897.0], [77.4, 897.0], [77.5, 897.0], [77.6, 897.0], [77.7, 898.0], [77.8, 901.0], [77.9, 903.0], [78.0, 904.0], [78.1, 906.0], [78.2, 908.0], [78.3, 909.0], [78.4, 911.0], [78.5, 911.0], [78.6, 913.0], [78.7, 914.0], [78.8, 918.0], [78.9, 919.0], [79.0, 921.0], [79.1, 922.0], [79.2, 923.0], [79.3, 924.0], [79.4, 924.0], [79.5, 925.0], [79.6, 928.0], [79.7, 929.0], [79.8, 930.0], [79.9, 932.0], [80.0, 934.0], [80.1, 936.0], [80.2, 936.0], [80.3, 937.0], [80.4, 941.0], [80.5, 941.0], [80.6, 942.0], [80.7, 943.0], [80.8, 944.0], [80.9, 945.0], [81.0, 948.0], [81.1, 948.0], [81.2, 948.0], [81.3, 949.0], [81.4, 949.0], [81.5, 951.0], [81.6, 951.0], [81.7, 953.0], [81.8, 954.0], [81.9, 956.0], [82.0, 956.0], [82.1, 958.0], [82.2, 963.0], [82.3, 963.0], [82.4, 963.0], [82.5, 963.0], [82.6, 967.0], [82.7, 967.0], [82.8, 968.0], [82.9, 971.0], [83.0, 972.0], [83.1, 972.0], [83.2, 973.0], [83.3, 973.0], [83.4, 974.0], [83.5, 978.0], [83.6, 980.0], [83.7, 983.0], [83.8, 986.0], [83.9, 987.0], [84.0, 987.0], [84.1, 988.0], [84.2, 988.0], [84.3, 989.0], [84.4, 991.0], [84.5, 991.0], [84.6, 991.0], [84.7, 992.0], [84.8, 994.0], [84.9, 998.0], [85.0, 999.0], [85.1, 1003.0], [85.2, 1007.0], [85.3, 1017.0], [85.4, 1020.0], [85.5, 1020.0], [85.6, 1021.0], [85.7, 1022.0], [85.8, 1022.0], [85.9, 1024.0], [86.0, 1025.0], [86.1, 1028.0], [86.2, 1030.0], [86.3, 1031.0], [86.4, 1032.0], [86.5, 1032.0], [86.6, 1033.0], [86.7, 1039.0], [86.8, 1047.0], [86.9, 1052.0], [87.0, 1054.0], [87.1, 1055.0], [87.2, 1055.0], [87.3, 1056.0], [87.4, 1058.0], [87.5, 1059.0], [87.6, 1062.0], [87.7, 1064.0], [87.8, 1065.0], [87.9, 1065.0], [88.0, 1067.0], [88.1, 1069.0], [88.2, 1071.0], [88.3, 1072.0], [88.4, 1073.0], [88.5, 1073.0], [88.6, 1081.0], [88.7, 1085.0], [88.8, 1087.0], [88.9, 1088.0], [89.0, 1089.0], [89.1, 1092.0], [89.2, 1094.0], [89.3, 1094.0], [89.4, 1098.0], [89.5, 1101.0], [89.6, 1104.0], [89.7, 1106.0], [89.8, 1107.0], [89.9, 1108.0], [90.0, 1111.0], [90.1, 1117.0], [90.2, 1118.0], [90.3, 1119.0], [90.4, 1135.0], [90.5, 1140.0], [90.6, 1141.0], [90.7, 1146.0], [90.8, 1147.0], [90.9, 1151.0], [91.0, 1157.0], [91.1, 1159.0], [91.2, 1162.0], [91.3, 1166.0], [91.4, 1169.0], [91.5, 1171.0], [91.6, 1172.0], [91.7, 1173.0], [91.8, 1178.0], [91.9, 1181.0], [92.0, 1183.0], [92.1, 1183.0], [92.2, 1190.0], [92.3, 1196.0], [92.4, 1199.0], [92.5, 1203.0], [92.6, 1206.0], [92.7, 1208.0], [92.8, 1215.0], [92.9, 1216.0], [93.0, 1218.0], [93.1, 1220.0], [93.2, 1226.0], [93.3, 1227.0], [93.4, 1229.0], [93.5, 1233.0], [93.6, 1241.0], [93.7, 1241.0], [93.8, 1241.0], [93.9, 1242.0], [94.0, 1242.0], [94.1, 1250.0], [94.2, 1252.0], [94.3, 1253.0], [94.4, 1260.0], [94.5, 1264.0], [94.6, 1272.0], [94.7, 1275.0], [94.8, 1282.0], [94.9, 1288.0], [95.0, 1288.0], [95.1, 1289.0], [95.2, 1294.0], [95.3, 1305.0], [95.4, 1309.0], [95.5, 1310.0], [95.6, 1313.0], [95.7, 1314.0], [95.8, 1315.0], [95.9, 1322.0], [96.0, 1327.0], [96.1, 1330.0], [96.2, 1330.0], [96.3, 1331.0], [96.4, 1331.0], [96.5, 1337.0], [96.6, 1341.0], [96.7, 1341.0], [96.8, 1349.0], [96.9, 1353.0], [97.0, 1361.0], [97.1, 1373.0], [97.2, 1386.0], [97.3, 1388.0], [97.4, 1404.0], [97.5, 1405.0], [97.6, 1411.0], [97.7, 1411.0], [97.8, 1420.0], [97.9, 1423.0], [98.0, 1426.0], [98.1, 1434.0], [98.2, 1441.0], [98.3, 1459.0], [98.4, 1487.0], [98.5, 1499.0], [98.6, 1515.0], [98.7, 1528.0], [98.8, 1530.0], [98.9, 1532.0], [99.0, 1553.0], [99.1, 1572.0], [99.2, 1577.0], [99.3, 1640.0], [99.4, 1718.0], [99.5, 1727.0], [99.6, 1806.0], [99.7, 1884.0], [99.8, 1915.0], [99.9, 1932.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 171.0, "series": [{"data": [[0.0, 171.0], [600.0, 81.0], [700.0, 82.0], [200.0, 78.0], [800.0, 96.0], [900.0, 73.0], [1000.0, 45.0], [1100.0, 30.0], [1200.0, 28.0], [300.0, 81.0], [1300.0, 21.0], [1400.0, 12.0], [1500.0, 7.0], [100.0, 38.0], [1600.0, 1.0], [400.0, 79.0], [1700.0, 2.0], [1800.0, 2.0], [1900.0, 2.0], [500.0, 71.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 14.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 538.0, "series": [{"data": [[1.0, 538.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 448.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 14.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 54.45599999999998, "minX": 1.54961868E12, "maxY": 54.45599999999998, "series": [{"data": [[1.54961868E12, 54.45599999999998]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 93.171875, "minX": 1.0, "maxY": 1391.2857142857142, "series": [{"data": [[2.0, 573.0], [3.0, 642.0], [4.0, 612.0], [5.0, 300.33333333333337], [6.0, 126.25], [7.0, 95.19999999999999], [8.0, 93.171875], [9.0, 99.19999999999999], [10.0, 103.10714285714283], [11.0, 214.2], [12.0, 280.6666666666667], [13.0, 382.0], [14.0, 498.5], [15.0, 408.66666666666663], [16.0, 573.5], [17.0, 345.0], [18.0, 414.5], [19.0, 297.8], [20.0, 356.66666666666663], [21.0, 397.0], [22.0, 303.7142857142857], [23.0, 273.9], [24.0, 300.1666666666667], [25.0, 326.5], [26.0, 305.2857142857143], [27.0, 263.87499999999994], [28.0, 435.66666666666663], [29.0, 319.8333333333333], [30.0, 393.3333333333333], [31.0, 321.66666666666663], [33.0, 373.1875], [32.0, 365.2307692307693], [35.0, 397.55555555555554], [34.0, 380.5], [37.0, 398.12500000000006], [36.0, 428.0], [39.0, 405.46153846153845], [38.0, 437.125], [41.0, 457.3], [40.0, 408.7], [43.0, 382.0], [42.0, 472.5], [45.0, 456.6], [44.0, 636.5], [47.0, 534.8181818181819], [46.0, 494.0], [49.0, 430.5], [48.0, 469.1111111111111], [51.0, 564.375], [50.0, 590.375], [53.0, 663.0], [52.0, 584.5], [55.0, 544.1111111111111], [54.0, 595.4444444444445], [57.0, 642.375], [56.0, 586.090909090909], [59.0, 628.3], [58.0, 723.6], [61.0, 776.3333333333334], [60.0, 652.3333333333334], [63.0, 638.2857142857143], [62.0, 702.9999999999999], [67.0, 800.5], [66.0, 729.0909090909091], [65.0, 785.6363636363636], [64.0, 644.3000000000001], [70.0, 817.2], [71.0, 771.7272727272726], [69.0, 911.8333333333334], [68.0, 760.875], [72.0, 844.0], [73.0, 739.3333333333334], [75.0, 867.2222222222222], [74.0, 901.1428571428572], [78.0, 882.5], [77.0, 769.8333333333334], [76.0, 804.2857142857143], [79.0, 738.25], [83.0, 863.8], [82.0, 912.25], [81.0, 949.125], [80.0, 874.6], [87.0, 936.3846153846154], [86.0, 832.75], [85.0, 925.1666666666666], [84.0, 1012.4], [91.0, 1100.2500000000002], [90.0, 1113.7500000000002], [89.0, 970.0], [88.0, 849.2222222222222], [92.0, 936.8], [95.0, 1232.0], [94.0, 1164.5], [93.0, 1019.0], [99.0, 933.6666666666667], [98.0, 932.5], [96.0, 989.5], [97.0, 930.0], [100.0, 961.7142857142857], [101.0, 1050.142857142857], [103.0, 1106.0], [102.0, 873.3333333333334], [106.0, 947.9], [105.0, 962.8571428571429], [104.0, 1017.4], [107.0, 846.0], [108.0, 1171.2], [111.0, 1043.0], [110.0, 1391.2857142857142], [109.0, 1208.090909090909], [114.0, 1012.75], [115.0, 974.0], [113.0, 993.3333333333334], [112.0, 1126.5714285714284], [116.0, 996.25], [118.0, 1183.6], [119.0, 886.0], [117.0, 1198.3333333333333], [120.0, 1147.0], [121.0, 1055.3333333333333], [123.0, 1205.6666666666667], [122.0, 1167.0], [124.0, 1076.6666666666667], [1.0, 525.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[54.45599999999998, 593.3159999999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 124.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6283.333333333333, "minX": 1.54961868E12, "maxY": 7015.633333333333, "series": [{"data": [[1.54961868E12, 7015.633333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961868E12, 6283.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 593.3159999999999, "minX": 1.54961868E12, "maxY": 593.3159999999999, "series": [{"data": [[1.54961868E12, 593.3159999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961868E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 593.2939999999996, "minX": 1.54961868E12, "maxY": 593.2939999999996, "series": [{"data": [[1.54961868E12, 593.2939999999996]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961868E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 4.152999999999998, "minX": 1.54961868E12, "maxY": 4.152999999999998, "series": [{"data": [[1.54961868E12, 4.152999999999998]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961868E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 71.0, "minX": 1.54961868E12, "maxY": 1932.0, "series": [{"data": [[1.54961868E12, 1932.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961868E12, 71.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961868E12, 1110.6999999999998]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961868E12, 1552.7900000000002]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961868E12, 1288.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 577.5, "minX": 16.0, "maxY": 577.5, "series": [{"data": [[16.0, 577.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 577.5, "minX": 16.0, "maxY": 577.5, "series": [{"data": [[16.0, 577.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54961868E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54961868E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54961868E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54961868E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961868E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54961868E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54961868E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961868E12, "title": "Transactions Per Second"}},
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
