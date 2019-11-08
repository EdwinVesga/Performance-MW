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
        data: {"result": {"minY": 32.0, "minX": 0.0, "maxY": 2243.0, "series": [{"data": [[0.0, 32.0], [0.1, 33.0], [0.2, 34.0], [0.3, 34.0], [0.4, 34.0], [0.5, 35.0], [0.6, 35.0], [0.7, 35.0], [0.8, 35.0], [0.9, 35.0], [1.0, 35.0], [1.1, 36.0], [1.2, 36.0], [1.3, 36.0], [1.4, 36.0], [1.5, 36.0], [1.6, 36.0], [1.7, 36.0], [1.8, 36.0], [1.9, 36.0], [2.0, 36.0], [2.1, 36.0], [2.2, 37.0], [2.3, 37.0], [2.4, 37.0], [2.5, 37.0], [2.6, 37.0], [2.7, 37.0], [2.8, 37.0], [2.9, 37.0], [3.0, 37.0], [3.1, 37.0], [3.2, 37.0], [3.3, 37.0], [3.4, 37.0], [3.5, 37.0], [3.6, 37.0], [3.7, 37.0], [3.8, 38.0], [3.9, 38.0], [4.0, 38.0], [4.1, 38.0], [4.2, 38.0], [4.3, 38.0], [4.4, 38.0], [4.5, 38.0], [4.6, 38.0], [4.7, 38.0], [4.8, 38.0], [4.9, 39.0], [5.0, 39.0], [5.1, 39.0], [5.2, 39.0], [5.3, 39.0], [5.4, 39.0], [5.5, 39.0], [5.6, 39.0], [5.7, 39.0], [5.8, 39.0], [5.9, 39.0], [6.0, 39.0], [6.1, 39.0], [6.2, 40.0], [6.3, 40.0], [6.4, 40.0], [6.5, 40.0], [6.6, 40.0], [6.7, 40.0], [6.8, 40.0], [6.9, 40.0], [7.0, 40.0], [7.1, 40.0], [7.2, 40.0], [7.3, 40.0], [7.4, 40.0], [7.5, 40.0], [7.6, 40.0], [7.7, 40.0], [7.8, 40.0], [7.9, 40.0], [8.0, 40.0], [8.1, 41.0], [8.2, 41.0], [8.3, 41.0], [8.4, 41.0], [8.5, 41.0], [8.6, 41.0], [8.7, 41.0], [8.8, 41.0], [8.9, 41.0], [9.0, 41.0], [9.1, 41.0], [9.2, 41.0], [9.3, 41.0], [9.4, 41.0], [9.5, 41.0], [9.6, 42.0], [9.7, 42.0], [9.8, 42.0], [9.9, 42.0], [10.0, 42.0], [10.1, 42.0], [10.2, 42.0], [10.3, 42.0], [10.4, 42.0], [10.5, 42.0], [10.6, 42.0], [10.7, 42.0], [10.8, 43.0], [10.9, 43.0], [11.0, 43.0], [11.1, 43.0], [11.2, 43.0], [11.3, 43.0], [11.4, 43.0], [11.5, 43.0], [11.6, 43.0], [11.7, 43.0], [11.8, 43.0], [11.9, 43.0], [12.0, 43.0], [12.1, 44.0], [12.2, 44.0], [12.3, 44.0], [12.4, 44.0], [12.5, 44.0], [12.6, 44.0], [12.7, 44.0], [12.8, 44.0], [12.9, 44.0], [13.0, 44.0], [13.1, 44.0], [13.2, 45.0], [13.3, 45.0], [13.4, 45.0], [13.5, 45.0], [13.6, 45.0], [13.7, 45.0], [13.8, 45.0], [13.9, 45.0], [14.0, 45.0], [14.1, 45.0], [14.2, 45.0], [14.3, 45.0], [14.4, 45.0], [14.5, 45.0], [14.6, 45.0], [14.7, 46.0], [14.8, 46.0], [14.9, 46.0], [15.0, 46.0], [15.1, 46.0], [15.2, 46.0], [15.3, 46.0], [15.4, 46.0], [15.5, 46.0], [15.6, 46.0], [15.7, 46.0], [15.8, 46.0], [15.9, 47.0], [16.0, 47.0], [16.1, 47.0], [16.2, 47.0], [16.3, 47.0], [16.4, 47.0], [16.5, 47.0], [16.6, 47.0], [16.7, 47.0], [16.8, 47.0], [16.9, 47.0], [17.0, 47.0], [17.1, 47.0], [17.2, 48.0], [17.3, 48.0], [17.4, 48.0], [17.5, 48.0], [17.6, 48.0], [17.7, 48.0], [17.8, 48.0], [17.9, 48.0], [18.0, 49.0], [18.1, 49.0], [18.2, 49.0], [18.3, 49.0], [18.4, 49.0], [18.5, 49.0], [18.6, 49.0], [18.7, 50.0], [18.8, 50.0], [18.9, 50.0], [19.0, 50.0], [19.1, 50.0], [19.2, 50.0], [19.3, 51.0], [19.4, 51.0], [19.5, 51.0], [19.6, 51.0], [19.7, 51.0], [19.8, 51.0], [19.9, 51.0], [20.0, 52.0], [20.1, 52.0], [20.2, 52.0], [20.3, 52.0], [20.4, 52.0], [20.5, 53.0], [20.6, 53.0], [20.7, 53.0], [20.8, 53.0], [20.9, 54.0], [21.0, 54.0], [21.1, 55.0], [21.2, 55.0], [21.3, 55.0], [21.4, 56.0], [21.5, 56.0], [21.6, 57.0], [21.7, 57.0], [21.8, 57.0], [21.9, 57.0], [22.0, 58.0], [22.1, 59.0], [22.2, 59.0], [22.3, 60.0], [22.4, 62.0], [22.5, 63.0], [22.6, 66.0], [22.7, 68.0], [22.8, 72.0], [22.9, 75.0], [23.0, 87.0], [23.1, 91.0], [23.2, 109.0], [23.3, 116.0], [23.4, 119.0], [23.5, 124.0], [23.6, 134.0], [23.7, 136.0], [23.8, 138.0], [23.9, 139.0], [24.0, 141.0], [24.1, 149.0], [24.2, 151.0], [24.3, 153.0], [24.4, 155.0], [24.5, 157.0], [24.6, 159.0], [24.7, 162.0], [24.8, 163.0], [24.9, 164.0], [25.0, 165.0], [25.1, 165.0], [25.2, 168.0], [25.3, 168.0], [25.4, 170.0], [25.5, 172.0], [25.6, 174.0], [25.7, 176.0], [25.8, 177.0], [25.9, 178.0], [26.0, 179.0], [26.1, 180.0], [26.2, 181.0], [26.3, 182.0], [26.4, 183.0], [26.5, 184.0], [26.6, 185.0], [26.7, 186.0], [26.8, 186.0], [26.9, 190.0], [27.0, 191.0], [27.1, 192.0], [27.2, 194.0], [27.3, 195.0], [27.4, 197.0], [27.5, 198.0], [27.6, 198.0], [27.7, 200.0], [27.8, 201.0], [27.9, 201.0], [28.0, 202.0], [28.1, 204.0], [28.2, 206.0], [28.3, 207.0], [28.4, 208.0], [28.5, 208.0], [28.6, 209.0], [28.7, 210.0], [28.8, 211.0], [28.9, 213.0], [29.0, 214.0], [29.1, 215.0], [29.2, 217.0], [29.3, 218.0], [29.4, 219.0], [29.5, 219.0], [29.6, 220.0], [29.7, 221.0], [29.8, 221.0], [29.9, 222.0], [30.0, 222.0], [30.1, 223.0], [30.2, 225.0], [30.3, 225.0], [30.4, 227.0], [30.5, 229.0], [30.6, 229.0], [30.7, 231.0], [30.8, 232.0], [30.9, 232.0], [31.0, 233.0], [31.1, 233.0], [31.2, 236.0], [31.3, 237.0], [31.4, 237.0], [31.5, 238.0], [31.6, 239.0], [31.7, 239.0], [31.8, 241.0], [31.9, 242.0], [32.0, 244.0], [32.1, 244.0], [32.2, 246.0], [32.3, 247.0], [32.4, 247.0], [32.5, 250.0], [32.6, 252.0], [32.7, 253.0], [32.8, 253.0], [32.9, 254.0], [33.0, 254.0], [33.1, 255.0], [33.2, 255.0], [33.3, 257.0], [33.4, 259.0], [33.5, 261.0], [33.6, 261.0], [33.7, 262.0], [33.8, 263.0], [33.9, 264.0], [34.0, 265.0], [34.1, 265.0], [34.2, 266.0], [34.3, 267.0], [34.4, 269.0], [34.5, 269.0], [34.6, 270.0], [34.7, 271.0], [34.8, 273.0], [34.9, 273.0], [35.0, 274.0], [35.1, 274.0], [35.2, 275.0], [35.3, 276.0], [35.4, 277.0], [35.5, 278.0], [35.6, 278.0], [35.7, 279.0], [35.8, 280.0], [35.9, 280.0], [36.0, 281.0], [36.1, 282.0], [36.2, 283.0], [36.3, 286.0], [36.4, 289.0], [36.5, 291.0], [36.6, 292.0], [36.7, 292.0], [36.8, 293.0], [36.9, 294.0], [37.0, 295.0], [37.1, 297.0], [37.2, 297.0], [37.3, 300.0], [37.4, 300.0], [37.5, 300.0], [37.6, 302.0], [37.7, 303.0], [37.8, 304.0], [37.9, 305.0], [38.0, 306.0], [38.1, 308.0], [38.2, 309.0], [38.3, 310.0], [38.4, 310.0], [38.5, 310.0], [38.6, 311.0], [38.7, 313.0], [38.8, 315.0], [38.9, 315.0], [39.0, 316.0], [39.1, 318.0], [39.2, 319.0], [39.3, 321.0], [39.4, 322.0], [39.5, 323.0], [39.6, 325.0], [39.7, 326.0], [39.8, 327.0], [39.9, 328.0], [40.0, 329.0], [40.1, 332.0], [40.2, 332.0], [40.3, 333.0], [40.4, 334.0], [40.5, 335.0], [40.6, 337.0], [40.7, 338.0], [40.8, 338.0], [40.9, 340.0], [41.0, 340.0], [41.1, 341.0], [41.2, 341.0], [41.3, 343.0], [41.4, 343.0], [41.5, 344.0], [41.6, 345.0], [41.7, 345.0], [41.8, 347.0], [41.9, 348.0], [42.0, 349.0], [42.1, 351.0], [42.2, 351.0], [42.3, 351.0], [42.4, 353.0], [42.5, 353.0], [42.6, 353.0], [42.7, 355.0], [42.8, 356.0], [42.9, 357.0], [43.0, 359.0], [43.1, 359.0], [43.2, 360.0], [43.3, 361.0], [43.4, 364.0], [43.5, 365.0], [43.6, 366.0], [43.7, 366.0], [43.8, 367.0], [43.9, 369.0], [44.0, 369.0], [44.1, 370.0], [44.2, 371.0], [44.3, 372.0], [44.4, 372.0], [44.5, 374.0], [44.6, 374.0], [44.7, 377.0], [44.8, 377.0], [44.9, 378.0], [45.0, 378.0], [45.1, 380.0], [45.2, 382.0], [45.3, 383.0], [45.4, 385.0], [45.5, 385.0], [45.6, 385.0], [45.7, 386.0], [45.8, 387.0], [45.9, 388.0], [46.0, 391.0], [46.1, 393.0], [46.2, 393.0], [46.3, 395.0], [46.4, 395.0], [46.5, 396.0], [46.6, 397.0], [46.7, 398.0], [46.8, 399.0], [46.9, 401.0], [47.0, 402.0], [47.1, 405.0], [47.2, 405.0], [47.3, 406.0], [47.4, 409.0], [47.5, 410.0], [47.6, 411.0], [47.7, 411.0], [47.8, 412.0], [47.9, 412.0], [48.0, 414.0], [48.1, 415.0], [48.2, 416.0], [48.3, 416.0], [48.4, 416.0], [48.5, 417.0], [48.6, 418.0], [48.7, 418.0], [48.8, 421.0], [48.9, 421.0], [49.0, 423.0], [49.1, 423.0], [49.2, 424.0], [49.3, 425.0], [49.4, 425.0], [49.5, 427.0], [49.6, 428.0], [49.7, 428.0], [49.8, 428.0], [49.9, 429.0], [50.0, 430.0], [50.1, 434.0], [50.2, 434.0], [50.3, 436.0], [50.4, 436.0], [50.5, 436.0], [50.6, 437.0], [50.7, 437.0], [50.8, 437.0], [50.9, 438.0], [51.0, 439.0], [51.1, 439.0], [51.2, 441.0], [51.3, 441.0], [51.4, 444.0], [51.5, 446.0], [51.6, 446.0], [51.7, 447.0], [51.8, 448.0], [51.9, 450.0], [52.0, 451.0], [52.1, 451.0], [52.2, 452.0], [52.3, 454.0], [52.4, 454.0], [52.5, 457.0], [52.6, 458.0], [52.7, 459.0], [52.8, 461.0], [52.9, 461.0], [53.0, 463.0], [53.1, 463.0], [53.2, 464.0], [53.3, 464.0], [53.4, 464.0], [53.5, 465.0], [53.6, 465.0], [53.7, 466.0], [53.8, 466.0], [53.9, 470.0], [54.0, 471.0], [54.1, 472.0], [54.2, 472.0], [54.3, 472.0], [54.4, 472.0], [54.5, 473.0], [54.6, 474.0], [54.7, 475.0], [54.8, 476.0], [54.9, 477.0], [55.0, 477.0], [55.1, 477.0], [55.2, 479.0], [55.3, 481.0], [55.4, 482.0], [55.5, 484.0], [55.6, 484.0], [55.7, 486.0], [55.8, 487.0], [55.9, 487.0], [56.0, 488.0], [56.1, 490.0], [56.2, 490.0], [56.3, 491.0], [56.4, 492.0], [56.5, 493.0], [56.6, 496.0], [56.7, 497.0], [56.8, 498.0], [56.9, 499.0], [57.0, 499.0], [57.1, 501.0], [57.2, 502.0], [57.3, 504.0], [57.4, 504.0], [57.5, 505.0], [57.6, 505.0], [57.7, 506.0], [57.8, 507.0], [57.9, 510.0], [58.0, 511.0], [58.1, 512.0], [58.2, 512.0], [58.3, 512.0], [58.4, 513.0], [58.5, 513.0], [58.6, 514.0], [58.7, 515.0], [58.8, 517.0], [58.9, 518.0], [59.0, 519.0], [59.1, 520.0], [59.2, 523.0], [59.3, 523.0], [59.4, 524.0], [59.5, 525.0], [59.6, 526.0], [59.7, 528.0], [59.8, 529.0], [59.9, 529.0], [60.0, 530.0], [60.1, 531.0], [60.2, 533.0], [60.3, 533.0], [60.4, 534.0], [60.5, 535.0], [60.6, 535.0], [60.7, 537.0], [60.8, 538.0], [60.9, 538.0], [61.0, 540.0], [61.1, 540.0], [61.2, 541.0], [61.3, 541.0], [61.4, 542.0], [61.5, 543.0], [61.6, 544.0], [61.7, 545.0], [61.8, 545.0], [61.9, 546.0], [62.0, 547.0], [62.1, 548.0], [62.2, 549.0], [62.3, 550.0], [62.4, 550.0], [62.5, 551.0], [62.6, 552.0], [62.7, 553.0], [62.8, 555.0], [62.9, 556.0], [63.0, 557.0], [63.1, 558.0], [63.2, 560.0], [63.3, 560.0], [63.4, 561.0], [63.5, 561.0], [63.6, 564.0], [63.7, 565.0], [63.8, 567.0], [63.9, 567.0], [64.0, 569.0], [64.1, 570.0], [64.2, 571.0], [64.3, 572.0], [64.4, 573.0], [64.5, 574.0], [64.6, 575.0], [64.7, 576.0], [64.8, 576.0], [64.9, 576.0], [65.0, 577.0], [65.1, 577.0], [65.2, 579.0], [65.3, 579.0], [65.4, 580.0], [65.5, 581.0], [65.6, 582.0], [65.7, 582.0], [65.8, 584.0], [65.9, 585.0], [66.0, 585.0], [66.1, 587.0], [66.2, 588.0], [66.3, 588.0], [66.4, 589.0], [66.5, 590.0], [66.6, 591.0], [66.7, 591.0], [66.8, 592.0], [66.9, 593.0], [67.0, 593.0], [67.1, 594.0], [67.2, 596.0], [67.3, 596.0], [67.4, 597.0], [67.5, 598.0], [67.6, 601.0], [67.7, 601.0], [67.8, 601.0], [67.9, 602.0], [68.0, 604.0], [68.1, 604.0], [68.2, 604.0], [68.3, 605.0], [68.4, 606.0], [68.5, 607.0], [68.6, 607.0], [68.7, 609.0], [68.8, 611.0], [68.9, 612.0], [69.0, 613.0], [69.1, 616.0], [69.2, 616.0], [69.3, 618.0], [69.4, 619.0], [69.5, 619.0], [69.6, 621.0], [69.7, 622.0], [69.8, 622.0], [69.9, 624.0], [70.0, 626.0], [70.1, 627.0], [70.2, 627.0], [70.3, 628.0], [70.4, 628.0], [70.5, 628.0], [70.6, 629.0], [70.7, 630.0], [70.8, 630.0], [70.9, 630.0], [71.0, 631.0], [71.1, 633.0], [71.2, 634.0], [71.3, 635.0], [71.4, 635.0], [71.5, 637.0], [71.6, 637.0], [71.7, 639.0], [71.8, 640.0], [71.9, 641.0], [72.0, 641.0], [72.1, 642.0], [72.2, 642.0], [72.3, 645.0], [72.4, 646.0], [72.5, 648.0], [72.6, 648.0], [72.7, 650.0], [72.8, 650.0], [72.9, 651.0], [73.0, 651.0], [73.1, 652.0], [73.2, 654.0], [73.3, 657.0], [73.4, 657.0], [73.5, 657.0], [73.6, 660.0], [73.7, 660.0], [73.8, 661.0], [73.9, 663.0], [74.0, 664.0], [74.1, 665.0], [74.2, 665.0], [74.3, 669.0], [74.4, 669.0], [74.5, 670.0], [74.6, 673.0], [74.7, 675.0], [74.8, 677.0], [74.9, 678.0], [75.0, 679.0], [75.1, 683.0], [75.2, 683.0], [75.3, 684.0], [75.4, 686.0], [75.5, 686.0], [75.6, 687.0], [75.7, 688.0], [75.8, 688.0], [75.9, 691.0], [76.0, 692.0], [76.1, 693.0], [76.2, 694.0], [76.3, 694.0], [76.4, 695.0], [76.5, 696.0], [76.6, 697.0], [76.7, 701.0], [76.8, 702.0], [76.9, 703.0], [77.0, 704.0], [77.1, 705.0], [77.2, 706.0], [77.3, 707.0], [77.4, 709.0], [77.5, 710.0], [77.6, 710.0], [77.7, 713.0], [77.8, 714.0], [77.9, 716.0], [78.0, 717.0], [78.1, 718.0], [78.2, 719.0], [78.3, 722.0], [78.4, 722.0], [78.5, 727.0], [78.6, 727.0], [78.7, 728.0], [78.8, 728.0], [78.9, 729.0], [79.0, 730.0], [79.1, 732.0], [79.2, 734.0], [79.3, 735.0], [79.4, 736.0], [79.5, 737.0], [79.6, 737.0], [79.7, 738.0], [79.8, 738.0], [79.9, 742.0], [80.0, 744.0], [80.1, 746.0], [80.2, 750.0], [80.3, 751.0], [80.4, 752.0], [80.5, 753.0], [80.6, 754.0], [80.7, 755.0], [80.8, 757.0], [80.9, 759.0], [81.0, 760.0], [81.1, 761.0], [81.2, 762.0], [81.3, 763.0], [81.4, 764.0], [81.5, 764.0], [81.6, 765.0], [81.7, 767.0], [81.8, 771.0], [81.9, 772.0], [82.0, 773.0], [82.1, 773.0], [82.2, 775.0], [82.3, 776.0], [82.4, 776.0], [82.5, 777.0], [82.6, 779.0], [82.7, 784.0], [82.8, 787.0], [82.9, 788.0], [83.0, 791.0], [83.1, 792.0], [83.2, 794.0], [83.3, 796.0], [83.4, 798.0], [83.5, 802.0], [83.6, 803.0], [83.7, 803.0], [83.8, 805.0], [83.9, 807.0], [84.0, 810.0], [84.1, 810.0], [84.2, 812.0], [84.3, 814.0], [84.4, 815.0], [84.5, 817.0], [84.6, 820.0], [84.7, 822.0], [84.8, 825.0], [84.9, 828.0], [85.0, 830.0], [85.1, 831.0], [85.2, 831.0], [85.3, 833.0], [85.4, 835.0], [85.5, 836.0], [85.6, 837.0], [85.7, 841.0], [85.8, 842.0], [85.9, 844.0], [86.0, 844.0], [86.1, 847.0], [86.2, 848.0], [86.3, 849.0], [86.4, 850.0], [86.5, 853.0], [86.6, 854.0], [86.7, 855.0], [86.8, 856.0], [86.9, 857.0], [87.0, 859.0], [87.1, 861.0], [87.2, 865.0], [87.3, 867.0], [87.4, 870.0], [87.5, 872.0], [87.6, 875.0], [87.7, 878.0], [87.8, 878.0], [87.9, 881.0], [88.0, 882.0], [88.1, 884.0], [88.2, 886.0], [88.3, 887.0], [88.4, 889.0], [88.5, 892.0], [88.6, 894.0], [88.7, 895.0], [88.8, 901.0], [88.9, 903.0], [89.0, 906.0], [89.1, 910.0], [89.2, 916.0], [89.3, 927.0], [89.4, 929.0], [89.5, 930.0], [89.6, 931.0], [89.7, 935.0], [89.8, 937.0], [89.9, 941.0], [90.0, 942.0], [90.1, 949.0], [90.2, 951.0], [90.3, 960.0], [90.4, 965.0], [90.5, 967.0], [90.6, 967.0], [90.7, 968.0], [90.8, 973.0], [90.9, 978.0], [91.0, 981.0], [91.1, 984.0], [91.2, 988.0], [91.3, 995.0], [91.4, 997.0], [91.5, 997.0], [91.6, 1001.0], [91.7, 1006.0], [91.8, 1012.0], [91.9, 1015.0], [92.0, 1027.0], [92.1, 1032.0], [92.2, 1035.0], [92.3, 1038.0], [92.4, 1052.0], [92.5, 1055.0], [92.6, 1059.0], [92.7, 1076.0], [92.8, 1077.0], [92.9, 1081.0], [93.0, 1086.0], [93.1, 1091.0], [93.2, 1113.0], [93.3, 1115.0], [93.4, 1121.0], [93.5, 1135.0], [93.6, 1155.0], [93.7, 1162.0], [93.8, 1168.0], [93.9, 1182.0], [94.0, 1203.0], [94.1, 1232.0], [94.2, 1276.0], [94.3, 1335.0], [94.4, 1342.0], [94.5, 1351.0], [94.6, 1357.0], [94.7, 1362.0], [94.8, 1373.0], [94.9, 1377.0], [95.0, 1388.0], [95.1, 1389.0], [95.2, 1393.0], [95.3, 1396.0], [95.4, 1402.0], [95.5, 1406.0], [95.6, 1417.0], [95.7, 1423.0], [95.8, 1429.0], [95.9, 1439.0], [96.0, 1453.0], [96.1, 1468.0], [96.2, 1480.0], [96.3, 1497.0], [96.4, 1504.0], [96.5, 1510.0], [96.6, 1517.0], [96.7, 1519.0], [96.8, 1532.0], [96.9, 1533.0], [97.0, 1534.0], [97.1, 1550.0], [97.2, 1554.0], [97.3, 1557.0], [97.4, 1570.0], [97.5, 1574.0], [97.6, 1580.0], [97.7, 1591.0], [97.8, 1602.0], [97.9, 1604.0], [98.0, 1609.0], [98.1, 1623.0], [98.2, 1650.0], [98.3, 1657.0], [98.4, 1670.0], [98.5, 1689.0], [98.6, 1706.0], [98.7, 1712.0], [98.8, 1744.0], [98.9, 1768.0], [99.0, 1787.0], [99.1, 1789.0], [99.2, 1817.0], [99.3, 1864.0], [99.4, 1880.0], [99.5, 1899.0], [99.6, 1935.0], [99.7, 2019.0], [99.8, 2036.0], [99.9, 2150.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 463.0, "series": [{"data": [[0.0, 463.0], [2100.0, 1.0], [2200.0, 1.0], [600.0, 183.0], [700.0, 136.0], [200.0, 193.0], [800.0, 106.0], [900.0, 56.0], [1000.0, 32.0], [1100.0, 16.0], [300.0, 192.0], [1200.0, 6.0], [1300.0, 22.0], [1400.0, 19.0], [1500.0, 29.0], [100.0, 89.0], [400.0, 204.0], [1600.0, 16.0], [1700.0, 11.0], [1800.0, 8.0], [1900.0, 2.0], [500.0, 210.0], [2000.0, 5.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 73.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1142.0, "series": [{"data": [[1.0, 785.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1142.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 73.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 85.61299999999993, "minX": 1.54961904E12, "maxY": 85.61299999999993, "series": [{"data": [[1.54961904E12, 85.61299999999993]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 40.13636363636363, "minX": 1.0, "maxY": 1441.0, "series": [{"data": [[3.0, 585.8], [4.0, 192.11111111111111], [5.0, 73.17647058823529], [6.0, 78.45945945945945], [7.0, 40.13636363636363], [8.0, 53.39166666666666], [9.0, 69.8706896551724], [10.0, 69.56338028169014], [11.0, 175.33333333333331], [12.0, 193.41666666666666], [13.0, 78.5], [14.0, 1147.6666666666667], [15.0, 735.5], [16.0, 810.5], [17.0, 133.0], [18.0, 833.5], [19.0, 148.5], [20.0, 377.66666666666663], [21.0, 847.25], [22.0, 842.5], [23.0, 425.0], [24.0, 766.0], [25.0, 516.0], [26.0, 178.0], [27.0, 1116.0], [28.0, 877.5], [29.0, 256.0], [30.0, 1064.0], [31.0, 912.0], [33.0, 671.0], [32.0, 776.0], [35.0, 383.2857142857143], [34.0, 462.33333333333337], [37.0, 415.3333333333333], [36.0, 394.6666666666667], [39.0, 315.0], [38.0, 453.8333333333333], [41.0, 345.2307692307692], [40.0, 210.42857142857144], [43.0, 283.58333333333337], [42.0, 301.08333333333337], [45.0, 370.42857142857144], [44.0, 232.66666666666666], [47.0, 492.70000000000005], [46.0, 272.0], [49.0, 411.0], [48.0, 380.18181818181824], [50.0, 270.625], [51.0, 389.0], [53.0, 323.77272727272737], [52.0, 356.6], [55.0, 299.6666666666667], [54.0, 356.7333333333333], [57.0, 321.0], [56.0, 393.7272727272727], [59.0, 366.125], [58.0, 364.92307692307685], [61.0, 358.74999999999994], [60.0, 328.8125], [63.0, 661.6666666666667], [62.0, 532.6], [67.0, 381.94736842105266], [66.0, 371.66666666666663], [65.0, 362.2666666666667], [64.0, 407.58333333333337], [71.0, 450.0], [70.0, 444.875], [69.0, 350.75], [68.0, 377.0], [75.0, 420.0], [74.0, 485.77777777777777], [73.0, 412.3636363636364], [72.0, 538.8571428571429], [79.0, 494.33333333333337], [78.0, 619.75], [77.0, 706.8], [76.0, 573.4], [83.0, 1072.0], [82.0, 1118.0], [81.0, 436.2], [80.0, 834.3333333333333], [87.0, 1083.0], [86.0, 444.5], [85.0, 512.6666666666666], [84.0, 617.25], [91.0, 567.0], [90.0, 1067.5], [89.0, 486.5], [88.0, 615.6666666666666], [95.0, 569.5], [94.0, 591.7142857142857], [93.0, 625.5], [92.0, 954.5], [98.0, 468.3], [99.0, 534.8], [97.0, 496.8333333333333], [96.0, 524.625], [103.0, 522.8571428571429], [102.0, 540.4210526315788], [101.0, 604.0], [100.0, 601.7777777777778], [107.0, 506.0], [106.0, 567.5], [105.0, 565.0], [104.0, 533.4], [111.0, 619.5454545454545], [110.0, 540.125], [109.0, 512.5], [108.0, 521.3333333333334], [114.0, 641.0625], [115.0, 610.6], [113.0, 576.0869565217391], [112.0, 645.3529411764707], [116.0, 531.6], [117.0, 621.3749999999999], [119.0, 609.6666666666667], [118.0, 633.2], [123.0, 696.9000000000001], [122.0, 677.0], [121.0, 636.3333333333334], [120.0, 625.4285714285714], [127.0, 640.0476190476189], [126.0, 608.3636363636364], [125.0, 560.3333333333333], [124.0, 587.8571428571429], [134.0, 545.875], [135.0, 550.2857142857143], [133.0, 645.6], [132.0, 652.0], [131.0, 748.5], [130.0, 731.2857142857142], [129.0, 673.8125], [128.0, 673.5833333333334], [141.0, 559.9230769230769], [142.0, 615.2727272727273], [143.0, 722.2142857142857], [140.0, 661.8333333333333], [139.0, 646.1666666666666], [138.0, 571.4285714285714], [137.0, 581.2857142857143], [136.0, 661.5], [144.0, 705.0909090909091], [145.0, 479.1818181818182], [151.0, 773.6999999999999], [150.0, 637.0], [149.0, 765.8888888888889], [148.0, 729.2727272727271], [147.0, 553.88], [146.0, 680.6764705882354], [152.0, 704.9473684210525], [155.0, 961.315789473684], [154.0, 731.1111111111111], [153.0, 868.2258064516128], [156.0, 1285.9166666666667], [158.0, 899.2142857142858], [159.0, 769.9375], [157.0, 977.875], [161.0, 961.4375000000001], [162.0, 737.4444444444446], [160.0, 903.2173913043479], [163.0, 1119.111111111111], [164.0, 981.3529411764706], [165.0, 859.125], [166.0, 911.5714285714286], [167.0, 562.5], [170.0, 973.0], [172.0, 608.6666666666666], [175.0, 684.2857142857142], [174.0, 659.7142857142858], [173.0, 493.4], [171.0, 614.5], [169.0, 550.0], [168.0, 397.0], [177.0, 896.8], [179.0, 483.75], [178.0, 803.5555555555555], [181.0, 935.1999999999999], [182.0, 784.8666666666666], [183.0, 870.8571428571429], [180.0, 891.25], [176.0, 801.4], [184.0, 742.2857142857143], [186.0, 970.7142857142857], [185.0, 896.8333333333333], [190.0, 1001.0], [189.0, 981.0], [188.0, 632.0], [187.0, 963.5], [1.0, 1441.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[85.61299999999993, 480.4695000000001]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 190.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.54961904E12, "maxY": 14030.866666666667, "series": [{"data": [[1.54961904E12, 14030.866666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961904E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 480.4695000000001, "minX": 1.54961904E12, "maxY": 480.4695000000001, "series": [{"data": [[1.54961904E12, 480.4695000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 480.46299999999985, "minX": 1.54961904E12, "maxY": 480.46299999999985, "series": [{"data": [[1.54961904E12, 480.46299999999985]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 57.78399999999996, "minX": 1.54961904E12, "maxY": 57.78399999999996, "series": [{"data": [[1.54961904E12, 57.78399999999996]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 32.0, "minX": 1.54961904E12, "maxY": 2243.0, "series": [{"data": [[1.54961904E12, 2243.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961904E12, 32.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961904E12, 941.9000000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961904E12, 1786.91]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961904E12, 1387.5999999999985]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 430.0, "minX": 33.0, "maxY": 430.0, "series": [{"data": [[33.0, 430.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 430.0, "minX": 33.0, "maxY": 430.0, "series": [{"data": [[33.0, 430.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961904E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961904E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961904E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961904E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961904E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961904E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Transactions Per Second"}},
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
