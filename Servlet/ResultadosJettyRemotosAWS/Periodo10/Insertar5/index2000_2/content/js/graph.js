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
        data: {"result": {"minY": 31.0, "minX": 0.0, "maxY": 2051.0, "series": [{"data": [[0.0, 31.0], [0.1, 33.0], [0.2, 34.0], [0.3, 34.0], [0.4, 34.0], [0.5, 34.0], [0.6, 34.0], [0.7, 35.0], [0.8, 35.0], [0.9, 35.0], [1.0, 35.0], [1.1, 35.0], [1.2, 35.0], [1.3, 35.0], [1.4, 35.0], [1.5, 36.0], [1.6, 36.0], [1.7, 36.0], [1.8, 36.0], [1.9, 36.0], [2.0, 36.0], [2.1, 36.0], [2.2, 36.0], [2.3, 36.0], [2.4, 37.0], [2.5, 37.0], [2.6, 37.0], [2.7, 37.0], [2.8, 37.0], [2.9, 37.0], [3.0, 37.0], [3.1, 37.0], [3.2, 37.0], [3.3, 37.0], [3.4, 38.0], [3.5, 38.0], [3.6, 38.0], [3.7, 38.0], [3.8, 38.0], [3.9, 38.0], [4.0, 38.0], [4.1, 38.0], [4.2, 38.0], [4.3, 38.0], [4.4, 38.0], [4.5, 39.0], [4.6, 39.0], [4.7, 39.0], [4.8, 39.0], [4.9, 39.0], [5.0, 39.0], [5.1, 39.0], [5.2, 39.0], [5.3, 39.0], [5.4, 40.0], [5.5, 40.0], [5.6, 40.0], [5.7, 40.0], [5.8, 40.0], [5.9, 40.0], [6.0, 40.0], [6.1, 40.0], [6.2, 40.0], [6.3, 40.0], [6.4, 40.0], [6.5, 40.0], [6.6, 40.0], [6.7, 41.0], [6.8, 41.0], [6.9, 41.0], [7.0, 41.0], [7.1, 41.0], [7.2, 41.0], [7.3, 41.0], [7.4, 41.0], [7.5, 41.0], [7.6, 41.0], [7.7, 41.0], [7.8, 41.0], [7.9, 41.0], [8.0, 41.0], [8.1, 42.0], [8.2, 42.0], [8.3, 42.0], [8.4, 42.0], [8.5, 42.0], [8.6, 42.0], [8.7, 42.0], [8.8, 42.0], [8.9, 42.0], [9.0, 42.0], [9.1, 42.0], [9.2, 42.0], [9.3, 42.0], [9.4, 42.0], [9.5, 42.0], [9.6, 42.0], [9.7, 43.0], [9.8, 43.0], [9.9, 43.0], [10.0, 43.0], [10.1, 43.0], [10.2, 43.0], [10.3, 43.0], [10.4, 43.0], [10.5, 43.0], [10.6, 43.0], [10.7, 43.0], [10.8, 44.0], [10.9, 44.0], [11.0, 44.0], [11.1, 44.0], [11.2, 44.0], [11.3, 44.0], [11.4, 44.0], [11.5, 44.0], [11.6, 44.0], [11.7, 44.0], [11.8, 44.0], [11.9, 45.0], [12.0, 45.0], [12.1, 45.0], [12.2, 45.0], [12.3, 45.0], [12.4, 45.0], [12.5, 45.0], [12.6, 45.0], [12.7, 45.0], [12.8, 45.0], [12.9, 45.0], [13.0, 45.0], [13.1, 46.0], [13.2, 46.0], [13.3, 46.0], [13.4, 46.0], [13.5, 46.0], [13.6, 46.0], [13.7, 46.0], [13.8, 46.0], [13.9, 46.0], [14.0, 47.0], [14.1, 47.0], [14.2, 47.0], [14.3, 47.0], [14.4, 47.0], [14.5, 47.0], [14.6, 47.0], [14.7, 47.0], [14.8, 47.0], [14.9, 47.0], [15.0, 48.0], [15.1, 48.0], [15.2, 48.0], [15.3, 48.0], [15.4, 48.0], [15.5, 48.0], [15.6, 49.0], [15.7, 49.0], [15.8, 49.0], [15.9, 49.0], [16.0, 49.0], [16.1, 49.0], [16.2, 49.0], [16.3, 49.0], [16.4, 49.0], [16.5, 49.0], [16.6, 49.0], [16.7, 49.0], [16.8, 49.0], [16.9, 50.0], [17.0, 50.0], [17.1, 50.0], [17.2, 50.0], [17.3, 50.0], [17.4, 50.0], [17.5, 50.0], [17.6, 51.0], [17.7, 51.0], [17.8, 51.0], [17.9, 51.0], [18.0, 51.0], [18.1, 51.0], [18.2, 51.0], [18.3, 51.0], [18.4, 52.0], [18.5, 52.0], [18.6, 52.0], [18.7, 52.0], [18.8, 52.0], [18.9, 52.0], [19.0, 52.0], [19.1, 53.0], [19.2, 53.0], [19.3, 53.0], [19.4, 53.0], [19.5, 53.0], [19.6, 53.0], [19.7, 54.0], [19.8, 54.0], [19.9, 54.0], [20.0, 54.0], [20.1, 54.0], [20.2, 54.0], [20.3, 55.0], [20.4, 55.0], [20.5, 55.0], [20.6, 55.0], [20.7, 55.0], [20.8, 56.0], [20.9, 56.0], [21.0, 56.0], [21.1, 56.0], [21.2, 56.0], [21.3, 57.0], [21.4, 57.0], [21.5, 57.0], [21.6, 57.0], [21.7, 57.0], [21.8, 57.0], [21.9, 58.0], [22.0, 58.0], [22.1, 58.0], [22.2, 58.0], [22.3, 59.0], [22.4, 59.0], [22.5, 59.0], [22.6, 59.0], [22.7, 59.0], [22.8, 59.0], [22.9, 60.0], [23.0, 60.0], [23.1, 60.0], [23.2, 60.0], [23.3, 60.0], [23.4, 61.0], [23.5, 61.0], [23.6, 61.0], [23.7, 61.0], [23.8, 62.0], [23.9, 62.0], [24.0, 62.0], [24.1, 63.0], [24.2, 63.0], [24.3, 63.0], [24.4, 63.0], [24.5, 64.0], [24.6, 64.0], [24.7, 65.0], [24.8, 65.0], [24.9, 66.0], [25.0, 67.0], [25.1, 68.0], [25.2, 69.0], [25.3, 69.0], [25.4, 70.0], [25.5, 71.0], [25.6, 71.0], [25.7, 73.0], [25.8, 74.0], [25.9, 75.0], [26.0, 76.0], [26.1, 79.0], [26.2, 80.0], [26.3, 86.0], [26.4, 90.0], [26.5, 95.0], [26.6, 99.0], [26.7, 105.0], [26.8, 107.0], [26.9, 113.0], [27.0, 115.0], [27.1, 116.0], [27.2, 117.0], [27.3, 121.0], [27.4, 126.0], [27.5, 132.0], [27.6, 138.0], [27.7, 140.0], [27.8, 147.0], [27.9, 149.0], [28.0, 151.0], [28.1, 154.0], [28.2, 156.0], [28.3, 161.0], [28.4, 165.0], [28.5, 168.0], [28.6, 170.0], [28.7, 171.0], [28.8, 176.0], [28.9, 178.0], [29.0, 179.0], [29.1, 185.0], [29.2, 188.0], [29.3, 189.0], [29.4, 190.0], [29.5, 191.0], [29.6, 192.0], [29.7, 194.0], [29.8, 201.0], [29.9, 207.0], [30.0, 210.0], [30.1, 212.0], [30.2, 214.0], [30.3, 215.0], [30.4, 218.0], [30.5, 220.0], [30.6, 223.0], [30.7, 224.0], [30.8, 227.0], [30.9, 230.0], [31.0, 231.0], [31.1, 233.0], [31.2, 238.0], [31.3, 238.0], [31.4, 240.0], [31.5, 242.0], [31.6, 244.0], [31.7, 246.0], [31.8, 248.0], [31.9, 250.0], [32.0, 252.0], [32.1, 253.0], [32.2, 254.0], [32.3, 255.0], [32.4, 255.0], [32.5, 256.0], [32.6, 258.0], [32.7, 259.0], [32.8, 260.0], [32.9, 261.0], [33.0, 263.0], [33.1, 264.0], [33.2, 266.0], [33.3, 266.0], [33.4, 267.0], [33.5, 269.0], [33.6, 270.0], [33.7, 271.0], [33.8, 274.0], [33.9, 275.0], [34.0, 276.0], [34.1, 278.0], [34.2, 281.0], [34.3, 282.0], [34.4, 283.0], [34.5, 284.0], [34.6, 284.0], [34.7, 286.0], [34.8, 287.0], [34.9, 287.0], [35.0, 288.0], [35.1, 290.0], [35.2, 290.0], [35.3, 291.0], [35.4, 293.0], [35.5, 293.0], [35.6, 294.0], [35.7, 297.0], [35.8, 298.0], [35.9, 298.0], [36.0, 300.0], [36.1, 302.0], [36.2, 303.0], [36.3, 306.0], [36.4, 307.0], [36.5, 307.0], [36.6, 308.0], [36.7, 309.0], [36.8, 310.0], [36.9, 310.0], [37.0, 310.0], [37.1, 311.0], [37.2, 313.0], [37.3, 314.0], [37.4, 315.0], [37.5, 316.0], [37.6, 317.0], [37.7, 317.0], [37.8, 319.0], [37.9, 320.0], [38.0, 320.0], [38.1, 322.0], [38.2, 323.0], [38.3, 323.0], [38.4, 325.0], [38.5, 326.0], [38.6, 327.0], [38.7, 327.0], [38.8, 328.0], [38.9, 329.0], [39.0, 331.0], [39.1, 331.0], [39.2, 333.0], [39.3, 333.0], [39.4, 334.0], [39.5, 335.0], [39.6, 335.0], [39.7, 336.0], [39.8, 337.0], [39.9, 337.0], [40.0, 337.0], [40.1, 338.0], [40.2, 339.0], [40.3, 339.0], [40.4, 339.0], [40.5, 341.0], [40.6, 341.0], [40.7, 343.0], [40.8, 347.0], [40.9, 348.0], [41.0, 349.0], [41.1, 349.0], [41.2, 350.0], [41.3, 351.0], [41.4, 351.0], [41.5, 352.0], [41.6, 354.0], [41.7, 355.0], [41.8, 356.0], [41.9, 356.0], [42.0, 359.0], [42.1, 359.0], [42.2, 359.0], [42.3, 359.0], [42.4, 361.0], [42.5, 361.0], [42.6, 361.0], [42.7, 362.0], [42.8, 363.0], [42.9, 365.0], [43.0, 365.0], [43.1, 365.0], [43.2, 368.0], [43.3, 368.0], [43.4, 369.0], [43.5, 371.0], [43.6, 371.0], [43.7, 372.0], [43.8, 373.0], [43.9, 373.0], [44.0, 374.0], [44.1, 375.0], [44.2, 376.0], [44.3, 377.0], [44.4, 378.0], [44.5, 379.0], [44.6, 380.0], [44.7, 381.0], [44.8, 381.0], [44.9, 382.0], [45.0, 384.0], [45.1, 384.0], [45.2, 384.0], [45.3, 386.0], [45.4, 387.0], [45.5, 388.0], [45.6, 388.0], [45.7, 389.0], [45.8, 389.0], [45.9, 390.0], [46.0, 390.0], [46.1, 391.0], [46.2, 391.0], [46.3, 392.0], [46.4, 393.0], [46.5, 393.0], [46.6, 393.0], [46.7, 394.0], [46.8, 394.0], [46.9, 395.0], [47.0, 396.0], [47.1, 396.0], [47.2, 398.0], [47.3, 399.0], [47.4, 399.0], [47.5, 400.0], [47.6, 402.0], [47.7, 403.0], [47.8, 403.0], [47.9, 405.0], [48.0, 406.0], [48.1, 406.0], [48.2, 406.0], [48.3, 407.0], [48.4, 408.0], [48.5, 409.0], [48.6, 410.0], [48.7, 410.0], [48.8, 411.0], [48.9, 411.0], [49.0, 412.0], [49.1, 413.0], [49.2, 414.0], [49.3, 414.0], [49.4, 415.0], [49.5, 416.0], [49.6, 418.0], [49.7, 418.0], [49.8, 419.0], [49.9, 419.0], [50.0, 421.0], [50.1, 422.0], [50.2, 423.0], [50.3, 424.0], [50.4, 424.0], [50.5, 424.0], [50.6, 425.0], [50.7, 426.0], [50.8, 428.0], [50.9, 429.0], [51.0, 430.0], [51.1, 431.0], [51.2, 432.0], [51.3, 432.0], [51.4, 433.0], [51.5, 434.0], [51.6, 437.0], [51.7, 437.0], [51.8, 437.0], [51.9, 438.0], [52.0, 439.0], [52.1, 440.0], [52.2, 443.0], [52.3, 443.0], [52.4, 445.0], [52.5, 446.0], [52.6, 447.0], [52.7, 448.0], [52.8, 448.0], [52.9, 448.0], [53.0, 449.0], [53.1, 450.0], [53.2, 451.0], [53.3, 451.0], [53.4, 452.0], [53.5, 453.0], [53.6, 454.0], [53.7, 455.0], [53.8, 455.0], [53.9, 457.0], [54.0, 457.0], [54.1, 458.0], [54.2, 459.0], [54.3, 460.0], [54.4, 462.0], [54.5, 462.0], [54.6, 464.0], [54.7, 465.0], [54.8, 465.0], [54.9, 466.0], [55.0, 466.0], [55.1, 467.0], [55.2, 467.0], [55.3, 468.0], [55.4, 468.0], [55.5, 468.0], [55.6, 469.0], [55.7, 470.0], [55.8, 472.0], [55.9, 473.0], [56.0, 474.0], [56.1, 475.0], [56.2, 476.0], [56.3, 476.0], [56.4, 476.0], [56.5, 477.0], [56.6, 478.0], [56.7, 479.0], [56.8, 480.0], [56.9, 480.0], [57.0, 480.0], [57.1, 482.0], [57.2, 482.0], [57.3, 483.0], [57.4, 484.0], [57.5, 485.0], [57.6, 486.0], [57.7, 487.0], [57.8, 487.0], [57.9, 488.0], [58.0, 489.0], [58.1, 490.0], [58.2, 490.0], [58.3, 492.0], [58.4, 493.0], [58.5, 495.0], [58.6, 496.0], [58.7, 498.0], [58.8, 499.0], [58.9, 500.0], [59.0, 502.0], [59.1, 503.0], [59.2, 504.0], [59.3, 505.0], [59.4, 505.0], [59.5, 505.0], [59.6, 506.0], [59.7, 506.0], [59.8, 508.0], [59.9, 508.0], [60.0, 509.0], [60.1, 509.0], [60.2, 511.0], [60.3, 512.0], [60.4, 513.0], [60.5, 514.0], [60.6, 515.0], [60.7, 515.0], [60.8, 515.0], [60.9, 517.0], [61.0, 518.0], [61.1, 518.0], [61.2, 519.0], [61.3, 520.0], [61.4, 520.0], [61.5, 520.0], [61.6, 521.0], [61.7, 523.0], [61.8, 524.0], [61.9, 525.0], [62.0, 527.0], [62.1, 529.0], [62.2, 530.0], [62.3, 532.0], [62.4, 533.0], [62.5, 533.0], [62.6, 534.0], [62.7, 534.0], [62.8, 534.0], [62.9, 536.0], [63.0, 537.0], [63.1, 537.0], [63.2, 540.0], [63.3, 540.0], [63.4, 542.0], [63.5, 542.0], [63.6, 543.0], [63.7, 543.0], [63.8, 543.0], [63.9, 545.0], [64.0, 546.0], [64.1, 547.0], [64.2, 547.0], [64.3, 548.0], [64.4, 548.0], [64.5, 549.0], [64.6, 550.0], [64.7, 552.0], [64.8, 555.0], [64.9, 557.0], [65.0, 558.0], [65.1, 559.0], [65.2, 559.0], [65.3, 560.0], [65.4, 561.0], [65.5, 563.0], [65.6, 564.0], [65.7, 565.0], [65.8, 565.0], [65.9, 566.0], [66.0, 567.0], [66.1, 568.0], [66.2, 568.0], [66.3, 569.0], [66.4, 571.0], [66.5, 571.0], [66.6, 572.0], [66.7, 572.0], [66.8, 573.0], [66.9, 575.0], [67.0, 576.0], [67.1, 577.0], [67.2, 578.0], [67.3, 578.0], [67.4, 579.0], [67.5, 579.0], [67.6, 580.0], [67.7, 581.0], [67.8, 581.0], [67.9, 582.0], [68.0, 582.0], [68.1, 584.0], [68.2, 586.0], [68.3, 587.0], [68.4, 589.0], [68.5, 591.0], [68.6, 591.0], [68.7, 591.0], [68.8, 593.0], [68.9, 594.0], [69.0, 594.0], [69.1, 595.0], [69.2, 595.0], [69.3, 596.0], [69.4, 597.0], [69.5, 598.0], [69.6, 599.0], [69.7, 599.0], [69.8, 602.0], [69.9, 602.0], [70.0, 604.0], [70.1, 605.0], [70.2, 606.0], [70.3, 606.0], [70.4, 607.0], [70.5, 608.0], [70.6, 610.0], [70.7, 610.0], [70.8, 611.0], [70.9, 612.0], [71.0, 613.0], [71.1, 614.0], [71.2, 614.0], [71.3, 615.0], [71.4, 616.0], [71.5, 617.0], [71.6, 618.0], [71.7, 618.0], [71.8, 619.0], [71.9, 619.0], [72.0, 623.0], [72.1, 625.0], [72.2, 627.0], [72.3, 630.0], [72.4, 631.0], [72.5, 631.0], [72.6, 632.0], [72.7, 633.0], [72.8, 633.0], [72.9, 634.0], [73.0, 634.0], [73.1, 635.0], [73.2, 636.0], [73.3, 637.0], [73.4, 637.0], [73.5, 639.0], [73.6, 639.0], [73.7, 640.0], [73.8, 642.0], [73.9, 643.0], [74.0, 644.0], [74.1, 646.0], [74.2, 648.0], [74.3, 653.0], [74.4, 654.0], [74.5, 656.0], [74.6, 657.0], [74.7, 658.0], [74.8, 660.0], [74.9, 662.0], [75.0, 663.0], [75.1, 663.0], [75.2, 663.0], [75.3, 666.0], [75.4, 666.0], [75.5, 669.0], [75.6, 670.0], [75.7, 671.0], [75.8, 672.0], [75.9, 673.0], [76.0, 673.0], [76.1, 675.0], [76.2, 677.0], [76.3, 678.0], [76.4, 680.0], [76.5, 681.0], [76.6, 681.0], [76.7, 683.0], [76.8, 684.0], [76.9, 685.0], [77.0, 686.0], [77.1, 687.0], [77.2, 689.0], [77.3, 689.0], [77.4, 690.0], [77.5, 690.0], [77.6, 694.0], [77.7, 695.0], [77.8, 696.0], [77.9, 697.0], [78.0, 698.0], [78.1, 700.0], [78.2, 704.0], [78.3, 705.0], [78.4, 708.0], [78.5, 709.0], [78.6, 710.0], [78.7, 713.0], [78.8, 715.0], [78.9, 715.0], [79.0, 716.0], [79.1, 716.0], [79.2, 718.0], [79.3, 719.0], [79.4, 720.0], [79.5, 721.0], [79.6, 724.0], [79.7, 726.0], [79.8, 728.0], [79.9, 728.0], [80.0, 729.0], [80.1, 729.0], [80.2, 732.0], [80.3, 732.0], [80.4, 733.0], [80.5, 740.0], [80.6, 740.0], [80.7, 743.0], [80.8, 744.0], [80.9, 746.0], [81.0, 748.0], [81.1, 749.0], [81.2, 751.0], [81.3, 754.0], [81.4, 755.0], [81.5, 762.0], [81.6, 766.0], [81.7, 769.0], [81.8, 771.0], [81.9, 773.0], [82.0, 775.0], [82.1, 778.0], [82.2, 779.0], [82.3, 782.0], [82.4, 785.0], [82.5, 789.0], [82.6, 792.0], [82.7, 796.0], [82.8, 798.0], [82.9, 799.0], [83.0, 800.0], [83.1, 801.0], [83.2, 802.0], [83.3, 806.0], [83.4, 809.0], [83.5, 812.0], [83.6, 814.0], [83.7, 815.0], [83.8, 816.0], [83.9, 818.0], [84.0, 819.0], [84.1, 821.0], [84.2, 826.0], [84.3, 826.0], [84.4, 831.0], [84.5, 835.0], [84.6, 837.0], [84.7, 839.0], [84.8, 841.0], [84.9, 843.0], [85.0, 844.0], [85.1, 845.0], [85.2, 846.0], [85.3, 850.0], [85.4, 852.0], [85.5, 853.0], [85.6, 855.0], [85.7, 858.0], [85.8, 858.0], [85.9, 861.0], [86.0, 864.0], [86.1, 865.0], [86.2, 867.0], [86.3, 868.0], [86.4, 870.0], [86.5, 872.0], [86.6, 873.0], [86.7, 881.0], [86.8, 882.0], [86.9, 883.0], [87.0, 886.0], [87.1, 889.0], [87.2, 891.0], [87.3, 892.0], [87.4, 896.0], [87.5, 902.0], [87.6, 904.0], [87.7, 907.0], [87.8, 911.0], [87.9, 917.0], [88.0, 923.0], [88.1, 926.0], [88.2, 927.0], [88.3, 929.0], [88.4, 929.0], [88.5, 929.0], [88.6, 932.0], [88.7, 934.0], [88.8, 939.0], [88.9, 945.0], [89.0, 952.0], [89.1, 961.0], [89.2, 963.0], [89.3, 968.0], [89.4, 969.0], [89.5, 970.0], [89.6, 974.0], [89.7, 977.0], [89.8, 984.0], [89.9, 986.0], [90.0, 993.0], [90.1, 997.0], [90.2, 1003.0], [90.3, 1006.0], [90.4, 1010.0], [90.5, 1012.0], [90.6, 1013.0], [90.7, 1017.0], [90.8, 1021.0], [90.9, 1024.0], [91.0, 1026.0], [91.1, 1028.0], [91.2, 1034.0], [91.3, 1035.0], [91.4, 1037.0], [91.5, 1038.0], [91.6, 1038.0], [91.7, 1039.0], [91.8, 1040.0], [91.9, 1041.0], [92.0, 1042.0], [92.1, 1043.0], [92.2, 1044.0], [92.3, 1044.0], [92.4, 1045.0], [92.5, 1045.0], [92.6, 1047.0], [92.7, 1047.0], [92.8, 1047.0], [92.9, 1048.0], [93.0, 1048.0], [93.1, 1048.0], [93.2, 1049.0], [93.3, 1049.0], [93.4, 1051.0], [93.5, 1052.0], [93.6, 1052.0], [93.7, 1052.0], [93.8, 1053.0], [93.9, 1053.0], [94.0, 1053.0], [94.1, 1054.0], [94.2, 1054.0], [94.3, 1054.0], [94.4, 1055.0], [94.5, 1055.0], [94.6, 1056.0], [94.7, 1057.0], [94.8, 1058.0], [94.9, 1059.0], [95.0, 1059.0], [95.1, 1060.0], [95.2, 1061.0], [95.3, 1061.0], [95.4, 1062.0], [95.5, 1062.0], [95.6, 1064.0], [95.7, 1066.0], [95.8, 1073.0], [95.9, 1080.0], [96.0, 1085.0], [96.1, 1089.0], [96.2, 1107.0], [96.3, 1115.0], [96.4, 1128.0], [96.5, 1131.0], [96.6, 1135.0], [96.7, 1150.0], [96.8, 1160.0], [96.9, 1173.0], [97.0, 1178.0], [97.1, 1183.0], [97.2, 1188.0], [97.3, 1217.0], [97.4, 1226.0], [97.5, 1265.0], [97.6, 1356.0], [97.7, 1394.0], [97.8, 1431.0], [97.9, 1456.0], [98.0, 1478.0], [98.1, 1499.0], [98.2, 1529.0], [98.3, 1563.0], [98.4, 1579.0], [98.5, 1587.0], [98.6, 1601.0], [98.7, 1611.0], [98.8, 1657.0], [98.9, 1669.0], [99.0, 1719.0], [99.1, 1755.0], [99.2, 1768.0], [99.3, 1775.0], [99.4, 1782.0], [99.5, 1806.0], [99.6, 1885.0], [99.7, 1924.0], [99.8, 1957.0], [99.9, 2051.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 3.0, "minX": 0.0, "maxY": 532.0, "series": [{"data": [[0.0, 532.0], [600.0, 167.0], [700.0, 97.0], [200.0, 123.0], [800.0, 90.0], [900.0, 54.0], [1000.0, 121.0], [1100.0, 22.0], [300.0, 231.0], [1200.0, 6.0], [1300.0, 3.0], [1400.0, 8.0], [1500.0, 9.0], [100.0, 63.0], [400.0, 227.0], [1600.0, 8.0], [1700.0, 10.0], [1800.0, 3.0], [1900.0, 4.0], [500.0, 219.0], [2000.0, 3.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 37.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1179.0, "series": [{"data": [[1.0, 784.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1179.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 37.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 81.00049999999989, "minX": 1.54961922E12, "maxY": 81.00049999999989, "series": [{"data": [[1.54961922E12, 81.00049999999989]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 39.333333333333336, "minX": 1.0, "maxY": 1283.9, "series": [{"data": [[2.0, 1040.0], [3.0, 39.333333333333336], [4.0, 374.0], [5.0, 88.25], [6.0, 61.5], [7.0, 56.677966101694906], [8.0, 56.94366197183099], [9.0, 54.82300884955753], [10.0, 63.69767441860465], [11.0, 56.951612903225794], [12.0, 99.3265306122449], [13.0, 140.76923076923077], [14.0, 193.5], [15.0, 200.375], [16.0, 414.6666666666667], [17.0, 409.6666666666667], [18.0, 425.3333333333333], [19.0, 582.5], [20.0, 421.6666666666667], [21.0, 343.75], [22.0, 326.6], [23.0, 369.25], [24.0, 355.0], [25.0, 313.4], [26.0, 447.6666666666667], [27.0, 365.75], [28.0, 448.6666666666667], [29.0, 406.25], [30.0, 350.8333333333333], [31.0, 355.0], [33.0, 693.5], [32.0, 414.2], [35.0, 497.3333333333333], [34.0, 496.6666666666667], [37.0, 383.4], [36.0, 467.6666666666667], [39.0, 507.0], [38.0, 427.75], [41.0, 625.5], [40.0, 643.0], [43.0, 525.0], [42.0, 472.75], [44.0, 431.5], [45.0, 489.0], [46.0, 642.5], [47.0, 1061.0], [49.0, 1071.0], [48.0, 1061.0], [51.0, 1053.0], [50.0, 1055.0], [53.0, 1047.0], [52.0, 1054.0], [55.0, 631.5], [54.0, 1038.0], [57.0, 364.7], [56.0, 540.6666666666666], [58.0, 348.7777777777777], [59.0, 342.0], [61.0, 339.93749999999994], [60.0, 377.50000000000006], [62.0, 379.5], [63.0, 414.1666666666667], [67.0, 388.6363636363636], [66.0, 379.12499999999994], [65.0, 481.66666666666663], [64.0, 448.4], [71.0, 399.0769230769231], [70.0, 360.8095238095239], [68.0, 390.45454545454544], [69.0, 340.7692307692308], [75.0, 407.75], [74.0, 322.0], [73.0, 410.5714285714286], [72.0, 379.08333333333337], [79.0, 383.18181818181813], [78.0, 407.0], [77.0, 443.66666666666663], [76.0, 393.74999999999994], [83.0, 407.99999999999994], [82.0, 365.5833333333333], [81.0, 487.9230769230769], [80.0, 418.0], [87.0, 460.23076923076917], [86.0, 413.79999999999995], [85.0, 515.8], [84.0, 487.8333333333333], [91.0, 391.0], [90.0, 566.4], [89.0, 577.5], [88.0, 399.07692307692304], [95.0, 502.9090909090909], [94.0, 524.25], [93.0, 503.5], [92.0, 514.2857142857143], [99.0, 550.5333333333333], [98.0, 552.1304347826086], [97.0, 569.5], [96.0, 458.00000000000006], [103.0, 555.125], [101.0, 554.25], [102.0, 514.4545454545455], [100.0, 490.06666666666666], [107.0, 498.8], [106.0, 558.6666666666666], [105.0, 564.4285714285713], [104.0, 615.4285714285714], [111.0, 465.1818181818182], [110.0, 627.1538461538462], [109.0, 641.4285714285714], [108.0, 792.3333333333334], [114.0, 621.0000000000001], [115.0, 659.0], [113.0, 663.7272727272727], [112.0, 692.5833333333333], [118.0, 608.75], [119.0, 630.6], [117.0, 508.25], [116.0, 657.0], [122.0, 702.4000000000001], [123.0, 699.4545454545455], [121.0, 609.5], [120.0, 681.1818181818181], [126.0, 668.7692307692308], [127.0, 645.3846153846152], [125.0, 602.6363636363636], [124.0, 669.3333333333334], [131.0, 564.9166666666666], [130.0, 621.7777777777778], [135.0, 635.5454545454545], [134.0, 549.1111111111112], [133.0, 548.4444444444445], [132.0, 532.8000000000001], [129.0, 626.1904761904761], [128.0, 643.8235294117646], [142.0, 735.0], [143.0, 831.85], [141.0, 653.0], [140.0, 729.2399999999999], [139.0, 786.15], [138.0, 569.5833333333334], [137.0, 680.1290322580644], [136.0, 650.4999999999999], [145.0, 845.5384615384614], [148.0, 781.375], [147.0, 795.0909090909091], [149.0, 610.3333333333334], [150.0, 724.5], [151.0, 816.1428571428571], [146.0, 668.2857142857143], [144.0, 827.7058823529412], [152.0, 789.1000000000001], [153.0, 796.1428571428571], [154.0, 845.5263157894738], [155.0, 893.090909090909], [156.0, 982.8333333333334], [159.0, 1261.5454545454545], [158.0, 938.1999999999999], [157.0, 1283.9], [161.0, 463.3333333333333], [167.0, 1073.0], [166.0, 858.0], [165.0, 1038.0], [164.0, 1019.0], [163.0, 886.0], [162.0, 1025.0], [160.0, 907.0], [175.0, 921.8], [174.0, 1058.0], [173.0, 1131.0], [172.0, 841.0], [171.0, 997.0], [170.0, 1006.0], [169.0, 972.0], [168.0, 858.0], [177.0, 854.3333333333333], [176.0, 938.0], [178.0, 697.6666666666666], [180.0, 947.0], [179.0, 1006.6666666666666], [183.0, 998.1666666666667], [182.0, 867.0], [181.0, 1150.0], [184.0, 1009.5], [185.0, 915.5], [187.0, 956.5], [189.0, 986.6666666666666], [188.0, 985.5], [191.0, 1043.3333333333333], [190.0, 1036.0], [186.0, 1029.0], [193.0, 1002.6666666666666], [195.0, 1059.0], [194.0, 926.0], [192.0, 337.0], [1.0, 1038.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[81.00100000000005, 458.93550000000084]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 195.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.54961922E12, "maxY": 14031.3, "series": [{"data": [[1.54961922E12, 14031.3]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961922E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 458.93550000000084, "minX": 1.54961922E12, "maxY": 458.93550000000084, "series": [{"data": [[1.54961922E12, 458.93550000000084]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961922E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 458.92499999999995, "minX": 1.54961922E12, "maxY": 458.92499999999995, "series": [{"data": [[1.54961922E12, 458.92499999999995]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961922E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 57.80549999999998, "minX": 1.54961922E12, "maxY": 57.80549999999998, "series": [{"data": [[1.54961922E12, 57.80549999999998]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961922E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 31.0, "minX": 1.54961922E12, "maxY": 2051.0, "series": [{"data": [[1.54961922E12, 2051.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961922E12, 31.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961922E12, 992.5000000000005]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961922E12, 1718.6100000000004]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961922E12, 1059.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 421.5, "minX": 33.0, "maxY": 421.5, "series": [{"data": [[33.0, 421.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 421.5, "minX": 33.0, "maxY": 421.5, "series": [{"data": [[33.0, 421.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961922E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961922E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961922E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961922E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961922E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961922E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961922E12, "title": "Transactions Per Second"}},
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
