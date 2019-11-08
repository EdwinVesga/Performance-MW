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
        data: {"result": {"minY": 36.0, "minX": 0.0, "maxY": 2013.0, "series": [{"data": [[0.0, 36.0], [0.1, 36.0], [0.2, 37.0], [0.3, 37.0], [0.4, 38.0], [0.5, 38.0], [0.6, 38.0], [0.7, 39.0], [0.8, 40.0], [0.9, 40.0], [1.0, 40.0], [1.1, 42.0], [1.2, 42.0], [1.3, 44.0], [1.4, 45.0], [1.5, 45.0], [1.6, 46.0], [1.7, 46.0], [1.8, 46.0], [1.9, 47.0], [2.0, 47.0], [2.1, 48.0], [2.2, 48.0], [2.3, 49.0], [2.4, 49.0], [2.5, 49.0], [2.6, 50.0], [2.7, 50.0], [2.8, 51.0], [2.9, 52.0], [3.0, 52.0], [3.1, 53.0], [3.2, 54.0], [3.3, 54.0], [3.4, 54.0], [3.5, 55.0], [3.6, 55.0], [3.7, 56.0], [3.8, 57.0], [3.9, 58.0], [4.0, 58.0], [4.1, 59.0], [4.2, 59.0], [4.3, 59.0], [4.4, 59.0], [4.5, 61.0], [4.6, 61.0], [4.7, 62.0], [4.8, 62.0], [4.9, 63.0], [5.0, 63.0], [5.1, 64.0], [5.2, 65.0], [5.3, 66.0], [5.4, 66.0], [5.5, 67.0], [5.6, 67.0], [5.7, 68.0], [5.8, 69.0], [5.9, 69.0], [6.0, 70.0], [6.1, 70.0], [6.2, 71.0], [6.3, 71.0], [6.4, 74.0], [6.5, 74.0], [6.6, 75.0], [6.7, 79.0], [6.8, 79.0], [6.9, 81.0], [7.0, 84.0], [7.1, 84.0], [7.2, 85.0], [7.3, 87.0], [7.4, 89.0], [7.5, 89.0], [7.6, 90.0], [7.7, 91.0], [7.8, 93.0], [7.9, 94.0], [8.0, 94.0], [8.1, 96.0], [8.2, 98.0], [8.3, 100.0], [8.4, 101.0], [8.5, 101.0], [8.6, 103.0], [8.7, 104.0], [8.8, 104.0], [8.9, 105.0], [9.0, 106.0], [9.1, 107.0], [9.2, 108.0], [9.3, 110.0], [9.4, 110.0], [9.5, 111.0], [9.6, 112.0], [9.7, 112.0], [9.8, 113.0], [9.9, 114.0], [10.0, 114.0], [10.1, 115.0], [10.2, 117.0], [10.3, 117.0], [10.4, 119.0], [10.5, 121.0], [10.6, 122.0], [10.7, 124.0], [10.8, 124.0], [10.9, 124.0], [11.0, 124.0], [11.1, 126.0], [11.2, 127.0], [11.3, 127.0], [11.4, 129.0], [11.5, 129.0], [11.6, 130.0], [11.7, 131.0], [11.8, 131.0], [11.9, 132.0], [12.0, 133.0], [12.1, 134.0], [12.2, 135.0], [12.3, 136.0], [12.4, 137.0], [12.5, 138.0], [12.6, 139.0], [12.7, 141.0], [12.8, 142.0], [12.9, 143.0], [13.0, 144.0], [13.1, 145.0], [13.2, 147.0], [13.3, 149.0], [13.4, 150.0], [13.5, 151.0], [13.6, 152.0], [13.7, 152.0], [13.8, 152.0], [13.9, 152.0], [14.0, 153.0], [14.1, 153.0], [14.2, 154.0], [14.3, 155.0], [14.4, 155.0], [14.5, 156.0], [14.6, 157.0], [14.7, 157.0], [14.8, 158.0], [14.9, 160.0], [15.0, 161.0], [15.1, 162.0], [15.2, 163.0], [15.3, 163.0], [15.4, 164.0], [15.5, 165.0], [15.6, 166.0], [15.7, 166.0], [15.8, 168.0], [15.9, 169.0], [16.0, 170.0], [16.1, 171.0], [16.2, 172.0], [16.3, 173.0], [16.4, 174.0], [16.5, 174.0], [16.6, 176.0], [16.7, 177.0], [16.8, 177.0], [16.9, 177.0], [17.0, 179.0], [17.1, 180.0], [17.2, 183.0], [17.3, 183.0], [17.4, 184.0], [17.5, 185.0], [17.6, 185.0], [17.7, 186.0], [17.8, 188.0], [17.9, 189.0], [18.0, 190.0], [18.1, 190.0], [18.2, 191.0], [18.3, 192.0], [18.4, 193.0], [18.5, 194.0], [18.6, 195.0], [18.7, 195.0], [18.8, 196.0], [18.9, 197.0], [19.0, 198.0], [19.1, 199.0], [19.2, 199.0], [19.3, 200.0], [19.4, 202.0], [19.5, 202.0], [19.6, 203.0], [19.7, 205.0], [19.8, 205.0], [19.9, 205.0], [20.0, 206.0], [20.1, 208.0], [20.2, 208.0], [20.3, 213.0], [20.4, 213.0], [20.5, 214.0], [20.6, 214.0], [20.7, 215.0], [20.8, 216.0], [20.9, 216.0], [21.0, 217.0], [21.1, 218.0], [21.2, 218.0], [21.3, 219.0], [21.4, 219.0], [21.5, 221.0], [21.6, 222.0], [21.7, 223.0], [21.8, 224.0], [21.9, 225.0], [22.0, 227.0], [22.1, 227.0], [22.2, 228.0], [22.3, 228.0], [22.4, 231.0], [22.5, 232.0], [22.6, 232.0], [22.7, 232.0], [22.8, 233.0], [22.9, 233.0], [23.0, 233.0], [23.1, 234.0], [23.2, 234.0], [23.3, 235.0], [23.4, 235.0], [23.5, 236.0], [23.6, 236.0], [23.7, 239.0], [23.8, 239.0], [23.9, 240.0], [24.0, 242.0], [24.1, 242.0], [24.2, 243.0], [24.3, 244.0], [24.4, 244.0], [24.5, 245.0], [24.6, 245.0], [24.7, 246.0], [24.8, 246.0], [24.9, 246.0], [25.0, 246.0], [25.1, 247.0], [25.2, 247.0], [25.3, 248.0], [25.4, 249.0], [25.5, 249.0], [25.6, 250.0], [25.7, 251.0], [25.8, 251.0], [25.9, 252.0], [26.0, 252.0], [26.1, 254.0], [26.2, 255.0], [26.3, 255.0], [26.4, 256.0], [26.5, 256.0], [26.6, 256.0], [26.7, 257.0], [26.8, 257.0], [26.9, 257.0], [27.0, 260.0], [27.1, 260.0], [27.2, 262.0], [27.3, 263.0], [27.4, 264.0], [27.5, 264.0], [27.6, 265.0], [27.7, 265.0], [27.8, 265.0], [27.9, 267.0], [28.0, 268.0], [28.1, 270.0], [28.2, 270.0], [28.3, 271.0], [28.4, 271.0], [28.5, 272.0], [28.6, 273.0], [28.7, 274.0], [28.8, 274.0], [28.9, 276.0], [29.0, 276.0], [29.1, 277.0], [29.2, 278.0], [29.3, 278.0], [29.4, 278.0], [29.5, 279.0], [29.6, 279.0], [29.7, 279.0], [29.8, 279.0], [29.9, 280.0], [30.0, 281.0], [30.1, 281.0], [30.2, 281.0], [30.3, 282.0], [30.4, 282.0], [30.5, 283.0], [30.6, 284.0], [30.7, 285.0], [30.8, 286.0], [30.9, 286.0], [31.0, 287.0], [31.1, 287.0], [31.2, 287.0], [31.3, 288.0], [31.4, 288.0], [31.5, 289.0], [31.6, 289.0], [31.7, 291.0], [31.8, 292.0], [31.9, 292.0], [32.0, 292.0], [32.1, 293.0], [32.2, 294.0], [32.3, 295.0], [32.4, 296.0], [32.5, 296.0], [32.6, 297.0], [32.7, 297.0], [32.8, 297.0], [32.9, 298.0], [33.0, 299.0], [33.1, 299.0], [33.2, 300.0], [33.3, 301.0], [33.4, 301.0], [33.5, 301.0], [33.6, 303.0], [33.7, 303.0], [33.8, 303.0], [33.9, 303.0], [34.0, 304.0], [34.1, 305.0], [34.2, 306.0], [34.3, 306.0], [34.4, 307.0], [34.5, 307.0], [34.6, 308.0], [34.7, 309.0], [34.8, 311.0], [34.9, 312.0], [35.0, 312.0], [35.1, 313.0], [35.2, 313.0], [35.3, 314.0], [35.4, 314.0], [35.5, 314.0], [35.6, 315.0], [35.7, 316.0], [35.8, 316.0], [35.9, 317.0], [36.0, 318.0], [36.1, 318.0], [36.2, 319.0], [36.3, 319.0], [36.4, 321.0], [36.5, 322.0], [36.6, 324.0], [36.7, 324.0], [36.8, 325.0], [36.9, 325.0], [37.0, 325.0], [37.1, 326.0], [37.2, 326.0], [37.3, 326.0], [37.4, 327.0], [37.5, 327.0], [37.6, 328.0], [37.7, 329.0], [37.8, 329.0], [37.9, 329.0], [38.0, 330.0], [38.1, 330.0], [38.2, 331.0], [38.3, 331.0], [38.4, 331.0], [38.5, 332.0], [38.6, 332.0], [38.7, 333.0], [38.8, 335.0], [38.9, 335.0], [39.0, 336.0], [39.1, 337.0], [39.2, 338.0], [39.3, 338.0], [39.4, 339.0], [39.5, 339.0], [39.6, 340.0], [39.7, 341.0], [39.8, 341.0], [39.9, 341.0], [40.0, 342.0], [40.1, 342.0], [40.2, 343.0], [40.3, 343.0], [40.4, 344.0], [40.5, 344.0], [40.6, 345.0], [40.7, 346.0], [40.8, 346.0], [40.9, 346.0], [41.0, 347.0], [41.1, 347.0], [41.2, 347.0], [41.3, 348.0], [41.4, 350.0], [41.5, 350.0], [41.6, 350.0], [41.7, 352.0], [41.8, 353.0], [41.9, 353.0], [42.0, 355.0], [42.1, 356.0], [42.2, 356.0], [42.3, 356.0], [42.4, 357.0], [42.5, 358.0], [42.6, 359.0], [42.7, 359.0], [42.8, 359.0], [42.9, 360.0], [43.0, 360.0], [43.1, 361.0], [43.2, 362.0], [43.3, 362.0], [43.4, 363.0], [43.5, 364.0], [43.6, 365.0], [43.7, 365.0], [43.8, 366.0], [43.9, 366.0], [44.0, 367.0], [44.1, 368.0], [44.2, 369.0], [44.3, 369.0], [44.4, 370.0], [44.5, 371.0], [44.6, 372.0], [44.7, 372.0], [44.8, 372.0], [44.9, 372.0], [45.0, 373.0], [45.1, 373.0], [45.2, 375.0], [45.3, 376.0], [45.4, 377.0], [45.5, 378.0], [45.6, 379.0], [45.7, 379.0], [45.8, 379.0], [45.9, 379.0], [46.0, 380.0], [46.1, 381.0], [46.2, 382.0], [46.3, 383.0], [46.4, 383.0], [46.5, 383.0], [46.6, 386.0], [46.7, 386.0], [46.8, 386.0], [46.9, 387.0], [47.0, 387.0], [47.1, 388.0], [47.2, 388.0], [47.3, 389.0], [47.4, 390.0], [47.5, 390.0], [47.6, 391.0], [47.7, 391.0], [47.8, 392.0], [47.9, 393.0], [48.0, 394.0], [48.1, 394.0], [48.2, 395.0], [48.3, 396.0], [48.4, 396.0], [48.5, 397.0], [48.6, 397.0], [48.7, 397.0], [48.8, 398.0], [48.9, 399.0], [49.0, 399.0], [49.1, 400.0], [49.2, 400.0], [49.3, 400.0], [49.4, 401.0], [49.5, 402.0], [49.6, 402.0], [49.7, 402.0], [49.8, 402.0], [49.9, 403.0], [50.0, 403.0], [50.1, 403.0], [50.2, 404.0], [50.3, 406.0], [50.4, 406.0], [50.5, 406.0], [50.6, 407.0], [50.7, 408.0], [50.8, 408.0], [50.9, 409.0], [51.0, 409.0], [51.1, 410.0], [51.2, 410.0], [51.3, 410.0], [51.4, 411.0], [51.5, 412.0], [51.6, 413.0], [51.7, 414.0], [51.8, 414.0], [51.9, 414.0], [52.0, 415.0], [52.1, 416.0], [52.2, 416.0], [52.3, 416.0], [52.4, 417.0], [52.5, 417.0], [52.6, 417.0], [52.7, 419.0], [52.8, 419.0], [52.9, 419.0], [53.0, 420.0], [53.1, 420.0], [53.2, 421.0], [53.3, 421.0], [53.4, 421.0], [53.5, 422.0], [53.6, 422.0], [53.7, 423.0], [53.8, 423.0], [53.9, 423.0], [54.0, 424.0], [54.1, 424.0], [54.2, 425.0], [54.3, 425.0], [54.4, 425.0], [54.5, 426.0], [54.6, 427.0], [54.7, 427.0], [54.8, 427.0], [54.9, 428.0], [55.0, 428.0], [55.1, 428.0], [55.2, 429.0], [55.3, 429.0], [55.4, 430.0], [55.5, 430.0], [55.6, 432.0], [55.7, 433.0], [55.8, 435.0], [55.9, 436.0], [56.0, 436.0], [56.1, 436.0], [56.2, 437.0], [56.3, 437.0], [56.4, 438.0], [56.5, 438.0], [56.6, 439.0], [56.7, 440.0], [56.8, 440.0], [56.9, 441.0], [57.0, 441.0], [57.1, 442.0], [57.2, 442.0], [57.3, 442.0], [57.4, 443.0], [57.5, 444.0], [57.6, 444.0], [57.7, 445.0], [57.8, 445.0], [57.9, 445.0], [58.0, 446.0], [58.1, 446.0], [58.2, 447.0], [58.3, 447.0], [58.4, 448.0], [58.5, 448.0], [58.6, 449.0], [58.7, 450.0], [58.8, 450.0], [58.9, 450.0], [59.0, 450.0], [59.1, 450.0], [59.2, 453.0], [59.3, 454.0], [59.4, 454.0], [59.5, 454.0], [59.6, 455.0], [59.7, 455.0], [59.8, 457.0], [59.9, 458.0], [60.0, 458.0], [60.1, 458.0], [60.2, 459.0], [60.3, 460.0], [60.4, 461.0], [60.5, 462.0], [60.6, 462.0], [60.7, 464.0], [60.8, 464.0], [60.9, 465.0], [61.0, 466.0], [61.1, 466.0], [61.2, 467.0], [61.3, 468.0], [61.4, 469.0], [61.5, 470.0], [61.6, 471.0], [61.7, 471.0], [61.8, 472.0], [61.9, 472.0], [62.0, 472.0], [62.1, 472.0], [62.2, 473.0], [62.3, 474.0], [62.4, 475.0], [62.5, 476.0], [62.6, 477.0], [62.7, 478.0], [62.8, 480.0], [62.9, 481.0], [63.0, 482.0], [63.1, 484.0], [63.2, 484.0], [63.3, 485.0], [63.4, 485.0], [63.5, 486.0], [63.6, 486.0], [63.7, 487.0], [63.8, 488.0], [63.9, 488.0], [64.0, 489.0], [64.1, 490.0], [64.2, 490.0], [64.3, 492.0], [64.4, 493.0], [64.5, 493.0], [64.6, 494.0], [64.7, 495.0], [64.8, 496.0], [64.9, 497.0], [65.0, 497.0], [65.1, 498.0], [65.2, 499.0], [65.3, 500.0], [65.4, 501.0], [65.5, 501.0], [65.6, 502.0], [65.7, 502.0], [65.8, 504.0], [65.9, 504.0], [66.0, 506.0], [66.1, 506.0], [66.2, 506.0], [66.3, 507.0], [66.4, 508.0], [66.5, 509.0], [66.6, 509.0], [66.7, 510.0], [66.8, 510.0], [66.9, 510.0], [67.0, 511.0], [67.1, 511.0], [67.2, 513.0], [67.3, 513.0], [67.4, 515.0], [67.5, 515.0], [67.6, 516.0], [67.7, 517.0], [67.8, 519.0], [67.9, 520.0], [68.0, 520.0], [68.1, 521.0], [68.2, 521.0], [68.3, 522.0], [68.4, 524.0], [68.5, 525.0], [68.6, 526.0], [68.7, 527.0], [68.8, 528.0], [68.9, 528.0], [69.0, 529.0], [69.1, 530.0], [69.2, 531.0], [69.3, 531.0], [69.4, 532.0], [69.5, 533.0], [69.6, 533.0], [69.7, 533.0], [69.8, 533.0], [69.9, 534.0], [70.0, 535.0], [70.1, 536.0], [70.2, 537.0], [70.3, 537.0], [70.4, 537.0], [70.5, 538.0], [70.6, 539.0], [70.7, 539.0], [70.8, 540.0], [70.9, 541.0], [71.0, 542.0], [71.1, 542.0], [71.2, 544.0], [71.3, 545.0], [71.4, 546.0], [71.5, 546.0], [71.6, 547.0], [71.7, 547.0], [71.8, 548.0], [71.9, 548.0], [72.0, 549.0], [72.1, 550.0], [72.2, 550.0], [72.3, 551.0], [72.4, 553.0], [72.5, 553.0], [72.6, 554.0], [72.7, 555.0], [72.8, 556.0], [72.9, 556.0], [73.0, 557.0], [73.1, 557.0], [73.2, 557.0], [73.3, 559.0], [73.4, 562.0], [73.5, 563.0], [73.6, 564.0], [73.7, 565.0], [73.8, 566.0], [73.9, 568.0], [74.0, 568.0], [74.1, 568.0], [74.2, 571.0], [74.3, 571.0], [74.4, 573.0], [74.5, 574.0], [74.6, 575.0], [74.7, 576.0], [74.8, 577.0], [74.9, 578.0], [75.0, 580.0], [75.1, 581.0], [75.2, 582.0], [75.3, 583.0], [75.4, 583.0], [75.5, 585.0], [75.6, 587.0], [75.7, 589.0], [75.8, 590.0], [75.9, 591.0], [76.0, 592.0], [76.1, 593.0], [76.2, 594.0], [76.3, 594.0], [76.4, 595.0], [76.5, 596.0], [76.6, 597.0], [76.7, 598.0], [76.8, 599.0], [76.9, 600.0], [77.0, 603.0], [77.1, 604.0], [77.2, 604.0], [77.3, 605.0], [77.4, 607.0], [77.5, 609.0], [77.6, 611.0], [77.7, 614.0], [77.8, 615.0], [77.9, 620.0], [78.0, 620.0], [78.1, 622.0], [78.2, 622.0], [78.3, 623.0], [78.4, 628.0], [78.5, 630.0], [78.6, 630.0], [78.7, 630.0], [78.8, 631.0], [78.9, 632.0], [79.0, 633.0], [79.1, 634.0], [79.2, 636.0], [79.3, 637.0], [79.4, 638.0], [79.5, 639.0], [79.6, 639.0], [79.7, 640.0], [79.8, 641.0], [79.9, 642.0], [80.0, 643.0], [80.1, 646.0], [80.2, 648.0], [80.3, 650.0], [80.4, 651.0], [80.5, 653.0], [80.6, 655.0], [80.7, 657.0], [80.8, 658.0], [80.9, 659.0], [81.0, 661.0], [81.1, 662.0], [81.2, 664.0], [81.3, 665.0], [81.4, 665.0], [81.5, 666.0], [81.6, 668.0], [81.7, 669.0], [81.8, 670.0], [81.9, 671.0], [82.0, 673.0], [82.1, 673.0], [82.2, 673.0], [82.3, 674.0], [82.4, 676.0], [82.5, 677.0], [82.6, 678.0], [82.7, 679.0], [82.8, 680.0], [82.9, 682.0], [83.0, 684.0], [83.1, 686.0], [83.2, 687.0], [83.3, 688.0], [83.4, 689.0], [83.5, 690.0], [83.6, 691.0], [83.7, 693.0], [83.8, 693.0], [83.9, 695.0], [84.0, 696.0], [84.1, 697.0], [84.2, 698.0], [84.3, 699.0], [84.4, 700.0], [84.5, 701.0], [84.6, 702.0], [84.7, 703.0], [84.8, 709.0], [84.9, 711.0], [85.0, 713.0], [85.1, 714.0], [85.2, 715.0], [85.3, 716.0], [85.4, 717.0], [85.5, 719.0], [85.6, 721.0], [85.7, 722.0], [85.8, 726.0], [85.9, 726.0], [86.0, 728.0], [86.1, 730.0], [86.2, 734.0], [86.3, 735.0], [86.4, 735.0], [86.5, 738.0], [86.6, 739.0], [86.7, 742.0], [86.8, 746.0], [86.9, 749.0], [87.0, 750.0], [87.1, 752.0], [87.2, 756.0], [87.3, 761.0], [87.4, 762.0], [87.5, 762.0], [87.6, 764.0], [87.7, 767.0], [87.8, 768.0], [87.9, 769.0], [88.0, 773.0], [88.1, 774.0], [88.2, 775.0], [88.3, 778.0], [88.4, 780.0], [88.5, 781.0], [88.6, 782.0], [88.7, 784.0], [88.8, 787.0], [88.9, 792.0], [89.0, 794.0], [89.1, 797.0], [89.2, 799.0], [89.3, 801.0], [89.4, 803.0], [89.5, 803.0], [89.6, 804.0], [89.7, 805.0], [89.8, 805.0], [89.9, 806.0], [90.0, 809.0], [90.1, 815.0], [90.2, 818.0], [90.3, 824.0], [90.4, 829.0], [90.5, 836.0], [90.6, 840.0], [90.7, 842.0], [90.8, 845.0], [90.9, 851.0], [91.0, 851.0], [91.1, 853.0], [91.2, 855.0], [91.3, 855.0], [91.4, 857.0], [91.5, 859.0], [91.6, 866.0], [91.7, 870.0], [91.8, 872.0], [91.9, 875.0], [92.0, 877.0], [92.1, 877.0], [92.2, 880.0], [92.3, 883.0], [92.4, 886.0], [92.5, 895.0], [92.6, 900.0], [92.7, 902.0], [92.8, 912.0], [92.9, 915.0], [93.0, 923.0], [93.1, 925.0], [93.2, 930.0], [93.3, 939.0], [93.4, 942.0], [93.5, 951.0], [93.6, 957.0], [93.7, 966.0], [93.8, 976.0], [93.9, 980.0], [94.0, 985.0], [94.1, 1018.0], [94.2, 1028.0], [94.3, 1055.0], [94.4, 1065.0], [94.5, 1149.0], [94.6, 1195.0], [94.7, 1249.0], [94.8, 1348.0], [94.9, 1352.0], [95.0, 1358.0], [95.1, 1381.0], [95.2, 1405.0], [95.3, 1411.0], [95.4, 1425.0], [95.5, 1440.0], [95.6, 1453.0], [95.7, 1466.0], [95.8, 1474.0], [95.9, 1485.0], [96.0, 1493.0], [96.1, 1500.0], [96.2, 1502.0], [96.3, 1509.0], [96.4, 1511.0], [96.5, 1516.0], [96.6, 1525.0], [96.7, 1527.0], [96.8, 1529.0], [96.9, 1547.0], [97.0, 1549.0], [97.1, 1553.0], [97.2, 1566.0], [97.3, 1580.0], [97.4, 1592.0], [97.5, 1595.0], [97.6, 1599.0], [97.7, 1602.0], [97.8, 1608.0], [97.9, 1624.0], [98.0, 1627.0], [98.1, 1640.0], [98.2, 1662.0], [98.3, 1673.0], [98.4, 1676.0], [98.5, 1682.0], [98.6, 1689.0], [98.7, 1697.0], [98.8, 1733.0], [98.9, 1748.0], [99.0, 1756.0], [99.1, 1764.0], [99.2, 1771.0], [99.3, 1789.0], [99.4, 1801.0], [99.5, 1810.0], [99.6, 1816.0], [99.7, 1824.0], [99.8, 1872.0], [99.9, 1909.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 323.0, "series": [{"data": [[0.0, 165.0], [600.0, 150.0], [700.0, 97.0], [200.0, 278.0], [800.0, 67.0], [900.0, 29.0], [1000.0, 9.0], [1100.0, 3.0], [300.0, 319.0], [1200.0, 3.0], [1300.0, 8.0], [1400.0, 18.0], [1500.0, 32.0], [100.0, 219.0], [400.0, 323.0], [1600.0, 21.0], [1700.0, 13.0], [1800.0, 10.0], [1900.0, 1.0], [500.0, 234.0], [2000.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 76.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1306.0, "series": [{"data": [[1.0, 618.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1306.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 76.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 86.56249999999999, "minX": 1.5496185E12, "maxY": 86.56249999999999, "series": [{"data": [[1.5496185E12, 86.56249999999999]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 48.46666666666667, "minX": 1.0, "maxY": 1017.3076923076924, "series": [{"data": [[2.0, 166.0], [3.0, 166.0], [4.0, 96.5], [5.0, 69.66666666666667], [6.0, 48.46666666666667], [7.0, 65.63636363636363], [8.0, 76.6923076923077], [9.0, 69.35714285714286], [10.0, 52.4], [11.0, 71.18181818181819], [12.0, 74.35], [13.0, 101.99999999999999], [14.0, 106.27272727272728], [15.0, 82.8], [16.0, 104.71428571428572], [17.0, 107.72727272727272], [18.0, 114.6], [19.0, 121.33333333333334], [20.0, 139.88888888888889], [21.0, 112.7857142857143], [22.0, 150.0], [23.0, 158.69230769230768], [24.0, 151.91666666666663], [25.0, 136.44444444444446], [26.0, 149.66666666666666], [27.0, 185.11111111111111], [28.0, 156.64285714285714], [29.0, 159.38888888888889], [30.0, 156.33333333333334], [31.0, 190.125], [33.0, 209.2], [32.0, 198.36363636363637], [35.0, 195.46666666666664], [34.0, 191.14285714285714], [37.0, 173.41666666666666], [36.0, 186.6153846153846], [39.0, 263.5], [38.0, 268.0], [41.0, 202.36363636363637], [40.0, 220.25], [43.0, 228.2], [42.0, 207.66666666666669], [45.0, 204.0], [44.0, 259.59999999999997], [47.0, 275.0], [46.0, 236.8], [48.0, 253.41666666666674], [49.0, 242.2], [51.0, 256.66666666666663], [50.0, 255.66666666666666], [53.0, 324.8], [52.0, 277.90909090909093], [55.0, 295.58333333333337], [54.0, 266.16666666666663], [57.0, 298.83333333333337], [56.0, 288.63157894736844], [59.0, 400.6666666666667], [58.0, 329.0], [61.0, 297.92857142857144], [60.0, 301.0], [63.0, 333.6785714285715], [62.0, 352.4666666666667], [67.0, 347.55555555555554], [66.0, 376.5], [65.0, 317.09090909090907], [64.0, 306.92307692307696], [71.0, 384.33333333333337], [70.0, 369.8], [69.0, 352.1818181818182], [68.0, 350.2222222222223], [75.0, 375.42307692307696], [74.0, 383.0], [73.0, 352.3333333333333], [72.0, 423.8461538461538], [79.0, 419.9333333333334], [78.0, 431.95238095238096], [77.0, 415.7727272727273], [76.0, 369.4090909090909], [83.0, 485.9166666666667], [82.0, 480.4], [81.0, 451.08333333333337], [80.0, 411.8636363636364], [87.0, 444.0625], [86.0, 428.55555555555554], [85.0, 597.6666666666666], [84.0, 431.00000000000006], [91.0, 495.0], [90.0, 458.6666666666667], [89.0, 498.0769230769231], [88.0, 471.4375], [95.0, 544.8], [94.0, 573.9], [93.0, 456.91666666666663], [92.0, 480.70000000000005], [99.0, 506.21428571428567], [98.0, 581.7142857142857], [97.0, 546.75], [96.0, 459.0], [103.0, 561.0], [102.0, 548.4999999999999], [101.0, 506.91666666666663], [100.0, 459.2], [107.0, 576.8571428571429], [106.0, 509.875], [105.0, 604.1818181818181], [104.0, 612.6666666666667], [111.0, 552.3333333333334], [110.0, 632.5555555555555], [109.0, 589.9411764705883], [108.0, 575.9375], [115.0, 611.4499999999999], [114.0, 742.8571428571429], [113.0, 667.952380952381], [112.0, 705.6666666666667], [119.0, 693.1666666666667], [118.0, 632.8571428571429], [117.0, 631.0909090909091], [116.0, 578.1904761904763], [122.0, 911.3], [123.0, 796.625], [121.0, 668.0000000000001], [120.0, 671.0526315789472], [127.0, 866.6470588235294], [126.0, 740.5], [125.0, 762.125], [124.0, 713.5555555555555], [132.0, 603.1428571428571], [135.0, 777.7083333333334], [134.0, 663.344827586207], [133.0, 840.1], [131.0, 754.037037037037], [130.0, 857.7741935483871], [129.0, 671.3437500000001], [128.0, 508.8636363636363], [139.0, 671.0625], [143.0, 804.0833333333334], [142.0, 797.4736842105262], [141.0, 851.5625], [140.0, 1017.3076923076924], [138.0, 597.2173913043479], [137.0, 600.2307692307692], [136.0, 808.2962962962962], [144.0, 792.8], [146.0, 578.1428571428572], [151.0, 836.0], [150.0, 706.4285714285713], [149.0, 692.5000000000001], [148.0, 561.4], [145.0, 697.1538461538462], [147.0, 701.0], [154.0, 731.1428571428571], [156.0, 685.3636363636364], [155.0, 708.2500000000001], [157.0, 769.375], [158.0, 731.1333333333332], [159.0, 764.8571428571428], [153.0, 640.2], [152.0, 716.6666666666666], [160.0, 912.0], [1.0, 157.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[86.56249999999999, 466.48149999999873]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 160.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8466.666666666666, "minX": 1.5496185E12, "maxY": 13997.466666666667, "series": [{"data": [[1.5496185E12, 13997.466666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5496185E12, 8466.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 466.48149999999873, "minX": 1.5496185E12, "maxY": 466.48149999999873, "series": [{"data": [[1.5496185E12, 466.48149999999873]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496185E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 466.4730000000006, "minX": 1.5496185E12, "maxY": 466.4730000000006, "series": [{"data": [[1.5496185E12, 466.4730000000006]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496185E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 55.07050000000011, "minX": 1.5496185E12, "maxY": 55.07050000000011, "series": [{"data": [[1.5496185E12, 55.07050000000011]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496185E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 36.0, "minX": 1.5496185E12, "maxY": 2013.0, "series": [{"data": [[1.5496185E12, 2013.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5496185E12, 36.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5496185E12, 808.9000000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5496185E12, 1755.96]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5496185E12, 1357.7999999999993]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 403.0, "minX": 33.0, "maxY": 403.0, "series": [{"data": [[33.0, 403.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 403.0, "minX": 33.0, "maxY": 403.0, "series": [{"data": [[33.0, 403.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5496185E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5496185E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5496185E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5496185E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5496185E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5496185E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496185E12, "title": "Transactions Per Second"}},
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
