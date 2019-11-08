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
        data: {"result": {"minY": 32.0, "minX": 0.0, "maxY": 1987.0, "series": [{"data": [[0.0, 32.0], [0.1, 33.0], [0.2, 34.0], [0.3, 34.0], [0.4, 34.0], [0.5, 34.0], [0.6, 35.0], [0.7, 35.0], [0.8, 35.0], [0.9, 35.0], [1.0, 35.0], [1.1, 35.0], [1.2, 35.0], [1.3, 36.0], [1.4, 36.0], [1.5, 36.0], [1.6, 36.0], [1.7, 36.0], [1.8, 36.0], [1.9, 36.0], [2.0, 36.0], [2.1, 36.0], [2.2, 36.0], [2.3, 36.0], [2.4, 37.0], [2.5, 37.0], [2.6, 37.0], [2.7, 37.0], [2.8, 37.0], [2.9, 37.0], [3.0, 37.0], [3.1, 37.0], [3.2, 37.0], [3.3, 37.0], [3.4, 37.0], [3.5, 38.0], [3.6, 38.0], [3.7, 38.0], [3.8, 38.0], [3.9, 38.0], [4.0, 38.0], [4.1, 38.0], [4.2, 38.0], [4.3, 38.0], [4.4, 38.0], [4.5, 38.0], [4.6, 38.0], [4.7, 38.0], [4.8, 38.0], [4.9, 38.0], [5.0, 38.0], [5.1, 39.0], [5.2, 39.0], [5.3, 39.0], [5.4, 39.0], [5.5, 39.0], [5.6, 39.0], [5.7, 39.0], [5.8, 39.0], [5.9, 39.0], [6.0, 39.0], [6.1, 39.0], [6.2, 39.0], [6.3, 39.0], [6.4, 39.0], [6.5, 39.0], [6.6, 40.0], [6.7, 40.0], [6.8, 40.0], [6.9, 40.0], [7.0, 40.0], [7.1, 40.0], [7.2, 40.0], [7.3, 40.0], [7.4, 40.0], [7.5, 40.0], [7.6, 40.0], [7.7, 40.0], [7.8, 40.0], [7.9, 40.0], [8.0, 40.0], [8.1, 40.0], [8.2, 40.0], [8.3, 41.0], [8.4, 41.0], [8.5, 41.0], [8.6, 41.0], [8.7, 41.0], [8.8, 41.0], [8.9, 41.0], [9.0, 41.0], [9.1, 41.0], [9.2, 41.0], [9.3, 41.0], [9.4, 41.0], [9.5, 41.0], [9.6, 41.0], [9.7, 41.0], [9.8, 41.0], [9.9, 41.0], [10.0, 41.0], [10.1, 41.0], [10.2, 42.0], [10.3, 42.0], [10.4, 42.0], [10.5, 42.0], [10.6, 42.0], [10.7, 42.0], [10.8, 42.0], [10.9, 42.0], [11.0, 42.0], [11.1, 42.0], [11.2, 42.0], [11.3, 42.0], [11.4, 42.0], [11.5, 42.0], [11.6, 42.0], [11.7, 42.0], [11.8, 42.0], [11.9, 43.0], [12.0, 43.0], [12.1, 43.0], [12.2, 43.0], [12.3, 43.0], [12.4, 43.0], [12.5, 43.0], [12.6, 43.0], [12.7, 43.0], [12.8, 43.0], [12.9, 43.0], [13.0, 43.0], [13.1, 43.0], [13.2, 43.0], [13.3, 43.0], [13.4, 43.0], [13.5, 43.0], [13.6, 43.0], [13.7, 43.0], [13.8, 43.0], [13.9, 44.0], [14.0, 44.0], [14.1, 44.0], [14.2, 44.0], [14.3, 44.0], [14.4, 44.0], [14.5, 44.0], [14.6, 44.0], [14.7, 44.0], [14.8, 44.0], [14.9, 44.0], [15.0, 44.0], [15.1, 44.0], [15.2, 44.0], [15.3, 44.0], [15.4, 44.0], [15.5, 44.0], [15.6, 44.0], [15.7, 44.0], [15.8, 45.0], [15.9, 45.0], [16.0, 45.0], [16.1, 45.0], [16.2, 45.0], [16.3, 45.0], [16.4, 45.0], [16.5, 45.0], [16.6, 45.0], [16.7, 45.0], [16.8, 45.0], [16.9, 46.0], [17.0, 46.0], [17.1, 46.0], [17.2, 46.0], [17.3, 46.0], [17.4, 46.0], [17.5, 46.0], [17.6, 46.0], [17.7, 46.0], [17.8, 46.0], [17.9, 46.0], [18.0, 46.0], [18.1, 46.0], [18.2, 46.0], [18.3, 47.0], [18.4, 47.0], [18.5, 47.0], [18.6, 47.0], [18.7, 47.0], [18.8, 47.0], [18.9, 47.0], [19.0, 47.0], [19.1, 47.0], [19.2, 48.0], [19.3, 48.0], [19.4, 48.0], [19.5, 48.0], [19.6, 48.0], [19.7, 48.0], [19.8, 48.0], [19.9, 48.0], [20.0, 48.0], [20.1, 48.0], [20.2, 48.0], [20.3, 48.0], [20.4, 49.0], [20.5, 49.0], [20.6, 49.0], [20.7, 49.0], [20.8, 49.0], [20.9, 49.0], [21.0, 49.0], [21.1, 50.0], [21.2, 50.0], [21.3, 50.0], [21.4, 50.0], [21.5, 51.0], [21.6, 51.0], [21.7, 51.0], [21.8, 51.0], [21.9, 51.0], [22.0, 52.0], [22.1, 52.0], [22.2, 52.0], [22.3, 53.0], [22.4, 53.0], [22.5, 53.0], [22.6, 54.0], [22.7, 54.0], [22.8, 55.0], [22.9, 55.0], [23.0, 55.0], [23.1, 56.0], [23.2, 57.0], [23.3, 58.0], [23.4, 61.0], [23.5, 63.0], [23.6, 65.0], [23.7, 71.0], [23.8, 86.0], [23.9, 95.0], [24.0, 104.0], [24.1, 111.0], [24.2, 114.0], [24.3, 118.0], [24.4, 121.0], [24.5, 128.0], [24.6, 137.0], [24.7, 139.0], [24.8, 142.0], [24.9, 144.0], [25.0, 147.0], [25.1, 148.0], [25.2, 151.0], [25.3, 155.0], [25.4, 156.0], [25.5, 158.0], [25.6, 158.0], [25.7, 159.0], [25.8, 160.0], [25.9, 163.0], [26.0, 164.0], [26.1, 167.0], [26.2, 167.0], [26.3, 168.0], [26.4, 171.0], [26.5, 171.0], [26.6, 172.0], [26.7, 173.0], [26.8, 174.0], [26.9, 175.0], [27.0, 177.0], [27.1, 178.0], [27.2, 179.0], [27.3, 179.0], [27.4, 180.0], [27.5, 181.0], [27.6, 182.0], [27.7, 183.0], [27.8, 185.0], [27.9, 185.0], [28.0, 186.0], [28.1, 186.0], [28.2, 188.0], [28.3, 189.0], [28.4, 190.0], [28.5, 191.0], [28.6, 192.0], [28.7, 192.0], [28.8, 192.0], [28.9, 193.0], [29.0, 194.0], [29.1, 195.0], [29.2, 196.0], [29.3, 198.0], [29.4, 199.0], [29.5, 199.0], [29.6, 200.0], [29.7, 201.0], [29.8, 205.0], [29.9, 206.0], [30.0, 206.0], [30.1, 208.0], [30.2, 210.0], [30.3, 210.0], [30.4, 212.0], [30.5, 213.0], [30.6, 213.0], [30.7, 214.0], [30.8, 215.0], [30.9, 215.0], [31.0, 217.0], [31.1, 218.0], [31.2, 220.0], [31.3, 221.0], [31.4, 221.0], [31.5, 223.0], [31.6, 224.0], [31.7, 225.0], [31.8, 227.0], [31.9, 227.0], [32.0, 227.0], [32.1, 229.0], [32.2, 229.0], [32.3, 230.0], [32.4, 231.0], [32.5, 232.0], [32.6, 233.0], [32.7, 233.0], [32.8, 234.0], [32.9, 235.0], [33.0, 236.0], [33.1, 237.0], [33.2, 239.0], [33.3, 239.0], [33.4, 241.0], [33.5, 242.0], [33.6, 244.0], [33.7, 244.0], [33.8, 245.0], [33.9, 246.0], [34.0, 247.0], [34.1, 247.0], [34.2, 248.0], [34.3, 249.0], [34.4, 251.0], [34.5, 252.0], [34.6, 253.0], [34.7, 253.0], [34.8, 255.0], [34.9, 255.0], [35.0, 256.0], [35.1, 258.0], [35.2, 259.0], [35.3, 260.0], [35.4, 260.0], [35.5, 261.0], [35.6, 261.0], [35.7, 262.0], [35.8, 263.0], [35.9, 264.0], [36.0, 265.0], [36.1, 266.0], [36.2, 267.0], [36.3, 268.0], [36.4, 269.0], [36.5, 270.0], [36.6, 271.0], [36.7, 271.0], [36.8, 271.0], [36.9, 271.0], [37.0, 272.0], [37.1, 274.0], [37.2, 275.0], [37.3, 276.0], [37.4, 277.0], [37.5, 278.0], [37.6, 278.0], [37.7, 280.0], [37.8, 281.0], [37.9, 282.0], [38.0, 283.0], [38.1, 285.0], [38.2, 286.0], [38.3, 286.0], [38.4, 288.0], [38.5, 288.0], [38.6, 290.0], [38.7, 291.0], [38.8, 292.0], [38.9, 292.0], [39.0, 293.0], [39.1, 294.0], [39.2, 295.0], [39.3, 296.0], [39.4, 296.0], [39.5, 297.0], [39.6, 297.0], [39.7, 298.0], [39.8, 300.0], [39.9, 301.0], [40.0, 301.0], [40.1, 302.0], [40.2, 303.0], [40.3, 306.0], [40.4, 306.0], [40.5, 308.0], [40.6, 310.0], [40.7, 310.0], [40.8, 311.0], [40.9, 313.0], [41.0, 313.0], [41.1, 313.0], [41.2, 314.0], [41.3, 315.0], [41.4, 315.0], [41.5, 316.0], [41.6, 317.0], [41.7, 318.0], [41.8, 318.0], [41.9, 319.0], [42.0, 319.0], [42.1, 319.0], [42.2, 320.0], [42.3, 321.0], [42.4, 322.0], [42.5, 322.0], [42.6, 324.0], [42.7, 324.0], [42.8, 324.0], [42.9, 325.0], [43.0, 326.0], [43.1, 326.0], [43.2, 327.0], [43.3, 328.0], [43.4, 328.0], [43.5, 329.0], [43.6, 331.0], [43.7, 331.0], [43.8, 333.0], [43.9, 333.0], [44.0, 334.0], [44.1, 334.0], [44.2, 335.0], [44.3, 336.0], [44.4, 336.0], [44.5, 337.0], [44.6, 338.0], [44.7, 339.0], [44.8, 340.0], [44.9, 341.0], [45.0, 341.0], [45.1, 342.0], [45.2, 343.0], [45.3, 344.0], [45.4, 345.0], [45.5, 347.0], [45.6, 347.0], [45.7, 350.0], [45.8, 353.0], [45.9, 353.0], [46.0, 353.0], [46.1, 354.0], [46.2, 355.0], [46.3, 357.0], [46.4, 357.0], [46.5, 358.0], [46.6, 359.0], [46.7, 359.0], [46.8, 360.0], [46.9, 361.0], [47.0, 362.0], [47.1, 362.0], [47.2, 362.0], [47.3, 363.0], [47.4, 363.0], [47.5, 364.0], [47.6, 364.0], [47.7, 365.0], [47.8, 365.0], [47.9, 366.0], [48.0, 367.0], [48.1, 369.0], [48.2, 370.0], [48.3, 371.0], [48.4, 372.0], [48.5, 373.0], [48.6, 374.0], [48.7, 376.0], [48.8, 377.0], [48.9, 379.0], [49.0, 379.0], [49.1, 379.0], [49.2, 380.0], [49.3, 381.0], [49.4, 382.0], [49.5, 382.0], [49.6, 385.0], [49.7, 385.0], [49.8, 385.0], [49.9, 386.0], [50.0, 387.0], [50.1, 388.0], [50.2, 388.0], [50.3, 389.0], [50.4, 389.0], [50.5, 390.0], [50.6, 390.0], [50.7, 391.0], [50.8, 392.0], [50.9, 392.0], [51.0, 392.0], [51.1, 393.0], [51.2, 394.0], [51.3, 394.0], [51.4, 395.0], [51.5, 396.0], [51.6, 397.0], [51.7, 398.0], [51.8, 400.0], [51.9, 400.0], [52.0, 400.0], [52.1, 401.0], [52.2, 403.0], [52.3, 404.0], [52.4, 404.0], [52.5, 405.0], [52.6, 405.0], [52.7, 405.0], [52.8, 406.0], [52.9, 407.0], [53.0, 407.0], [53.1, 408.0], [53.2, 409.0], [53.3, 410.0], [53.4, 411.0], [53.5, 412.0], [53.6, 412.0], [53.7, 413.0], [53.8, 413.0], [53.9, 414.0], [54.0, 415.0], [54.1, 415.0], [54.2, 416.0], [54.3, 416.0], [54.4, 418.0], [54.5, 419.0], [54.6, 419.0], [54.7, 420.0], [54.8, 421.0], [54.9, 421.0], [55.0, 421.0], [55.1, 421.0], [55.2, 422.0], [55.3, 423.0], [55.4, 423.0], [55.5, 424.0], [55.6, 424.0], [55.7, 424.0], [55.8, 425.0], [55.9, 427.0], [56.0, 427.0], [56.1, 428.0], [56.2, 429.0], [56.3, 429.0], [56.4, 430.0], [56.5, 431.0], [56.6, 431.0], [56.7, 431.0], [56.8, 432.0], [56.9, 433.0], [57.0, 434.0], [57.1, 435.0], [57.2, 436.0], [57.3, 436.0], [57.4, 436.0], [57.5, 437.0], [57.6, 438.0], [57.7, 439.0], [57.8, 441.0], [57.9, 441.0], [58.0, 441.0], [58.1, 441.0], [58.2, 442.0], [58.3, 444.0], [58.4, 446.0], [58.5, 447.0], [58.6, 447.0], [58.7, 447.0], [58.8, 449.0], [58.9, 449.0], [59.0, 450.0], [59.1, 450.0], [59.2, 451.0], [59.3, 452.0], [59.4, 452.0], [59.5, 452.0], [59.6, 453.0], [59.7, 454.0], [59.8, 454.0], [59.9, 455.0], [60.0, 456.0], [60.1, 457.0], [60.2, 457.0], [60.3, 458.0], [60.4, 459.0], [60.5, 459.0], [60.6, 460.0], [60.7, 460.0], [60.8, 461.0], [60.9, 464.0], [61.0, 465.0], [61.1, 465.0], [61.2, 466.0], [61.3, 467.0], [61.4, 467.0], [61.5, 469.0], [61.6, 469.0], [61.7, 471.0], [61.8, 471.0], [61.9, 472.0], [62.0, 473.0], [62.1, 475.0], [62.2, 476.0], [62.3, 477.0], [62.4, 479.0], [62.5, 480.0], [62.6, 480.0], [62.7, 484.0], [62.8, 488.0], [62.9, 488.0], [63.0, 489.0], [63.1, 490.0], [63.2, 490.0], [63.3, 490.0], [63.4, 491.0], [63.5, 492.0], [63.6, 493.0], [63.7, 493.0], [63.8, 493.0], [63.9, 494.0], [64.0, 494.0], [64.1, 495.0], [64.2, 496.0], [64.3, 496.0], [64.4, 497.0], [64.5, 498.0], [64.6, 500.0], [64.7, 500.0], [64.8, 501.0], [64.9, 501.0], [65.0, 503.0], [65.1, 503.0], [65.2, 503.0], [65.3, 504.0], [65.4, 506.0], [65.5, 507.0], [65.6, 507.0], [65.7, 507.0], [65.8, 507.0], [65.9, 508.0], [66.0, 509.0], [66.1, 509.0], [66.2, 510.0], [66.3, 511.0], [66.4, 512.0], [66.5, 512.0], [66.6, 514.0], [66.7, 515.0], [66.8, 515.0], [66.9, 516.0], [67.0, 517.0], [67.1, 517.0], [67.2, 519.0], [67.3, 521.0], [67.4, 521.0], [67.5, 522.0], [67.6, 523.0], [67.7, 525.0], [67.8, 525.0], [67.9, 526.0], [68.0, 527.0], [68.1, 527.0], [68.2, 529.0], [68.3, 529.0], [68.4, 530.0], [68.5, 530.0], [68.6, 532.0], [68.7, 532.0], [68.8, 533.0], [68.9, 534.0], [69.0, 535.0], [69.1, 535.0], [69.2, 536.0], [69.3, 537.0], [69.4, 541.0], [69.5, 541.0], [69.6, 541.0], [69.7, 542.0], [69.8, 542.0], [69.9, 543.0], [70.0, 544.0], [70.1, 545.0], [70.2, 546.0], [70.3, 546.0], [70.4, 547.0], [70.5, 547.0], [70.6, 549.0], [70.7, 550.0], [70.8, 551.0], [70.9, 551.0], [71.0, 554.0], [71.1, 556.0], [71.2, 557.0], [71.3, 557.0], [71.4, 558.0], [71.5, 559.0], [71.6, 561.0], [71.7, 562.0], [71.8, 563.0], [71.9, 563.0], [72.0, 566.0], [72.1, 567.0], [72.2, 568.0], [72.3, 569.0], [72.4, 570.0], [72.5, 571.0], [72.6, 572.0], [72.7, 572.0], [72.8, 573.0], [72.9, 574.0], [73.0, 575.0], [73.1, 576.0], [73.2, 577.0], [73.3, 579.0], [73.4, 581.0], [73.5, 582.0], [73.6, 583.0], [73.7, 583.0], [73.8, 583.0], [73.9, 584.0], [74.0, 584.0], [74.1, 585.0], [74.2, 586.0], [74.3, 586.0], [74.4, 587.0], [74.5, 588.0], [74.6, 588.0], [74.7, 590.0], [74.8, 590.0], [74.9, 591.0], [75.0, 593.0], [75.1, 594.0], [75.2, 596.0], [75.3, 596.0], [75.4, 598.0], [75.5, 599.0], [75.6, 599.0], [75.7, 600.0], [75.8, 601.0], [75.9, 603.0], [76.0, 603.0], [76.1, 607.0], [76.2, 608.0], [76.3, 609.0], [76.4, 610.0], [76.5, 611.0], [76.6, 612.0], [76.7, 613.0], [76.8, 614.0], [76.9, 616.0], [77.0, 617.0], [77.1, 618.0], [77.2, 621.0], [77.3, 623.0], [77.4, 624.0], [77.5, 625.0], [77.6, 626.0], [77.7, 627.0], [77.8, 628.0], [77.9, 628.0], [78.0, 630.0], [78.1, 631.0], [78.2, 632.0], [78.3, 635.0], [78.4, 636.0], [78.5, 637.0], [78.6, 639.0], [78.7, 641.0], [78.8, 643.0], [78.9, 644.0], [79.0, 644.0], [79.1, 646.0], [79.2, 647.0], [79.3, 647.0], [79.4, 648.0], [79.5, 649.0], [79.6, 649.0], [79.7, 650.0], [79.8, 652.0], [79.9, 653.0], [80.0, 658.0], [80.1, 658.0], [80.2, 659.0], [80.3, 660.0], [80.4, 662.0], [80.5, 665.0], [80.6, 668.0], [80.7, 670.0], [80.8, 671.0], [80.9, 673.0], [81.0, 676.0], [81.1, 677.0], [81.2, 677.0], [81.3, 678.0], [81.4, 681.0], [81.5, 681.0], [81.6, 685.0], [81.7, 687.0], [81.8, 689.0], [81.9, 689.0], [82.0, 690.0], [82.1, 691.0], [82.2, 696.0], [82.3, 696.0], [82.4, 699.0], [82.5, 701.0], [82.6, 702.0], [82.7, 705.0], [82.8, 707.0], [82.9, 709.0], [83.0, 712.0], [83.1, 713.0], [83.2, 715.0], [83.3, 717.0], [83.4, 720.0], [83.5, 721.0], [83.6, 724.0], [83.7, 725.0], [83.8, 728.0], [83.9, 731.0], [84.0, 732.0], [84.1, 733.0], [84.2, 734.0], [84.3, 739.0], [84.4, 742.0], [84.5, 743.0], [84.6, 745.0], [84.7, 745.0], [84.8, 745.0], [84.9, 748.0], [85.0, 749.0], [85.1, 750.0], [85.2, 752.0], [85.3, 755.0], [85.4, 759.0], [85.5, 763.0], [85.6, 764.0], [85.7, 766.0], [85.8, 767.0], [85.9, 771.0], [86.0, 772.0], [86.1, 772.0], [86.2, 775.0], [86.3, 779.0], [86.4, 782.0], [86.5, 783.0], [86.6, 787.0], [86.7, 791.0], [86.8, 794.0], [86.9, 799.0], [87.0, 802.0], [87.1, 804.0], [87.2, 804.0], [87.3, 808.0], [87.4, 811.0], [87.5, 812.0], [87.6, 814.0], [87.7, 815.0], [87.8, 820.0], [87.9, 824.0], [88.0, 825.0], [88.1, 831.0], [88.2, 834.0], [88.3, 834.0], [88.4, 838.0], [88.5, 840.0], [88.6, 843.0], [88.7, 846.0], [88.8, 847.0], [88.9, 850.0], [89.0, 853.0], [89.1, 856.0], [89.2, 856.0], [89.3, 857.0], [89.4, 867.0], [89.5, 867.0], [89.6, 870.0], [89.7, 876.0], [89.8, 881.0], [89.9, 883.0], [90.0, 885.0], [90.1, 887.0], [90.2, 891.0], [90.3, 893.0], [90.4, 897.0], [90.5, 902.0], [90.6, 903.0], [90.7, 904.0], [90.8, 906.0], [90.9, 912.0], [91.0, 915.0], [91.1, 920.0], [91.2, 922.0], [91.3, 923.0], [91.4, 926.0], [91.5, 928.0], [91.6, 933.0], [91.7, 936.0], [91.8, 938.0], [91.9, 941.0], [92.0, 950.0], [92.1, 972.0], [92.2, 981.0], [92.3, 983.0], [92.4, 988.0], [92.5, 994.0], [92.6, 997.0], [92.7, 1012.0], [92.8, 1013.0], [92.9, 1016.0], [93.0, 1017.0], [93.1, 1032.0], [93.2, 1036.0], [93.3, 1056.0], [93.4, 1063.0], [93.5, 1071.0], [93.6, 1075.0], [93.7, 1084.0], [93.8, 1088.0], [93.9, 1093.0], [94.0, 1112.0], [94.1, 1160.0], [94.2, 1188.0], [94.3, 1212.0], [94.4, 1260.0], [94.5, 1278.0], [94.6, 1306.0], [94.7, 1335.0], [94.8, 1341.0], [94.9, 1355.0], [95.0, 1375.0], [95.1, 1399.0], [95.2, 1425.0], [95.3, 1430.0], [95.4, 1441.0], [95.5, 1442.0], [95.6, 1456.0], [95.7, 1463.0], [95.8, 1470.0], [95.9, 1479.0], [96.0, 1481.0], [96.1, 1486.0], [96.2, 1489.0], [96.3, 1492.0], [96.4, 1497.0], [96.5, 1505.0], [96.6, 1509.0], [96.7, 1511.0], [96.8, 1515.0], [96.9, 1521.0], [97.0, 1528.0], [97.1, 1534.0], [97.2, 1541.0], [97.3, 1542.0], [97.4, 1554.0], [97.5, 1558.0], [97.6, 1570.0], [97.7, 1573.0], [97.8, 1576.0], [97.9, 1586.0], [98.0, 1602.0], [98.1, 1611.0], [98.2, 1612.0], [98.3, 1625.0], [98.4, 1636.0], [98.5, 1640.0], [98.6, 1656.0], [98.7, 1657.0], [98.8, 1658.0], [98.9, 1679.0], [99.0, 1690.0], [99.1, 1703.0], [99.2, 1736.0], [99.3, 1754.0], [99.4, 1766.0], [99.5, 1805.0], [99.6, 1847.0], [99.7, 1862.0], [99.8, 1938.0], [99.9, 1985.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 4.0, "minX": 0.0, "maxY": 479.0, "series": [{"data": [[0.0, 479.0], [600.0, 135.0], [700.0, 90.0], [200.0, 204.0], [800.0, 71.0], [900.0, 43.0], [1000.0, 26.0], [1100.0, 7.0], [300.0, 242.0], [1200.0, 5.0], [1300.0, 12.0], [1400.0, 27.0], [1500.0, 29.0], [100.0, 111.0], [400.0, 256.0], [1600.0, 23.0], [1700.0, 8.0], [1800.0, 6.0], [1900.0, 4.0], [500.0, 222.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 70.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1295.0, "series": [{"data": [[1.0, 635.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1295.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 70.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 77.40399999999995, "minX": 1.54961886E12, "maxY": 77.40399999999995, "series": [{"data": [[1.54961886E12, 77.40399999999995]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 41.443708609271546, "minX": 1.0, "maxY": 1138.6666666666667, "series": [{"data": [[2.0, 586.0], [3.0, 513.6666666666667], [4.0, 194.33333333333334], [5.0, 222.625], [6.0, 54.39473684210525], [7.0, 63.594202898550705], [8.0, 41.443708609271546], [9.0, 68.77037037037036], [10.0, 49.92982456140349], [11.0, 209.0769230769231], [12.0, 354.0], [13.0, 245.0], [14.0, 387.5], [15.0, 144.0], [16.0, 1105.6666666666667], [17.0, 207.0], [18.0, 484.0], [19.0, 539.5], [20.0, 147.0], [21.0, 1051.6666666666667], [22.0, 224.0], [23.0, 458.0], [24.0, 340.3333333333333], [25.0, 932.5], [26.0, 335.6666666666667], [27.0, 907.5], [28.0, 268.5], [29.0, 342.25], [30.0, 455.2], [31.0, 396.0], [33.0, 358.66666666666663], [32.0, 181.5], [35.0, 392.66666666666663], [34.0, 234.4], [37.0, 212.50000000000003], [36.0, 461.4], [39.0, 243.85714285714286], [38.0, 234.0], [41.0, 249.2142857142857], [40.0, 243.0], [43.0, 328.3333333333333], [42.0, 284.8], [45.0, 434.875], [44.0, 375.1428571428571], [47.0, 694.0], [46.0, 447.0], [49.0, 372.1818181818182], [48.0, 363.55555555555554], [51.0, 393.75], [50.0, 316.63636363636357], [53.0, 519.6], [52.0, 349.5333333333333], [55.0, 400.58333333333337], [54.0, 376.3333333333333], [57.0, 268.09090909090907], [56.0, 426.875], [59.0, 595.6], [58.0, 438.5], [61.0, 371.4285714285715], [60.0, 490.83333333333337], [63.0, 334.65217391304344], [62.0, 333.5], [66.0, 348.8181818181818], [67.0, 428.5454545454546], [65.0, 392.0], [64.0, 302.5], [71.0, 424.0666666666667], [70.0, 428.7857142857143], [69.0, 379.20000000000005], [68.0, 393.99999999999994], [75.0, 364.8181818181818], [74.0, 394.25], [73.0, 384.2727272727273], [72.0, 385.17391304347814], [79.0, 596.0], [78.0, 502.8333333333333], [77.0, 391.4166666666667], [76.0, 419.35714285714283], [83.0, 540.9333333333333], [82.0, 416.42857142857144], [81.0, 487.5], [80.0, 446.7142857142857], [87.0, 503.4], [86.0, 538.0833333333334], [85.0, 489.1666666666666], [84.0, 413.42857142857144], [91.0, 553.9], [90.0, 536.0], [89.0, 581.235294117647], [88.0, 419.0833333333333], [95.0, 592.625], [94.0, 650.5], [93.0, 549.0], [92.0, 477.6], [99.0, 573.0], [98.0, 573.1111111111111], [97.0, 421.7142857142857], [96.0, 473.42857142857144], [102.0, 613.1666666666667], [103.0, 910.6666666666667], [101.0, 488.8], [100.0, 619.3333333333334], [107.0, 504.3888888888888], [106.0, 577.6521739130435], [105.0, 582.1818181818181], [104.0, 648.2105263157895], [111.0, 766.5], [110.0, 1038.75], [109.0, 634.0], [108.0, 556.5454545454546], [115.0, 490.0], [114.0, 609.0], [113.0, 675.0], [112.0, 654.6], [117.0, 567.2727272727273], [118.0, 643.1764705882352], [119.0, 660.6428571428571], [116.0, 672.5], [123.0, 860.8571428571428], [122.0, 748.1904761904761], [121.0, 588.1538461538461], [120.0, 590.5], [127.0, 1138.6666666666667], [126.0, 680.0], [125.0, 547.0], [124.0, 617.0], [135.0, 606.551724137931], [134.0, 526.7142857142858], [133.0, 495.7692307692308], [132.0, 734.1999999999999], [131.0, 527.7272727272727], [130.0, 535.0], [129.0, 536.7777777777778], [128.0, 1036.0], [136.0, 712.9545454545455], [138.0, 745.4545454545456], [139.0, 988.8125000000001], [143.0, 1020.9999999999999], [142.0, 818.6666666666666], [141.0, 903.5555555555555], [140.0, 791.4166666666667], [137.0, 781.6153846153845], [145.0, 852.4999999999999], [151.0, 605.3333333333334], [150.0, 688.2], [149.0, 737.0714285714286], [148.0, 844.2], [147.0, 1118.7272727272727], [146.0, 722.8235294117649], [144.0, 824.5999999999999], [155.0, 695.7894736842104], [154.0, 593.7692307692307], [153.0, 671.7499999999999], [152.0, 648.5], [157.0, 812.5833333333334], [156.0, 816.8888888888889], [158.0, 542.1764705882351], [159.0, 597.0], [160.0, 622.8333333333334], [164.0, 629.8], [167.0, 427.0], [166.0, 654.6666666666666], [165.0, 588.25], [163.0, 621.5555555555555], [162.0, 704.5], [161.0, 750.8333333333334], [169.0, 715.7142857142857], [168.0, 851.1428571428571], [172.0, 672.6], [173.0, 935.6666666666666], [174.0, 879.6666666666666], [175.0, 879.0], [171.0, 661.6666666666666], [170.0, 843.7777777777778], [181.0, 969.3333333333334], [180.0, 855.6666666666666], [182.0, 772.0], [179.0, 771.0], [178.0, 917.6666666666666], [177.0, 842.1428571428571], [176.0, 1009.6666666666666], [1.0, 745.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[77.40399999999995, 439.2700000000001]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 182.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.54961886E12, "maxY": 14031.016666666666, "series": [{"data": [[1.54961886E12, 14031.016666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961886E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 439.2700000000001, "minX": 1.54961886E12, "maxY": 439.2700000000001, "series": [{"data": [[1.54961886E12, 439.2700000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 439.26000000000033, "minX": 1.54961886E12, "maxY": 439.26000000000033, "series": [{"data": [[1.54961886E12, 439.26000000000033]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 56.48599999999994, "minX": 1.54961886E12, "maxY": 56.48599999999994, "series": [{"data": [[1.54961886E12, 56.48599999999994]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 32.0, "minX": 1.54961886E12, "maxY": 1987.0, "series": [{"data": [[1.54961886E12, 1987.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961886E12, 32.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961886E12, 884.9000000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961886E12, 1689.99]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961886E12, 1374.8499999999995]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 387.0, "minX": 33.0, "maxY": 387.0, "series": [{"data": [[33.0, 387.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 387.0, "minX": 33.0, "maxY": 387.0, "series": [{"data": [[33.0, 387.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961886E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961886E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961886E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961886E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961886E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961886E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Transactions Per Second"}},
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
