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
        data: {"result": {"minY": 4.0, "minX": 0.0, "maxY": 8045.0, "series": [{"data": [[0.0, 4.0], [0.1, 8.0], [0.2, 8.0], [0.3, 8.0], [0.4, 9.0], [0.5, 9.0], [0.6, 9.0], [0.7, 9.0], [0.8, 9.0], [0.9, 10.0], [1.0, 10.0], [1.1, 10.0], [1.2, 10.0], [1.3, 10.0], [1.4, 10.0], [1.5, 11.0], [1.6, 11.0], [1.7, 11.0], [1.8, 11.0], [1.9, 11.0], [2.0, 11.0], [2.1, 11.0], [2.2, 12.0], [2.3, 12.0], [2.4, 12.0], [2.5, 12.0], [2.6, 12.0], [2.7, 12.0], [2.8, 13.0], [2.9, 13.0], [3.0, 13.0], [3.1, 13.0], [3.2, 13.0], [3.3, 14.0], [3.4, 14.0], [3.5, 14.0], [3.6, 14.0], [3.7, 15.0], [3.8, 15.0], [3.9, 15.0], [4.0, 15.0], [4.1, 16.0], [4.2, 16.0], [4.3, 16.0], [4.4, 16.0], [4.5, 16.0], [4.6, 17.0], [4.7, 17.0], [4.8, 17.0], [4.9, 18.0], [5.0, 18.0], [5.1, 18.0], [5.2, 19.0], [5.3, 19.0], [5.4, 19.0], [5.5, 20.0], [5.6, 20.0], [5.7, 20.0], [5.8, 21.0], [5.9, 21.0], [6.0, 21.0], [6.1, 22.0], [6.2, 22.0], [6.3, 23.0], [6.4, 23.0], [6.5, 23.0], [6.6, 24.0], [6.7, 24.0], [6.8, 25.0], [6.9, 25.0], [7.0, 26.0], [7.1, 26.0], [7.2, 27.0], [7.3, 27.0], [7.4, 28.0], [7.5, 28.0], [7.6, 29.0], [7.7, 29.0], [7.8, 30.0], [7.9, 30.0], [8.0, 31.0], [8.1, 31.0], [8.2, 32.0], [8.3, 32.0], [8.4, 33.0], [8.5, 33.0], [8.6, 34.0], [8.7, 35.0], [8.8, 35.0], [8.9, 36.0], [9.0, 36.0], [9.1, 37.0], [9.2, 37.0], [9.3, 38.0], [9.4, 39.0], [9.5, 39.0], [9.6, 40.0], [9.7, 41.0], [9.8, 41.0], [9.9, 42.0], [10.0, 42.0], [10.1, 43.0], [10.2, 44.0], [10.3, 45.0], [10.4, 45.0], [10.5, 46.0], [10.6, 47.0], [10.7, 47.0], [10.8, 48.0], [10.9, 49.0], [11.0, 49.0], [11.1, 50.0], [11.2, 51.0], [11.3, 51.0], [11.4, 52.0], [11.5, 53.0], [11.6, 53.0], [11.7, 54.0], [11.8, 55.0], [11.9, 56.0], [12.0, 56.0], [12.1, 57.0], [12.2, 58.0], [12.3, 58.0], [12.4, 59.0], [12.5, 60.0], [12.6, 61.0], [12.7, 61.0], [12.8, 62.0], [12.9, 63.0], [13.0, 64.0], [13.1, 64.0], [13.2, 65.0], [13.3, 66.0], [13.4, 67.0], [13.5, 67.0], [13.6, 68.0], [13.7, 69.0], [13.8, 69.0], [13.9, 70.0], [14.0, 71.0], [14.1, 72.0], [14.2, 73.0], [14.3, 73.0], [14.4, 74.0], [14.5, 75.0], [14.6, 76.0], [14.7, 76.0], [14.8, 77.0], [14.9, 78.0], [15.0, 79.0], [15.1, 79.0], [15.2, 80.0], [15.3, 81.0], [15.4, 82.0], [15.5, 82.0], [15.6, 83.0], [15.7, 84.0], [15.8, 85.0], [15.9, 85.0], [16.0, 86.0], [16.1, 87.0], [16.2, 88.0], [16.3, 88.0], [16.4, 89.0], [16.5, 90.0], [16.6, 90.0], [16.7, 91.0], [16.8, 92.0], [16.9, 92.0], [17.0, 93.0], [17.1, 94.0], [17.2, 95.0], [17.3, 95.0], [17.4, 96.0], [17.5, 97.0], [17.6, 97.0], [17.7, 98.0], [17.8, 99.0], [17.9, 99.0], [18.0, 100.0], [18.1, 101.0], [18.2, 101.0], [18.3, 102.0], [18.4, 103.0], [18.5, 104.0], [18.6, 104.0], [18.7, 105.0], [18.8, 106.0], [18.9, 106.0], [19.0, 107.0], [19.1, 108.0], [19.2, 109.0], [19.3, 109.0], [19.4, 110.0], [19.5, 111.0], [19.6, 111.0], [19.7, 112.0], [19.8, 113.0], [19.9, 113.0], [20.0, 114.0], [20.1, 115.0], [20.2, 116.0], [20.3, 116.0], [20.4, 117.0], [20.5, 118.0], [20.6, 119.0], [20.7, 119.0], [20.8, 120.0], [20.9, 121.0], [21.0, 122.0], [21.1, 122.0], [21.2, 123.0], [21.3, 124.0], [21.4, 124.0], [21.5, 125.0], [21.6, 126.0], [21.7, 126.0], [21.8, 127.0], [21.9, 128.0], [22.0, 129.0], [22.1, 130.0], [22.2, 130.0], [22.3, 131.0], [22.4, 132.0], [22.5, 133.0], [22.6, 133.0], [22.7, 134.0], [22.8, 135.0], [22.9, 135.0], [23.0, 136.0], [23.1, 137.0], [23.2, 138.0], [23.3, 139.0], [23.4, 139.0], [23.5, 140.0], [23.6, 141.0], [23.7, 142.0], [23.8, 142.0], [23.9, 143.0], [24.0, 144.0], [24.1, 145.0], [24.2, 145.0], [24.3, 146.0], [24.4, 147.0], [24.5, 148.0], [24.6, 149.0], [24.7, 149.0], [24.8, 150.0], [24.9, 151.0], [25.0, 152.0], [25.1, 153.0], [25.2, 154.0], [25.3, 154.0], [25.4, 155.0], [25.5, 156.0], [25.6, 157.0], [25.7, 158.0], [25.8, 159.0], [25.9, 159.0], [26.0, 160.0], [26.1, 161.0], [26.2, 162.0], [26.3, 163.0], [26.4, 164.0], [26.5, 164.0], [26.6, 165.0], [26.7, 166.0], [26.8, 167.0], [26.9, 168.0], [27.0, 169.0], [27.1, 169.0], [27.2, 170.0], [27.3, 171.0], [27.4, 172.0], [27.5, 173.0], [27.6, 174.0], [27.7, 175.0], [27.8, 176.0], [27.9, 176.0], [28.0, 177.0], [28.1, 178.0], [28.2, 179.0], [28.3, 180.0], [28.4, 181.0], [28.5, 182.0], [28.6, 183.0], [28.7, 184.0], [28.8, 185.0], [28.9, 186.0], [29.0, 187.0], [29.1, 187.0], [29.2, 188.0], [29.3, 189.0], [29.4, 190.0], [29.5, 191.0], [29.6, 192.0], [29.7, 193.0], [29.8, 194.0], [29.9, 195.0], [30.0, 196.0], [30.1, 197.0], [30.2, 198.0], [30.3, 199.0], [30.4, 200.0], [30.5, 201.0], [30.6, 202.0], [30.7, 203.0], [30.8, 204.0], [30.9, 205.0], [31.0, 206.0], [31.1, 207.0], [31.2, 208.0], [31.3, 209.0], [31.4, 210.0], [31.5, 211.0], [31.6, 212.0], [31.7, 213.0], [31.8, 214.0], [31.9, 215.0], [32.0, 216.0], [32.1, 217.0], [32.2, 218.0], [32.3, 219.0], [32.4, 220.0], [32.5, 221.0], [32.6, 222.0], [32.7, 223.0], [32.8, 224.0], [32.9, 225.0], [33.0, 226.0], [33.1, 228.0], [33.2, 229.0], [33.3, 230.0], [33.4, 231.0], [33.5, 232.0], [33.6, 233.0], [33.7, 234.0], [33.8, 235.0], [33.9, 236.0], [34.0, 237.0], [34.1, 238.0], [34.2, 239.0], [34.3, 240.0], [34.4, 241.0], [34.5, 242.0], [34.6, 243.0], [34.7, 245.0], [34.8, 246.0], [34.9, 247.0], [35.0, 248.0], [35.1, 249.0], [35.2, 250.0], [35.3, 251.0], [35.4, 252.0], [35.5, 253.0], [35.6, 255.0], [35.7, 256.0], [35.8, 257.0], [35.9, 258.0], [36.0, 259.0], [36.1, 260.0], [36.2, 261.0], [36.3, 262.0], [36.4, 263.0], [36.5, 265.0], [36.6, 266.0], [36.7, 267.0], [36.8, 268.0], [36.9, 269.0], [37.0, 271.0], [37.1, 272.0], [37.2, 273.0], [37.3, 274.0], [37.4, 275.0], [37.5, 276.0], [37.6, 278.0], [37.7, 279.0], [37.8, 280.0], [37.9, 281.0], [38.0, 282.0], [38.1, 284.0], [38.2, 285.0], [38.3, 286.0], [38.4, 288.0], [38.5, 289.0], [38.6, 290.0], [38.7, 291.0], [38.8, 293.0], [38.9, 294.0], [39.0, 295.0], [39.1, 296.0], [39.2, 298.0], [39.3, 299.0], [39.4, 300.0], [39.5, 302.0], [39.6, 303.0], [39.7, 304.0], [39.8, 305.0], [39.9, 306.0], [40.0, 308.0], [40.1, 309.0], [40.2, 310.0], [40.3, 312.0], [40.4, 313.0], [40.5, 314.0], [40.6, 315.0], [40.7, 316.0], [40.8, 318.0], [40.9, 319.0], [41.0, 321.0], [41.1, 322.0], [41.2, 323.0], [41.3, 325.0], [41.4, 326.0], [41.5, 327.0], [41.6, 329.0], [41.7, 330.0], [41.8, 331.0], [41.9, 333.0], [42.0, 334.0], [42.1, 335.0], [42.2, 336.0], [42.3, 338.0], [42.4, 339.0], [42.5, 341.0], [42.6, 342.0], [42.7, 343.0], [42.8, 344.0], [42.9, 346.0], [43.0, 347.0], [43.1, 349.0], [43.2, 350.0], [43.3, 351.0], [43.4, 353.0], [43.5, 354.0], [43.6, 356.0], [43.7, 357.0], [43.8, 358.0], [43.9, 360.0], [44.0, 361.0], [44.1, 362.0], [44.2, 363.0], [44.3, 365.0], [44.4, 366.0], [44.5, 368.0], [44.6, 369.0], [44.7, 371.0], [44.8, 372.0], [44.9, 374.0], [45.0, 375.0], [45.1, 376.0], [45.2, 378.0], [45.3, 380.0], [45.4, 381.0], [45.5, 382.0], [45.6, 384.0], [45.7, 385.0], [45.8, 387.0], [45.9, 388.0], [46.0, 390.0], [46.1, 391.0], [46.2, 393.0], [46.3, 394.0], [46.4, 396.0], [46.5, 397.0], [46.6, 399.0], [46.7, 400.0], [46.8, 402.0], [46.9, 403.0], [47.0, 405.0], [47.1, 407.0], [47.2, 408.0], [47.3, 410.0], [47.4, 411.0], [47.5, 413.0], [47.6, 415.0], [47.7, 416.0], [47.8, 418.0], [47.9, 420.0], [48.0, 421.0], [48.1, 423.0], [48.2, 425.0], [48.3, 426.0], [48.4, 428.0], [48.5, 430.0], [48.6, 431.0], [48.7, 433.0], [48.8, 435.0], [48.9, 436.0], [49.0, 438.0], [49.1, 439.0], [49.2, 441.0], [49.3, 442.0], [49.4, 444.0], [49.5, 446.0], [49.6, 447.0], [49.7, 449.0], [49.8, 450.0], [49.9, 452.0], [50.0, 454.0], [50.1, 455.0], [50.2, 457.0], [50.3, 459.0], [50.4, 460.0], [50.5, 462.0], [50.6, 463.0], [50.7, 465.0], [50.8, 466.0], [50.9, 468.0], [51.0, 470.0], [51.1, 472.0], [51.2, 473.0], [51.3, 475.0], [51.4, 477.0], [51.5, 479.0], [51.6, 481.0], [51.7, 482.0], [51.8, 484.0], [51.9, 486.0], [52.0, 488.0], [52.1, 489.0], [52.2, 491.0], [52.3, 493.0], [52.4, 495.0], [52.5, 497.0], [52.6, 498.0], [52.7, 500.0], [52.8, 502.0], [52.9, 504.0], [53.0, 506.0], [53.1, 508.0], [53.2, 509.0], [53.3, 511.0], [53.4, 513.0], [53.5, 515.0], [53.6, 517.0], [53.7, 518.0], [53.8, 520.0], [53.9, 522.0], [54.0, 524.0], [54.1, 526.0], [54.2, 528.0], [54.3, 529.0], [54.4, 531.0], [54.5, 533.0], [54.6, 535.0], [54.7, 537.0], [54.8, 539.0], [54.9, 541.0], [55.0, 543.0], [55.1, 545.0], [55.2, 546.0], [55.3, 548.0], [55.4, 550.0], [55.5, 552.0], [55.6, 554.0], [55.7, 556.0], [55.8, 558.0], [55.9, 560.0], [56.0, 562.0], [56.1, 564.0], [56.2, 566.0], [56.3, 568.0], [56.4, 570.0], [56.5, 572.0], [56.6, 574.0], [56.7, 576.0], [56.8, 578.0], [56.9, 580.0], [57.0, 582.0], [57.1, 584.0], [57.2, 586.0], [57.3, 588.0], [57.4, 591.0], [57.5, 593.0], [57.6, 595.0], [57.7, 597.0], [57.8, 599.0], [57.9, 601.0], [58.0, 603.0], [58.1, 605.0], [58.2, 607.0], [58.3, 609.0], [58.4, 612.0], [58.5, 614.0], [58.6, 616.0], [58.7, 618.0], [58.8, 621.0], [58.9, 623.0], [59.0, 625.0], [59.1, 627.0], [59.2, 629.0], [59.3, 632.0], [59.4, 634.0], [59.5, 637.0], [59.6, 639.0], [59.7, 641.0], [59.8, 643.0], [59.9, 646.0], [60.0, 648.0], [60.1, 650.0], [60.2, 653.0], [60.3, 655.0], [60.4, 657.0], [60.5, 659.0], [60.6, 661.0], [60.7, 664.0], [60.8, 666.0], [60.9, 668.0], [61.0, 671.0], [61.1, 673.0], [61.2, 676.0], [61.3, 678.0], [61.4, 681.0], [61.5, 683.0], [61.6, 686.0], [61.7, 689.0], [61.8, 691.0], [61.9, 694.0], [62.0, 696.0], [62.1, 699.0], [62.2, 701.0], [62.3, 703.0], [62.4, 705.0], [62.5, 708.0], [62.6, 710.0], [62.7, 712.0], [62.8, 715.0], [62.9, 717.0], [63.0, 719.0], [63.1, 722.0], [63.2, 724.0], [63.3, 726.0], [63.4, 729.0], [63.5, 731.0], [63.6, 734.0], [63.7, 736.0], [63.8, 738.0], [63.9, 741.0], [64.0, 743.0], [64.1, 746.0], [64.2, 748.0], [64.3, 751.0], [64.4, 753.0], [64.5, 756.0], [64.6, 758.0], [64.7, 761.0], [64.8, 763.0], [64.9, 766.0], [65.0, 769.0], [65.1, 771.0], [65.2, 773.0], [65.3, 776.0], [65.4, 778.0], [65.5, 780.0], [65.6, 783.0], [65.7, 785.0], [65.8, 788.0], [65.9, 790.0], [66.0, 793.0], [66.1, 796.0], [66.2, 798.0], [66.3, 801.0], [66.4, 804.0], [66.5, 807.0], [66.6, 809.0], [66.7, 811.0], [66.8, 814.0], [66.9, 816.0], [67.0, 819.0], [67.1, 822.0], [67.2, 824.0], [67.3, 827.0], [67.4, 830.0], [67.5, 833.0], [67.6, 835.0], [67.7, 838.0], [67.8, 840.0], [67.9, 843.0], [68.0, 846.0], [68.1, 848.0], [68.2, 851.0], [68.3, 854.0], [68.4, 857.0], [68.5, 859.0], [68.6, 862.0], [68.7, 864.0], [68.8, 868.0], [68.9, 871.0], [69.0, 874.0], [69.1, 877.0], [69.2, 879.0], [69.3, 883.0], [69.4, 885.0], [69.5, 888.0], [69.6, 892.0], [69.7, 895.0], [69.8, 897.0], [69.9, 901.0], [70.0, 904.0], [70.1, 907.0], [70.2, 910.0], [70.3, 913.0], [70.4, 916.0], [70.5, 918.0], [70.6, 921.0], [70.7, 925.0], [70.8, 928.0], [70.9, 931.0], [71.0, 934.0], [71.1, 937.0], [71.2, 940.0], [71.3, 944.0], [71.4, 947.0], [71.5, 950.0], [71.6, 953.0], [71.7, 956.0], [71.8, 960.0], [71.9, 963.0], [72.0, 966.0], [72.1, 970.0], [72.2, 972.0], [72.3, 975.0], [72.4, 978.0], [72.5, 982.0], [72.6, 985.0], [72.7, 988.0], [72.8, 990.0], [72.9, 994.0], [73.0, 996.0], [73.1, 999.0], [73.2, 1003.0], [73.3, 1006.0], [73.4, 1009.0], [73.5, 1013.0], [73.6, 1016.0], [73.7, 1019.0], [73.8, 1022.0], [73.9, 1026.0], [74.0, 1029.0], [74.1, 1032.0], [74.2, 1035.0], [74.3, 1039.0], [74.4, 1042.0], [74.5, 1045.0], [74.6, 1048.0], [74.7, 1051.0], [74.8, 1055.0], [74.9, 1058.0], [75.0, 1061.0], [75.1, 1065.0], [75.2, 1068.0], [75.3, 1072.0], [75.4, 1075.0], [75.5, 1078.0], [75.6, 1081.0], [75.7, 1084.0], [75.8, 1088.0], [75.9, 1091.0], [76.0, 1095.0], [76.1, 1098.0], [76.2, 1101.0], [76.3, 1105.0], [76.4, 1108.0], [76.5, 1111.0], [76.6, 1115.0], [76.7, 1119.0], [76.8, 1123.0], [76.9, 1127.0], [77.0, 1131.0], [77.1, 1134.0], [77.2, 1138.0], [77.3, 1141.0], [77.4, 1145.0], [77.5, 1149.0], [77.6, 1153.0], [77.7, 1156.0], [77.8, 1160.0], [77.9, 1163.0], [78.0, 1167.0], [78.1, 1171.0], [78.2, 1175.0], [78.3, 1179.0], [78.4, 1183.0], [78.5, 1187.0], [78.6, 1190.0], [78.7, 1193.0], [78.8, 1198.0], [78.9, 1201.0], [79.0, 1205.0], [79.1, 1209.0], [79.2, 1213.0], [79.3, 1217.0], [79.4, 1221.0], [79.5, 1225.0], [79.6, 1229.0], [79.7, 1233.0], [79.8, 1238.0], [79.9, 1242.0], [80.0, 1246.0], [80.1, 1250.0], [80.2, 1254.0], [80.3, 1259.0], [80.4, 1263.0], [80.5, 1267.0], [80.6, 1271.0], [80.7, 1276.0], [80.8, 1280.0], [80.9, 1285.0], [81.0, 1289.0], [81.1, 1293.0], [81.2, 1298.0], [81.3, 1302.0], [81.4, 1307.0], [81.5, 1311.0], [81.6, 1315.0], [81.7, 1320.0], [81.8, 1324.0], [81.9, 1328.0], [82.0, 1333.0], [82.1, 1337.0], [82.2, 1341.0], [82.3, 1345.0], [82.4, 1350.0], [82.5, 1354.0], [82.6, 1357.0], [82.7, 1362.0], [82.8, 1367.0], [82.9, 1371.0], [83.0, 1375.0], [83.1, 1379.0], [83.2, 1384.0], [83.3, 1389.0], [83.4, 1393.0], [83.5, 1398.0], [83.6, 1403.0], [83.7, 1407.0], [83.8, 1412.0], [83.9, 1416.0], [84.0, 1421.0], [84.1, 1427.0], [84.2, 1432.0], [84.3, 1438.0], [84.4, 1443.0], [84.5, 1448.0], [84.6, 1453.0], [84.7, 1459.0], [84.8, 1463.0], [84.9, 1468.0], [85.0, 1474.0], [85.1, 1479.0], [85.2, 1484.0], [85.3, 1489.0], [85.4, 1495.0], [85.5, 1500.0], [85.6, 1506.0], [85.7, 1512.0], [85.8, 1518.0], [85.9, 1524.0], [86.0, 1530.0], [86.1, 1536.0], [86.2, 1542.0], [86.3, 1548.0], [86.4, 1554.0], [86.5, 1560.0], [86.6, 1566.0], [86.7, 1572.0], [86.8, 1578.0], [86.9, 1584.0], [87.0, 1591.0], [87.1, 1597.0], [87.2, 1604.0], [87.3, 1610.0], [87.4, 1615.0], [87.5, 1621.0], [87.6, 1628.0], [87.7, 1634.0], [87.8, 1640.0], [87.9, 1647.0], [88.0, 1653.0], [88.1, 1659.0], [88.2, 1665.0], [88.3, 1671.0], [88.4, 1678.0], [88.5, 1685.0], [88.6, 1693.0], [88.7, 1700.0], [88.8, 1708.0], [88.9, 1716.0], [89.0, 1723.0], [89.1, 1730.0], [89.2, 1738.0], [89.3, 1746.0], [89.4, 1753.0], [89.5, 1760.0], [89.6, 1769.0], [89.7, 1777.0], [89.8, 1785.0], [89.9, 1794.0], [90.0, 1803.0], [90.1, 1811.0], [90.2, 1820.0], [90.3, 1828.0], [90.4, 1837.0], [90.5, 1845.0], [90.6, 1854.0], [90.7, 1862.0], [90.8, 1869.0], [90.9, 1878.0], [91.0, 1887.0], [91.1, 1897.0], [91.2, 1905.0], [91.3, 1914.0], [91.4, 1924.0], [91.5, 1934.0], [91.6, 1944.0], [91.7, 1954.0], [91.8, 1963.0], [91.9, 1974.0], [92.0, 1985.0], [92.1, 1995.0], [92.2, 2006.0], [92.3, 2017.0], [92.4, 2029.0], [92.5, 2040.0], [92.6, 2051.0], [92.7, 2063.0], [92.8, 2074.0], [92.9, 2087.0], [93.0, 2099.0], [93.1, 2111.0], [93.2, 2123.0], [93.3, 2137.0], [93.4, 2150.0], [93.5, 2162.0], [93.6, 2173.0], [93.7, 2185.0], [93.8, 2198.0], [93.9, 2210.0], [94.0, 2223.0], [94.1, 2236.0], [94.2, 2249.0], [94.3, 2262.0], [94.4, 2277.0], [94.5, 2291.0], [94.6, 2303.0], [94.7, 2317.0], [94.8, 2330.0], [94.9, 2343.0], [95.0, 2355.0], [95.1, 2370.0], [95.2, 2386.0], [95.3, 2401.0], [95.4, 2415.0], [95.5, 2432.0], [95.6, 2447.0], [95.7, 2464.0], [95.8, 2483.0], [95.9, 2501.0], [96.0, 2522.0], [96.1, 2542.0], [96.2, 2562.0], [96.3, 2582.0], [96.4, 2602.0], [96.5, 2622.0], [96.6, 2645.0], [96.7, 2670.0], [96.8, 2693.0], [96.9, 2719.0], [97.0, 2751.0], [97.1, 2787.0], [97.2, 2818.0], [97.3, 2852.0], [97.4, 2895.0], [97.5, 2938.0], [97.6, 2974.0], [97.7, 3013.0], [97.8, 3055.0], [97.9, 3102.0], [98.0, 3163.0], [98.1, 3212.0], [98.2, 3268.0], [98.3, 3344.0], [98.4, 3411.0], [98.5, 3468.0], [98.6, 3540.0], [98.7, 3631.0], [98.8, 3706.0], [98.9, 3791.0], [99.0, 3883.0], [99.1, 3980.0], [99.2, 4087.0], [99.3, 4221.0], [99.4, 4370.0], [99.5, 4479.0], [99.6, 4621.0], [99.7, 4819.0], [99.8, 5060.0], [99.9, 5404.0], [100.0, 8045.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 25463.0, "series": [{"data": [[0.0, 25463.0], [600.0, 6098.0], [700.0, 5868.0], [800.0, 5125.0], [900.0, 4617.0], [1000.0, 4289.0], [1100.0, 3862.0], [1200.0, 3409.0], [1300.0, 3268.0], [1400.0, 2762.0], [1500.0, 2338.0], [1600.0, 2209.0], [1700.0, 1818.0], [1800.0, 1651.0], [1900.0, 1443.0], [2000.0, 1227.0], [2100.0, 1154.0], [2300.0, 1030.0], [2200.0, 1069.0], [2400.0, 853.0], [2500.0, 702.0], [2600.0, 624.0], [2800.0, 387.0], [2700.0, 446.0], [2900.0, 360.0], [3000.0, 329.0], [3100.0, 255.0], [3300.0, 194.0], [3200.0, 237.0], [3400.0, 228.0], [3500.0, 179.0], [3600.0, 181.0], [3700.0, 165.0], [3800.0, 155.0], [3900.0, 150.0], [4000.0, 122.0], [4300.0, 115.0], [4200.0, 94.0], [4100.0, 104.0], [4400.0, 128.0], [4500.0, 100.0], [4600.0, 58.0], [4700.0, 90.0], [4800.0, 49.0], [4900.0, 54.0], [5000.0, 80.0], [5100.0, 48.0], [5300.0, 32.0], [5200.0, 29.0], [5400.0, 34.0], [5500.0, 17.0], [5600.0, 13.0], [5700.0, 24.0], [5800.0, 7.0], [6100.0, 5.0], [5900.0, 8.0], [6000.0, 4.0], [6200.0, 3.0], [6300.0, 4.0], [6400.0, 4.0], [6600.0, 3.0], [6500.0, 2.0], [6700.0, 1.0], [6900.0, 2.0], [7000.0, 4.0], [7300.0, 1.0], [7200.0, 1.0], [7600.0, 3.0], [7700.0, 1.0], [7900.0, 1.0], [7800.0, 1.0], [8000.0, 1.0], [100.0, 17655.0], [200.0, 12803.0], [300.0, 10409.0], [400.0, 8524.0], [500.0, 7368.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 8000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 20608.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 74937.0, "series": [{"data": [[1.0, 46606.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 74937.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 20608.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 124.0, "minX": 1.54989564E12, "maxY": 1171.3073908089664, "series": [{"data": [[1.54989576E12, 1171.3073908089664], [1.54989564E12, 124.0], [1.54989582E12, 812.2671883733929], [1.5498957E12, 545.7569471624275]], "isOverall": false, "label": "bzm - Concurrency Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989582E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 11.0, "minX": 2.0, "maxY": 7054.0, "series": [{"data": [[2.0, 1312.5], [3.0, 1020.0], [4.0, 1192.0], [5.0, 1042.0], [6.0, 688.0], [7.0, 1478.0], [8.0, 1457.0], [10.0, 973.0], [11.0, 683.0], [12.0, 714.0], [13.0, 685.0], [14.0, 718.0], [15.0, 1020.0], [16.0, 1456.0], [17.0, 1112.0], [18.0, 2088.0], [20.0, 1574.0], [21.0, 1008.0], [22.0, 712.0], [23.0, 719.0], [24.0, 714.0], [25.0, 739.0], [27.0, 854.0], [28.0, 1027.0], [29.0, 685.0], [30.0, 1480.0], [31.0, 1476.0], [33.0, 997.0], [32.0, 1003.0], [35.0, 1234.0], [34.0, 723.0], [37.0, 1463.0], [36.0, 995.0], [39.0, 1006.0], [38.0, 1463.0], [41.0, 1477.0], [40.0, 717.0], [43.0, 1610.0], [42.0, 1476.0], [45.0, 735.0], [44.0, 1953.0], [47.0, 732.0], [46.0, 1092.0], [49.0, 731.0], [48.0, 1472.0], [51.0, 867.0], [53.0, 1196.0], [52.0, 1654.0], [55.0, 1075.0], [54.0, 939.0], [57.0, 1544.0], [59.0, 1473.0], [58.0, 1311.0], [61.0, 1746.0], [60.0, 1080.0], [63.0, 1668.0], [62.0, 1006.0], [66.0, 840.0], [65.0, 1470.0], [64.0, 839.0], [71.0, 1022.0], [70.0, 1084.0], [69.0, 1053.0], [68.0, 1090.0], [74.0, 1374.0], [73.0, 931.0], [72.0, 838.0], [79.0, 1462.0], [78.0, 828.0], [77.0, 1077.0], [76.0, 1040.5], [82.0, 1005.0], [81.0, 844.0], [80.0, 1278.0], [86.0, 959.0], [85.0, 895.0], [84.0, 1081.0], [91.0, 847.0], [90.0, 1011.0], [89.0, 1280.0], [88.0, 1259.0], [95.0, 1078.0], [94.0, 1035.0], [93.0, 1163.0], [99.0, 1119.5], [97.0, 995.0], [103.0, 859.5], [101.0, 1996.0], [100.0, 1168.0], [107.0, 905.0], [106.0, 1104.0], [105.0, 1005.0], [104.0, 1772.0], [111.0, 1010.5], [109.0, 1947.0], [108.0, 1809.0], [115.0, 1802.0], [114.0, 1003.0], [113.0, 2051.5], [119.0, 1400.0], [117.0, 1070.0], [116.0, 716.0], [123.0, 771.0], [122.0, 2769.0], [121.0, 770.0], [120.0, 1758.0], [124.0, 141.53460403902866], [125.0, 169.45454545454544], [126.0, 200.4], [127.0, 166.0769230769231], [130.0, 370.0], [131.0, 109.5], [135.0, 2294.0], [134.0, 2007.0], [133.0, 1873.0], [132.0, 1168.5], [129.0, 1041.5], [136.0, 164.0], [137.0, 1176.3333333333335], [142.0, 998.0], [141.0, 2003.0], [140.0, 1894.0], [139.0, 1876.0], [138.0, 1880.0], [151.0, 1261.0], [150.0, 895.0], [149.0, 874.0], [148.0, 728.0], [147.0, 1070.0], [146.0, 1729.0], [145.0, 1738.0], [144.0, 1761.5], [157.0, 493.3333333333333], [158.0, 1903.0], [155.0, 706.0], [154.0, 1263.0], [153.0, 1237.0], [152.0, 996.0], [160.0, 1173.6666666666667], [163.0, 495.5], [166.0, 814.0], [165.0, 1102.0], [164.0, 720.0], [162.0, 1083.5], [170.0, 873.0], [171.0, 431.3333333333333], [172.0, 201.0], [173.0, 276.09999999999997], [174.0, 145.82051282051285], [175.0, 1094.5], [169.0, 880.0], [168.0, 1411.5], [183.0, 718.0], [182.0, 1372.0], [180.0, 1848.0], [179.0, 1966.0], [178.0, 1146.0], [177.0, 754.0], [176.0, 751.0], [188.0, 1036.0], [189.0, 382.33333333333337], [191.0, 845.0], [190.0, 973.0], [187.0, 2356.0], [186.0, 718.0], [184.0, 848.0], [199.0, 1607.3333333333333], [196.0, 775.5], [194.0, 715.0], [193.0, 1089.0], [192.0, 801.0], [202.0, 825.6666666666666], [205.0, 226.0], [207.0, 3909.0], [206.0, 3879.5], [204.0, 1959.0], [203.0, 3881.0], [201.0, 935.0], [200.0, 3907.0], [208.0, 1089.75], [209.0, 1372.3333333333333], [215.0, 1043.0], [214.0, 909.0], [213.0, 1076.0], [212.0, 3305.0], [211.0, 2970.5], [217.0, 135.0], [221.0, 349.0], [223.0, 1975.0], [222.0, 796.0], [220.0, 793.5], [219.0, 829.0], [218.0, 813.0], [216.0, 772.0], [224.0, 322.0], [227.0, 166.0], [228.0, 588.0], [230.0, 93.0], [231.0, 440.8], [229.0, 867.0], [226.0, 807.0], [225.0, 829.0], [232.0, 307.66666666666663], [233.0, 409.33333333333337], [236.0, 529.0], [237.0, 89.0], [238.0, 608.6666666666666], [239.0, 466.0], [235.0, 804.0], [234.0, 793.0], [241.0, 534.0], [244.0, 652.0], [245.0, 323.0], [247.0, 718.0], [242.0, 1083.0], [240.0, 970.0], [248.0, 224.40943500738572], [249.0, 484.0], [250.0, 387.8], [251.0, 453.33333333333337], [252.0, 673.5], [253.0, 477.0], [254.0, 232.0], [255.0, 369.08333333333337], [268.0, 309.70000000000005], [257.0, 1399.0], [256.0, 508.33333333333337], [258.0, 257.25], [261.0, 1575.6666666666667], [260.0, 1381.0], [262.0, 3870.0], [263.0, 1411.3333333333333], [267.0, 310.54545454545456], [271.0, 936.0], [265.0, 2621.5], [266.0, 809.0], [269.0, 1502.3333333333333], [270.0, 302.70000000000005], [285.0, 1162.75], [272.0, 448.3333333333333], [278.0, 552.5], [277.0, 971.0], [276.0, 947.0], [279.0, 1076.0], [281.0, 636.0], [284.0, 899.0], [275.0, 798.0], [274.0, 1073.0], [273.0, 794.0], [287.0, 955.25], [286.0, 1014.0], [283.0, 3231.0], [282.0, 765.0], [301.0, 481.0], [289.0, 368.0], [288.0, 732.0], [295.0, 2365.0], [294.0, 3234.0], [291.0, 613.6], [290.0, 3813.0], [300.0, 1629.0], [292.0, 194.0], [293.0, 786.4285714285714], [296.0, 263.4], [297.0, 247.66666666666666], [299.0, 1834.6666666666667], [303.0, 1779.0], [302.0, 1936.5], [306.0, 385.0], [305.0, 1072.0], [304.0, 1918.0], [307.0, 825.6], [316.0, 1347.75], [317.0, 308.0], [319.0, 1791.0], [308.0, 899.6666666666667], [309.0, 1026.5], [310.0, 1016.0], [311.0, 608.5], [312.0, 829.3333333333334], [313.0, 565.0], [314.0, 219.20000000000002], [315.0, 1505.6666666666667], [332.0, 762.4], [321.0, 1015.0], [320.0, 817.2857142857142], [322.0, 235.5], [323.0, 1781.5], [326.0, 1159.0], [325.0, 1808.0], [324.0, 1798.0], [327.0, 865.3333333333334], [330.0, 236.5], [331.0, 1344.6666666666667], [333.0, 885.0], [334.0, 1197.0], [329.0, 1807.0], [328.0, 1599.0], [336.0, 1223.6666666666667], [337.0, 868.0], [338.0, 2641.0], [348.0, 1884.0], [339.0, 1486.0], [349.0, 589.7], [351.0, 1336.0], [344.0, 1877.0], [350.0, 2384.0], [340.0, 203.0], [341.0, 752.25], [342.0, 498.6], [343.0, 529.0], [345.0, 767.0], [346.0, 685.0], [347.0, 188.5], [353.0, 769.6666666666666], [356.0, 970.0], [357.0, 464.0], [358.0, 385.5], [360.0, 462.2857142857143], [367.0, 627.4], [361.0, 511.2], [363.0, 307.2], [362.0, 1879.0], [365.0, 178.0], [364.0, 960.0], [354.0, 344.0], [366.0, 672.0], [380.0, 1477.0], [368.0, 506.2], [371.0, 851.3333333333334], [372.0, 328.00852476669013], [373.0, 71.0], [375.0, 529.0], [374.0, 901.6666666666666], [378.0, 369.75], [379.0, 216.66666666666666], [382.0, 456.0], [381.0, 460.0], [383.0, 625.6666666666667], [377.0, 396.0], [376.0, 425.0], [397.0, 356.6666666666667], [384.0, 454.5], [387.0, 263.0], [386.0, 1038.0], [385.0, 2623.0], [388.0, 250.4], [390.0, 3349.0], [389.0, 407.0], [393.0, 384.3333333333333], [395.0, 296.0], [399.0, 396.0], [392.0, 397.0], [398.0, 1119.0], [394.0, 438.0], [414.0, 511.0], [402.0, 754.0], [403.0, 1011.0], [413.0, 1966.0], [412.0, 352.0], [404.0, 576.0], [405.0, 3123.0], [406.0, 541.5], [407.0, 70.0], [401.0, 3125.0], [400.0, 412.0], [408.0, 560.1666666666667], [409.0, 209.0], [410.0, 947.6666666666667], [411.0, 1766.0], [415.0, 1705.0], [430.0, 271.5], [425.0, 192.0], [420.0, 82.0], [421.0, 922.0], [423.0, 339.0], [417.0, 493.0], [416.0, 1665.0], [419.0, 341.0], [418.0, 497.0], [422.0, 516.0], [427.0, 1536.5], [431.0, 1574.0], [429.0, 519.0], [428.0, 516.0], [426.0, 1183.0], [424.0, 1230.0], [446.0, 887.3333333333334], [433.0, 462.3333333333333], [438.0, 100.0], [437.0, 1260.0], [436.0, 328.0], [447.0, 119.5], [444.0, 400.0], [435.0, 1575.0], [434.0, 2271.0], [443.0, 757.0], [441.0, 380.0], [440.0, 1574.0], [439.0, 492.0], [460.0, 690.6666666666667], [453.0, 887.0], [452.0, 351.0], [454.0, 248.0], [455.0, 854.0], [448.0, 1220.5], [450.0, 837.0], [449.0, 448.0], [456.0, 550.3333333333334], [458.0, 250.5], [457.0, 1802.0], [459.0, 376.22222222222223], [461.0, 737.4285714285714], [462.0, 667.9411764705881], [463.0, 1037.0], [478.0, 847.3333333333334], [471.0, 773.0], [466.0, 786.3333333333334], [464.0, 309.0], [470.0, 1099.3333333333333], [468.0, 780.0], [479.0, 90.0], [473.0, 1649.0], [472.0, 569.0], [477.0, 367.0], [476.0, 1024.0], [475.0, 1996.0], [474.0, 499.0], [494.0, 1356.5], [485.0, 512.25], [484.0, 1260.0], [486.0, 1576.0], [487.0, 241.5], [489.0, 239.0], [491.0, 440.0], [492.0, 688.6666666666666], [483.0, 1161.5], [481.0, 1736.0], [480.0, 1124.5], [495.0, 383.0], [490.0, 866.0], [488.0, 375.0], [499.0, 1309.5], [496.0, 431.1040452216904], [497.0, 969.0], [503.0, 491.0], [502.0, 2403.0], [501.0, 1842.0], [500.0, 423.0], [507.0, 925.0], [508.0, 787.6], [511.0, 11.0], [510.0, 557.0], [509.0, 316.0], [505.0, 1162.0], [504.0, 1236.0], [519.0, 1487.5], [514.0, 452.0], [513.0, 803.5], [512.0, 2599.0], [518.0, 234.7142857142857], [517.0, 1257.5], [515.0, 1228.6666666666667], [522.0, 1117.5], [521.0, 475.0], [520.0, 1208.0], [524.0, 1059.0], [523.0, 1222.0], [526.0, 1238.3333333333333], [530.0, 427.59999999999997], [529.0, 807.0], [528.0, 2024.0], [543.0, 1828.0], [542.0, 1810.0], [536.0, 29.0], [537.0, 1157.5], [540.0, 1231.0], [538.0, 830.0], [541.0, 313.0], [531.0, 507.0], [533.0, 30.0], [532.0, 396.0], [535.0, 646.0], [534.0, 1848.0], [548.0, 543.5], [547.0, 505.25], [546.0, 329.0], [545.0, 468.0], [544.0, 349.0], [550.0, 1462.0], [549.0, 994.0], [551.0, 1854.0], [569.0, 3017.0], [568.0, 483.5], [572.0, 2317.0], [571.0, 1379.5], [573.0, 362.6666666666667], [575.0, 254.0], [574.0, 1200.0], [555.0, 643.6666666666666], [554.0, 388.0], [553.0, 1005.0], [552.0, 1295.0], [556.0, 992.5], [557.0, 485.5], [558.0, 290.0], [559.0, 404.0], [560.0, 900.0], [562.0, 494.5], [561.0, 1506.0], [564.0, 1158.0], [565.0, 45.0], [566.0, 1396.0], [602.0, 927.0], [592.0, 1000.6666666666666], [577.0, 651.6666666666666], [576.0, 37.0], [591.0, 412.0], [590.0, 511.0], [581.0, 966.6666666666666], [580.0, 1556.0], [579.0, 814.0], [578.0, 483.0], [583.0, 1741.0], [582.0, 1181.0], [601.0, 1220.0], [600.0, 999.0], [603.0, 1163.0], [604.0, 1359.5], [606.0, 430.0], [605.0, 472.0], [607.0, 1047.5], [588.0, 1414.0], [587.0, 491.0], [586.0, 1292.0], [584.0, 1204.0], [589.0, 740.75], [593.0, 1046.5], [594.0, 2561.0], [595.0, 1396.0], [596.0, 815.0], [597.0, 736.25], [598.0, 474.6666666666667], [632.0, 110.0], [621.0, 907.0], [615.0, 775.0], [614.0, 1954.0], [613.0, 368.0], [612.0, 505.0], [611.0, 908.0], [610.0, 391.0], [609.0, 2553.0], [608.0, 1892.0], [616.0, 1314.0], [617.0, 184.5], [620.0, 546.0380772346743], [619.0, 640.0], [618.0, 1037.0], [622.0, 844.5], [623.0, 1369.0], [638.0, 971.5], [636.0, 1552.5], [634.0, 2727.0], [633.0, 504.5], [639.0, 480.0], [624.0, 1049.0], [627.0, 650.0], [625.0, 350.0], [629.0, 1286.0], [628.0, 1478.0], [631.0, 1680.0], [630.0, 1200.0], [647.0, 3146.0], [667.0, 23.0], [640.0, 366.33333333333337], [641.0, 135.5], [642.0, 386.0], [644.0, 2406.0], [643.0, 326.0], [646.0, 4201.0], [645.0, 1280.0], [664.0, 325.0], [666.0, 1001.0], [665.0, 1241.0], [648.0, 1290.5], [650.0, 3256.0], [649.0, 780.0], [651.0, 243.5], [652.0, 293.0], [655.0, 1422.0], [653.0, 904.0], [657.0, 270.5], [661.0, 406.5], [660.0, 323.0], [659.0, 3171.0], [658.0, 2806.0], [663.0, 471.5], [668.0, 385.3333333333333], [669.0, 3062.0], [670.0, 314.6666666666667], [671.0, 1718.0], [656.0, 808.0], [700.0, 2134.0], [673.0, 28.0], [674.0, 959.6666666666666], [676.0, 2789.0], [675.0, 1752.0], [678.0, 274.0], [677.0, 446.0], [696.0, 2358.0], [679.0, 1170.0], [686.0, 744.5], [685.0, 3105.0], [684.0, 2649.0], [683.0, 2247.0], [681.0, 859.5], [687.0, 228.0], [672.0, 1214.0], [693.0, 386.5], [692.0, 2286.0], [691.0, 1552.5], [689.0, 1832.0], [688.0, 454.0], [695.0, 1045.5], [703.0, 928.0], [702.0, 1920.0], [698.0, 585.0], [697.0, 1154.0], [728.0, 2457.0], [734.0, 920.0], [735.0, 1770.0], [721.0, 1254.0], [720.0, 2570.0], [732.0, 2695.0], [731.0, 2745.0], [730.0, 1503.0], [719.0, 370.0], [705.0, 1447.0], [704.0, 374.0], [707.0, 338.0], [706.0, 1467.0], [709.0, 745.0], [708.0, 3053.0], [711.0, 755.0], [710.0, 926.0], [718.0, 768.0], [716.0, 1038.0], [715.0, 2498.0], [714.0, 5221.0], [713.0, 238.0], [712.0, 1239.0], [727.0, 2600.0], [725.0, 2011.0], [723.0, 2228.0], [722.0, 983.0], [766.0, 622.6], [744.0, 678.0408749652424], [745.0, 1394.6666666666665], [747.0, 2180.0], [746.0, 710.5], [751.0, 1230.0], [736.0, 371.0], [739.0, 1524.5], [737.0, 781.0], [748.0, 1027.0], [767.0, 470.5714285714286], [754.0, 306.0], [764.0, 250.0], [763.0, 1413.0], [762.0, 1832.5], [760.0, 2332.0], [758.0, 736.0], [756.0, 1449.0], [798.0, 1685.0], [799.0, 332.0], [787.0, 2445.5], [785.0, 273.0], [797.0, 1738.0], [796.0, 538.0], [795.0, 981.0], [793.0, 1154.5], [783.0, 1012.0], [770.0, 1720.0], [768.0, 1819.0], [772.0, 960.5], [771.0, 942.0], [775.0, 1182.0], [774.0, 961.0], [781.0, 1159.5], [779.0, 1417.5], [777.0, 1321.5], [776.0, 1071.0], [791.0, 292.0], [790.0, 1157.0], [789.0, 334.0], [788.0, 1427.0], [825.0, 4488.0], [829.0, 4910.0], [831.0, 2630.5], [817.0, 329.0], [816.0, 2709.5], [819.0, 489.0], [818.0, 873.0], [821.0, 1091.0], [820.0, 4492.0], [828.0, 1108.0], [827.0, 1671.0], [826.0, 1120.0], [824.0, 878.0], [807.0, 250.0], [806.0, 2817.0], [805.0, 293.0], [804.0, 837.0], [803.0, 1725.0], [802.0, 793.0], [801.0, 2398.0], [800.0, 601.0], [814.0, 318.0], [813.0, 719.0], [812.0, 6020.0], [811.0, 2998.0], [810.0, 1228.0], [809.0, 1097.0], [823.0, 880.0], [822.0, 4714.0], [858.0, 1585.25], [862.0, 2368.0], [863.0, 225.0], [849.0, 4911.0], [848.0, 2229.666666666667], [861.0, 251.0], [860.0, 327.0], [859.0, 241.0], [845.0, 875.0], [832.0, 667.0], [834.0, 4557.0], [833.0, 744.0], [836.0, 1117.0], [835.0, 367.0], [839.0, 838.0], [838.0, 705.0], [844.0, 732.0], [843.0, 1484.0], [841.0, 394.0], [840.0, 394.0], [854.0, 2169.0], [853.0, 4669.0], [852.0, 2689.0], [851.0, 666.0], [889.0, 669.5], [894.0, 193.0], [868.0, 771.0078473336912], [867.0, 691.0], [866.0, 306.0], [865.0, 2351.0], [864.0, 2673.0], [869.0, 809.0], [871.0, 3304.0], [870.0, 1163.0], [879.0, 610.5], [877.0, 2743.0], [875.0, 1132.5], [874.0, 1096.0], [872.0, 2146.0], [895.0, 937.0], [880.0, 1057.0], [883.0, 1952.5], [882.0, 1629.5], [893.0, 1060.0], [892.0, 2345.0], [890.0, 3558.0], [887.0, 2765.0], [886.0, 1747.5], [911.0, 1487.6666666666667], [922.0, 1058.0], [902.0, 963.0], [901.0, 1792.5], [899.0, 3086.0], [898.0, 1734.5], [896.0, 221.0], [918.0, 316.0], [912.0, 1172.0], [909.0, 1153.0], [908.0, 2504.0], [906.0, 2476.0], [905.0, 694.5], [904.0, 3655.0], [956.0, 438.0], [958.0, 1501.5], [954.0, 1773.0], [952.0, 2642.0], [951.0, 1127.3333333333333], [949.0, 1163.0], [947.0, 1050.5], [945.0, 999.3333333333333], [943.0, 2174.5], [933.0, 3722.0], [928.0, 179.0], [940.0, 1702.772727272727], [939.0, 7054.0], [938.0, 2462.0], [988.0, 2407.0], [991.0, 1680.0], [978.0, 1001.5], [976.0, 718.0], [981.0, 1611.0], [979.0, 1680.0], [990.0, 1157.0], [989.0, 1630.0], [987.0, 1643.0], [986.0, 645.0], [985.0, 1083.0], [984.0, 394.0], [974.0, 785.0], [961.0, 1758.0], [960.0, 1066.5], [963.0, 627.0], [962.0, 2872.0], [967.0, 937.5], [965.0, 487.5], [972.0, 2611.5], [971.0, 656.0], [969.0, 1654.0], [983.0, 1025.0], [982.0, 1130.0], [998.0, 1154.0], [992.0, 864.8625165562905], [1012.0, 2916.0], [1009.0, 3158.0], [1008.0, 784.0], [1000.0, 1385.5], [997.0, 2458.0], [996.0, 1025.0], [995.0, 959.0], [993.0, 1563.0], [1078.0, 1611.0], [1056.0, 2591.5], [1060.0, 365.0], [1058.0, 1778.0], [1062.0, 1381.0], [1066.0, 1752.0], [1070.0, 726.0], [1084.0, 106.0], [1080.0, 2885.0], [1076.0, 1066.0], [1074.0, 5107.0], [1072.0, 1807.0], [1032.0, 166.0], [1054.0, 1275.0], [1052.0, 1250.5], [1050.0, 1527.5], [1048.0, 2947.0], [1046.0, 227.0], [1044.0, 1272.0], [1042.0, 1492.0], [1092.0, 1427.0], [1148.0, 1674.0], [1116.0, 1005.3085929545935], [1106.0, 825.0], [1104.0, 260.0], [1118.0, 624.0], [1096.0, 369.0], [1098.0, 101.0], [1102.0, 810.0], [1136.0, 2225.0], [1124.0, 231.0], [1122.0, 2687.5], [1128.0, 605.0], [1130.0, 926.0], [1134.0, 1916.5], [1132.0, 1912.5], [1146.0, 62.666666666666664], [1144.0, 158.0], [1142.0, 224.0], [1140.0, 916.0], [1150.0, 1541.5], [1164.0, 2109.3333333333335], [1162.0, 1601.0], [1158.0, 2404.0], [1152.0, 2038.5], [1166.0, 142.0], [1184.0, 456.0], [1214.0, 1213.5], [1210.0, 491.0], [1212.0, 1110.0], [1204.0, 440.0], [1202.0, 720.0], [1200.0, 808.3333333333334], [1206.0, 145.0], [1208.0, 1231.25], [1186.0, 1422.0], [1192.0, 670.0], [1188.0, 1093.0], [1196.0, 1028.6666666666667], [1198.0, 1853.0], [1168.0, 767.3333333333334], [1170.0, 206.0], [1172.0, 1737.0], [1176.0, 1405.6666666666667], [1178.0, 88.0], [1180.0, 883.5], [1182.0, 1161.8333333333333], [1238.0, 1867.0], [1220.0, 2065.5], [1232.0, 1528.5], [1234.0, 1066.0], [1236.0, 891.0], [1240.0, 1122.6384594335852], [1228.0, 27.5], [1226.0, 2121.0], [1224.0, 2285.0], [1085.0, 674.0], [1081.0, 100.0], [1057.0, 805.0], [1063.0, 228.0], [1065.0, 1384.0], [1069.0, 1883.6666666666667], [1083.0, 616.5], [1079.0, 1555.0], [1077.0, 268.0], [1075.0, 67.0], [1073.0, 1103.0], [1049.0, 2025.0], [1043.0, 1680.0277777777783], [1095.0, 527.6666666666666], [1139.0, 1247.5], [1113.0, 1682.5], [1111.0, 328.0], [1109.0, 147.5], [1107.0, 237.0], [1105.0, 685.0], [1119.0, 1183.0], [1089.0, 1857.5], [1091.0, 384.0], [1093.0, 2157.0], [1097.0, 1608.0], [1099.0, 3908.0], [1101.0, 1829.5], [1103.0, 91.0], [1121.0, 602.0], [1127.0, 105.0], [1125.0, 1842.0], [1129.0, 199.0], [1135.0, 196.0], [1131.0, 1772.0], [1143.0, 869.0], [1147.0, 184.0], [1149.0, 1582.5], [1161.0, 596.0], [1167.0, 1785.0], [1181.0, 762.6666666666666], [1159.0, 2463.0], [1157.0, 1037.0], [1155.0, 188.0], [1153.0, 3404.0], [1163.0, 136.0], [1165.0, 939.5], [1185.0, 1377.8], [1215.0, 1920.5], [1213.0, 1675.5], [1205.0, 1486.0], [1201.0, 86.0], [1207.0, 2135.0], [1195.0, 3428.0], [1193.0, 1604.5], [1191.0, 1606.5], [1189.0, 3495.0], [1187.0, 2440.0], [1197.0, 2544.5], [1199.0, 1570.0], [1171.0, 1745.0], [1177.0, 4197.0], [1179.0, 120.0], [1183.0, 173.0], [1219.0, 2290.0], [1235.0, 2094.0], [1233.0, 1690.25], [1217.0, 2233.0], [1231.0, 490.0], [1229.0, 67.0], [1225.0, 830.5], [1223.0, 89.0], [1221.0, 1582.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[814.6225492610057, 738.86372941449]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1240.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 4442.683333333333, "minX": 1.54989564E12, "maxY": 505978.3333333333, "series": [{"data": [[1.54989576E12, 501365.4666666667], [1.54989564E12, 61748.416666666664], [1.54989582E12, 13626.316666666668], [1.5498957E12, 505978.3333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54989576E12, 163465.41666666666], [1.54989564E12, 20132.383333333335], [1.54989582E12, 4442.683333333333], [1.5498957E12, 164967.83333333334]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989582E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 142.7452818551871, "minX": 1.54989564E12, "maxY": 1313.3275572945786, "series": [{"data": [[1.54989576E12, 1054.5840334219495], [1.54989564E12, 142.7452818551871], [1.54989582E12, 1313.3275572945786], [1.5498957E12, 483.29738070148926]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989582E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 142.7393610460088, "minX": 1.54989564E12, "maxY": 1313.3269983230862, "series": [{"data": [[1.54989576E12, 1054.582666160277], [1.54989564E12, 142.7393610460088], [1.54989582E12, 1313.3269983230862], [1.5498957E12, 483.2955742887253]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989582E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.07769703745109012, "minX": 1.54989564E12, "maxY": 25.937668059248292, "series": [{"data": [[1.54989576E12, 25.937668059248292], [1.54989564E12, 0.32404095226347535], [1.54989582E12, 0.07769703745109012], [1.5498957E12, 3.2815444829143625]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989582E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 4.0, "minX": 1.54989564E12, "maxY": 8045.0, "series": [{"data": [[1.54989576E12, 8045.0], [1.54989564E12, 1266.0], [1.54989582E12, 7054.0], [1.5498957E12, 6149.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54989576E12, 4.0], [1.54989564E12, 7.0], [1.54989582E12, 8.0], [1.5498957E12, 4.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54989576E12, 2473.0], [1.54989564E12, 226.0], [1.54989582E12, 2581.0], [1.5498957E12, 1551.9000000000015]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54989576E12, 4518.990000000002], [1.54989564E12, 1038.92], [1.54989582E12, 4616.81000000003], [1.5498957E12, 2898.950000000008]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54989576E12, 3148.9500000000007], [1.54989564E12, 275.0], [1.54989582E12, 3251.0], [1.5498957E12, 1893.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989582E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 124.0, "minX": 29.0, "maxY": 1066.0, "series": [{"data": [[135.0, 124.0], [1107.0, 549.0], [1097.0, 858.0], [29.0, 1066.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1107.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 124.0, "minX": 29.0, "maxY": 1066.0, "series": [{"data": [[135.0, 124.0], [1107.0, 549.0], [1097.0, 858.0], [29.0, 1066.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1107.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 9.166666666666666, "minX": 1.54989564E12, "maxY": 1119.5666666666666, "series": [{"data": [[1.54989576E12, 1103.2833333333333], [1.54989564E12, 137.16666666666666], [1.54989582E12, 9.166666666666666], [1.5498957E12, 1119.5666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989582E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 29.816666666666666, "minX": 1.54989564E12, "maxY": 1107.1666666666667, "series": [{"data": [[1.54989576E12, 1097.0833333333333], [1.54989564E12, 135.11666666666667], [1.54989582E12, 29.816666666666666], [1.5498957E12, 1107.1666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989582E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 29.816666666666666, "minX": 1.54989564E12, "maxY": 1107.1666666666667, "series": [{"data": [[1.54989576E12, 1097.0833333333333], [1.54989564E12, 135.11666666666667], [1.54989582E12, 29.816666666666666], [1.5498957E12, 1107.1666666666667]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989582E12, "title": "Transactions Per Second"}},
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
