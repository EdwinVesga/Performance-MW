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
        data: {"result": {"minY": 8.0, "minX": 0.0, "maxY": 36756.0, "series": [{"data": [[0.0, 8.0], [0.1, 16.0], [0.2, 20.0], [0.3, 23.0], [0.4, 26.0], [0.5, 28.0], [0.6, 31.0], [0.7, 33.0], [0.8, 35.0], [0.9, 37.0], [1.0, 39.0], [1.1, 41.0], [1.2, 42.0], [1.3, 44.0], [1.4, 46.0], [1.5, 47.0], [1.6, 49.0], [1.7, 51.0], [1.8, 53.0], [1.9, 54.0], [2.0, 56.0], [2.1, 57.0], [2.2, 59.0], [2.3, 60.0], [2.4, 62.0], [2.5, 64.0], [2.6, 65.0], [2.7, 67.0], [2.8, 69.0], [2.9, 70.0], [3.0, 72.0], [3.1, 73.0], [3.2, 75.0], [3.3, 76.0], [3.4, 78.0], [3.5, 79.0], [3.6, 81.0], [3.7, 82.0], [3.8, 83.0], [3.9, 85.0], [4.0, 86.0], [4.1, 88.0], [4.2, 89.0], [4.3, 90.0], [4.4, 92.0], [4.5, 93.0], [4.6, 94.0], [4.7, 95.0], [4.8, 97.0], [4.9, 98.0], [5.0, 99.0], [5.1, 100.0], [5.2, 101.0], [5.3, 102.0], [5.4, 103.0], [5.5, 104.0], [5.6, 105.0], [5.7, 106.0], [5.8, 108.0], [5.9, 109.0], [6.0, 110.0], [6.1, 111.0], [6.2, 112.0], [6.3, 113.0], [6.4, 114.0], [6.5, 115.0], [6.6, 116.0], [6.7, 117.0], [6.8, 118.0], [6.9, 119.0], [7.0, 120.0], [7.1, 121.0], [7.2, 122.0], [7.3, 123.0], [7.4, 124.0], [7.5, 125.0], [7.6, 126.0], [7.7, 127.0], [7.8, 128.0], [7.9, 129.0], [8.0, 130.0], [8.1, 131.0], [8.2, 132.0], [8.3, 133.0], [8.4, 134.0], [8.5, 135.0], [8.6, 136.0], [8.7, 137.0], [8.8, 138.0], [8.9, 139.0], [9.0, 139.0], [9.1, 140.0], [9.2, 142.0], [9.3, 142.0], [9.4, 143.0], [9.5, 144.0], [9.6, 145.0], [9.7, 146.0], [9.8, 147.0], [9.9, 148.0], [10.0, 149.0], [10.1, 150.0], [10.2, 151.0], [10.3, 152.0], [10.4, 153.0], [10.5, 153.0], [10.6, 155.0], [10.7, 155.0], [10.8, 156.0], [10.9, 157.0], [11.0, 158.0], [11.1, 159.0], [11.2, 160.0], [11.3, 161.0], [11.4, 162.0], [11.5, 163.0], [11.6, 164.0], [11.7, 165.0], [11.8, 165.0], [11.9, 166.0], [12.0, 167.0], [12.1, 168.0], [12.2, 169.0], [12.3, 170.0], [12.4, 171.0], [12.5, 171.0], [12.6, 172.0], [12.7, 173.0], [12.8, 174.0], [12.9, 175.0], [13.0, 176.0], [13.1, 176.0], [13.2, 177.0], [13.3, 178.0], [13.4, 179.0], [13.5, 180.0], [13.6, 180.0], [13.7, 181.0], [13.8, 182.0], [13.9, 183.0], [14.0, 184.0], [14.1, 185.0], [14.2, 185.0], [14.3, 186.0], [14.4, 187.0], [14.5, 188.0], [14.6, 189.0], [14.7, 190.0], [14.8, 191.0], [14.9, 191.0], [15.0, 192.0], [15.1, 193.0], [15.2, 194.0], [15.3, 195.0], [15.4, 196.0], [15.5, 197.0], [15.6, 198.0], [15.7, 199.0], [15.8, 200.0], [15.9, 201.0], [16.0, 201.0], [16.1, 202.0], [16.2, 203.0], [16.3, 204.0], [16.4, 205.0], [16.5, 206.0], [16.6, 207.0], [16.7, 208.0], [16.8, 208.0], [16.9, 209.0], [17.0, 210.0], [17.1, 211.0], [17.2, 212.0], [17.3, 213.0], [17.4, 214.0], [17.5, 215.0], [17.6, 215.0], [17.7, 216.0], [17.8, 217.0], [17.9, 218.0], [18.0, 219.0], [18.1, 220.0], [18.2, 221.0], [18.3, 222.0], [18.4, 222.0], [18.5, 223.0], [18.6, 224.0], [18.7, 225.0], [18.8, 226.0], [18.9, 226.0], [19.0, 227.0], [19.1, 228.0], [19.2, 229.0], [19.3, 230.0], [19.4, 231.0], [19.5, 232.0], [19.6, 233.0], [19.7, 234.0], [19.8, 234.0], [19.9, 235.0], [20.0, 236.0], [20.1, 237.0], [20.2, 238.0], [20.3, 239.0], [20.4, 240.0], [20.5, 240.0], [20.6, 241.0], [20.7, 242.0], [20.8, 243.0], [20.9, 244.0], [21.0, 245.0], [21.1, 246.0], [21.2, 247.0], [21.3, 248.0], [21.4, 249.0], [21.5, 250.0], [21.6, 250.0], [21.7, 251.0], [21.8, 252.0], [21.9, 253.0], [22.0, 254.0], [22.1, 255.0], [22.2, 256.0], [22.3, 257.0], [22.4, 258.0], [22.5, 259.0], [22.6, 260.0], [22.7, 261.0], [22.8, 261.0], [22.9, 263.0], [23.0, 263.0], [23.1, 264.0], [23.2, 265.0], [23.3, 266.0], [23.4, 267.0], [23.5, 268.0], [23.6, 269.0], [23.7, 270.0], [23.8, 271.0], [23.9, 272.0], [24.0, 273.0], [24.1, 274.0], [24.2, 275.0], [24.3, 276.0], [24.4, 277.0], [24.5, 278.0], [24.6, 279.0], [24.7, 279.0], [24.8, 280.0], [24.9, 281.0], [25.0, 282.0], [25.1, 283.0], [25.2, 284.0], [25.3, 285.0], [25.4, 286.0], [25.5, 287.0], [25.6, 288.0], [25.7, 289.0], [25.8, 290.0], [25.9, 291.0], [26.0, 292.0], [26.1, 293.0], [26.2, 294.0], [26.3, 294.0], [26.4, 295.0], [26.5, 296.0], [26.6, 298.0], [26.7, 299.0], [26.8, 300.0], [26.9, 301.0], [27.0, 302.0], [27.1, 303.0], [27.2, 304.0], [27.3, 305.0], [27.4, 306.0], [27.5, 307.0], [27.6, 308.0], [27.7, 309.0], [27.8, 311.0], [27.9, 311.0], [28.0, 312.0], [28.1, 313.0], [28.2, 314.0], [28.3, 315.0], [28.4, 316.0], [28.5, 317.0], [28.6, 318.0], [28.7, 319.0], [28.8, 320.0], [28.9, 321.0], [29.0, 322.0], [29.1, 323.0], [29.2, 324.0], [29.3, 325.0], [29.4, 326.0], [29.5, 328.0], [29.6, 329.0], [29.7, 330.0], [29.8, 331.0], [29.9, 332.0], [30.0, 333.0], [30.1, 334.0], [30.2, 335.0], [30.3, 336.0], [30.4, 337.0], [30.5, 338.0], [30.6, 339.0], [30.7, 340.0], [30.8, 341.0], [30.9, 343.0], [31.0, 344.0], [31.1, 344.0], [31.2, 346.0], [31.3, 347.0], [31.4, 348.0], [31.5, 349.0], [31.6, 350.0], [31.7, 351.0], [31.8, 352.0], [31.9, 353.0], [32.0, 354.0], [32.1, 355.0], [32.2, 357.0], [32.3, 358.0], [32.4, 359.0], [32.5, 360.0], [32.6, 361.0], [32.7, 362.0], [32.8, 363.0], [32.9, 365.0], [33.0, 366.0], [33.1, 367.0], [33.2, 368.0], [33.3, 370.0], [33.4, 371.0], [33.5, 372.0], [33.6, 373.0], [33.7, 374.0], [33.8, 376.0], [33.9, 377.0], [34.0, 378.0], [34.1, 379.0], [34.2, 380.0], [34.3, 382.0], [34.4, 383.0], [34.5, 384.0], [34.6, 386.0], [34.7, 387.0], [34.8, 388.0], [34.9, 389.0], [35.0, 391.0], [35.1, 392.0], [35.2, 393.0], [35.3, 395.0], [35.4, 396.0], [35.5, 397.0], [35.6, 399.0], [35.7, 400.0], [35.8, 402.0], [35.9, 403.0], [36.0, 404.0], [36.1, 405.0], [36.2, 407.0], [36.3, 408.0], [36.4, 409.0], [36.5, 411.0], [36.6, 412.0], [36.7, 414.0], [36.8, 415.0], [36.9, 417.0], [37.0, 418.0], [37.1, 420.0], [37.2, 421.0], [37.3, 423.0], [37.4, 424.0], [37.5, 426.0], [37.6, 427.0], [37.7, 428.0], [37.8, 430.0], [37.9, 431.0], [38.0, 433.0], [38.1, 435.0], [38.2, 436.0], [38.3, 437.0], [38.4, 439.0], [38.5, 441.0], [38.6, 442.0], [38.7, 444.0], [38.8, 445.0], [38.9, 446.0], [39.0, 448.0], [39.1, 450.0], [39.2, 452.0], [39.3, 453.0], [39.4, 455.0], [39.5, 456.0], [39.6, 458.0], [39.7, 459.0], [39.8, 461.0], [39.9, 462.0], [40.0, 464.0], [40.1, 465.0], [40.2, 467.0], [40.3, 469.0], [40.4, 471.0], [40.5, 472.0], [40.6, 474.0], [40.7, 475.0], [40.8, 477.0], [40.9, 479.0], [41.0, 481.0], [41.1, 483.0], [41.2, 485.0], [41.3, 486.0], [41.4, 488.0], [41.5, 490.0], [41.6, 492.0], [41.7, 494.0], [41.8, 496.0], [41.9, 497.0], [42.0, 499.0], [42.1, 501.0], [42.2, 502.0], [42.3, 504.0], [42.4, 506.0], [42.5, 508.0], [42.6, 510.0], [42.7, 511.0], [42.8, 513.0], [42.9, 515.0], [43.0, 516.0], [43.1, 518.0], [43.2, 520.0], [43.3, 522.0], [43.4, 524.0], [43.5, 526.0], [43.6, 529.0], [43.7, 531.0], [43.8, 533.0], [43.9, 535.0], [44.0, 537.0], [44.1, 539.0], [44.2, 541.0], [44.3, 544.0], [44.4, 546.0], [44.5, 548.0], [44.6, 551.0], [44.7, 553.0], [44.8, 555.0], [44.9, 557.0], [45.0, 560.0], [45.1, 561.0], [45.2, 564.0], [45.3, 566.0], [45.4, 569.0], [45.5, 571.0], [45.6, 573.0], [45.7, 576.0], [45.8, 578.0], [45.9, 581.0], [46.0, 583.0], [46.1, 586.0], [46.2, 588.0], [46.3, 591.0], [46.4, 593.0], [46.5, 595.0], [46.6, 598.0], [46.7, 600.0], [46.8, 602.0], [46.9, 605.0], [47.0, 608.0], [47.1, 611.0], [47.2, 613.0], [47.3, 616.0], [47.4, 618.0], [47.5, 621.0], [47.6, 624.0], [47.7, 627.0], [47.8, 629.0], [47.9, 631.0], [48.0, 634.0], [48.1, 637.0], [48.2, 639.0], [48.3, 642.0], [48.4, 644.0], [48.5, 647.0], [48.6, 650.0], [48.7, 654.0], [48.8, 657.0], [48.9, 660.0], [49.0, 662.0], [49.1, 665.0], [49.2, 668.0], [49.3, 671.0], [49.4, 674.0], [49.5, 677.0], [49.6, 681.0], [49.7, 684.0], [49.8, 687.0], [49.9, 690.0], [50.0, 694.0], [50.1, 697.0], [50.2, 699.0], [50.3, 703.0], [50.4, 706.0], [50.5, 710.0], [50.6, 713.0], [50.7, 717.0], [50.8, 720.0], [50.9, 722.0], [51.0, 726.0], [51.1, 729.0], [51.2, 732.0], [51.3, 735.0], [51.4, 739.0], [51.5, 742.0], [51.6, 746.0], [51.7, 751.0], [51.8, 754.0], [51.9, 759.0], [52.0, 763.0], [52.1, 766.0], [52.2, 770.0], [52.3, 773.0], [52.4, 777.0], [52.5, 781.0], [52.6, 784.0], [52.7, 789.0], [52.8, 793.0], [52.9, 797.0], [53.0, 801.0], [53.1, 805.0], [53.2, 808.0], [53.3, 813.0], [53.4, 818.0], [53.5, 822.0], [53.6, 826.0], [53.7, 831.0], [53.8, 835.0], [53.9, 839.0], [54.0, 843.0], [54.1, 848.0], [54.2, 853.0], [54.3, 858.0], [54.4, 862.0], [54.5, 868.0], [54.6, 872.0], [54.7, 877.0], [54.8, 883.0], [54.9, 888.0], [55.0, 894.0], [55.1, 898.0], [55.2, 904.0], [55.3, 909.0], [55.4, 914.0], [55.5, 920.0], [55.6, 925.0], [55.7, 931.0], [55.8, 936.0], [55.9, 941.0], [56.0, 948.0], [56.1, 953.0], [56.2, 959.0], [56.3, 965.0], [56.4, 969.0], [56.5, 976.0], [56.6, 981.0], [56.7, 988.0], [56.8, 994.0], [56.9, 1000.0], [57.0, 1006.0], [57.1, 1012.0], [57.2, 1017.0], [57.3, 1023.0], [57.4, 1028.0], [57.5, 1033.0], [57.6, 1037.0], [57.7, 1044.0], [57.8, 1050.0], [57.9, 1055.0], [58.0, 1060.0], [58.1, 1066.0], [58.2, 1072.0], [58.3, 1079.0], [58.4, 1085.0], [58.5, 1091.0], [58.6, 1098.0], [58.7, 1105.0], [58.8, 1111.0], [58.9, 1118.0], [59.0, 1123.0], [59.1, 1129.0], [59.2, 1135.0], [59.3, 1141.0], [59.4, 1147.0], [59.5, 1153.0], [59.6, 1158.0], [59.7, 1162.0], [59.8, 1169.0], [59.9, 1174.0], [60.0, 1181.0], [60.1, 1187.0], [60.2, 1192.0], [60.3, 1198.0], [60.4, 1204.0], [60.5, 1211.0], [60.6, 1217.0], [60.7, 1223.0], [60.8, 1230.0], [60.9, 1236.0], [61.0, 1241.0], [61.1, 1247.0], [61.2, 1253.0], [61.3, 1258.0], [61.4, 1264.0], [61.5, 1268.0], [61.6, 1274.0], [61.7, 1280.0], [61.8, 1286.0], [61.9, 1290.0], [62.0, 1295.0], [62.1, 1301.0], [62.2, 1308.0], [62.3, 1313.0], [62.4, 1319.0], [62.5, 1324.0], [62.6, 1329.0], [62.7, 1334.0], [62.8, 1340.0], [62.9, 1345.0], [63.0, 1350.0], [63.1, 1357.0], [63.2, 1362.0], [63.3, 1367.0], [63.4, 1372.0], [63.5, 1377.0], [63.6, 1383.0], [63.7, 1388.0], [63.8, 1393.0], [63.9, 1398.0], [64.0, 1403.0], [64.1, 1408.0], [64.2, 1414.0], [64.3, 1419.0], [64.4, 1424.0], [64.5, 1429.0], [64.6, 1434.0], [64.7, 1439.0], [64.8, 1444.0], [64.9, 1447.0], [65.0, 1452.0], [65.1, 1456.0], [65.2, 1461.0], [65.3, 1465.0], [65.4, 1470.0], [65.5, 1475.0], [65.6, 1480.0], [65.7, 1484.0], [65.8, 1488.0], [65.9, 1492.0], [66.0, 1497.0], [66.1, 1501.0], [66.2, 1506.0], [66.3, 1511.0], [66.4, 1516.0], [66.5, 1520.0], [66.6, 1525.0], [66.7, 1529.0], [66.8, 1533.0], [66.9, 1536.0], [67.0, 1540.0], [67.1, 1545.0], [67.2, 1548.0], [67.3, 1553.0], [67.4, 1557.0], [67.5, 1562.0], [67.6, 1566.0], [67.7, 1569.0], [67.8, 1573.0], [67.9, 1577.0], [68.0, 1581.0], [68.1, 1585.0], [68.2, 1589.0], [68.3, 1594.0], [68.4, 1598.0], [68.5, 1603.0], [68.6, 1607.0], [68.7, 1611.0], [68.8, 1615.0], [68.9, 1619.0], [69.0, 1623.0], [69.1, 1626.0], [69.2, 1630.0], [69.3, 1633.0], [69.4, 1637.0], [69.5, 1641.0], [69.6, 1644.0], [69.7, 1647.0], [69.8, 1650.0], [69.9, 1653.0], [70.0, 1658.0], [70.1, 1662.0], [70.2, 1665.0], [70.3, 1669.0], [70.4, 1673.0], [70.5, 1676.0], [70.6, 1680.0], [70.7, 1683.0], [70.8, 1687.0], [70.9, 1691.0], [71.0, 1695.0], [71.1, 1698.0], [71.2, 1701.0], [71.3, 1705.0], [71.4, 1708.0], [71.5, 1712.0], [71.6, 1715.0], [71.7, 1718.0], [71.8, 1721.0], [71.9, 1725.0], [72.0, 1728.0], [72.1, 1732.0], [72.2, 1736.0], [72.3, 1739.0], [72.4, 1742.0], [72.5, 1746.0], [72.6, 1749.0], [72.7, 1753.0], [72.8, 1756.0], [72.9, 1759.0], [73.0, 1762.0], [73.1, 1766.0], [73.2, 1769.0], [73.3, 1773.0], [73.4, 1776.0], [73.5, 1779.0], [73.6, 1783.0], [73.7, 1788.0], [73.8, 1791.0], [73.9, 1795.0], [74.0, 1799.0], [74.1, 1802.0], [74.2, 1805.0], [74.3, 1809.0], [74.4, 1812.0], [74.5, 1816.0], [74.6, 1818.0], [74.7, 1822.0], [74.8, 1825.0], [74.9, 1828.0], [75.0, 1831.0], [75.1, 1835.0], [75.2, 1839.0], [75.3, 1842.0], [75.4, 1845.0], [75.5, 1848.0], [75.6, 1852.0], [75.7, 1855.0], [75.8, 1859.0], [75.9, 1862.0], [76.0, 1866.0], [76.1, 1869.0], [76.2, 1873.0], [76.3, 1877.0], [76.4, 1880.0], [76.5, 1885.0], [76.6, 1889.0], [76.7, 1892.0], [76.8, 1896.0], [76.9, 1899.0], [77.0, 1902.0], [77.1, 1906.0], [77.2, 1909.0], [77.3, 1912.0], [77.4, 1915.0], [77.5, 1918.0], [77.6, 1922.0], [77.7, 1925.0], [77.8, 1928.0], [77.9, 1932.0], [78.0, 1936.0], [78.1, 1939.0], [78.2, 1943.0], [78.3, 1946.0], [78.4, 1949.0], [78.5, 1952.0], [78.6, 1955.0], [78.7, 1959.0], [78.8, 1963.0], [78.9, 1966.0], [79.0, 1969.0], [79.1, 1972.0], [79.2, 1976.0], [79.3, 1978.0], [79.4, 1981.0], [79.5, 1985.0], [79.6, 1988.0], [79.7, 1991.0], [79.8, 1995.0], [79.9, 1997.0], [80.0, 2000.0], [80.1, 2005.0], [80.2, 2008.0], [80.3, 2012.0], [80.4, 2015.0], [80.5, 2020.0], [80.6, 2023.0], [80.7, 2026.0], [80.8, 2030.0], [80.9, 2033.0], [81.0, 2036.0], [81.1, 2039.0], [81.2, 2043.0], [81.3, 2045.0], [81.4, 2049.0], [81.5, 2052.0], [81.6, 2055.0], [81.7, 2058.0], [81.8, 2061.0], [81.9, 2064.0], [82.0, 2068.0], [82.1, 2071.0], [82.2, 2074.0], [82.3, 2076.0], [82.4, 2079.0], [82.5, 2082.0], [82.6, 2085.0], [82.7, 2088.0], [82.8, 2091.0], [82.9, 2094.0], [83.0, 2098.0], [83.1, 2100.0], [83.2, 2104.0], [83.3, 2106.0], [83.4, 2109.0], [83.5, 2112.0], [83.6, 2115.0], [83.7, 2118.0], [83.8, 2121.0], [83.9, 2124.0], [84.0, 2127.0], [84.1, 2129.0], [84.2, 2132.0], [84.3, 2135.0], [84.4, 2137.0], [84.5, 2141.0], [84.6, 2144.0], [84.7, 2147.0], [84.8, 2149.0], [84.9, 2152.0], [85.0, 2155.0], [85.1, 2158.0], [85.2, 2160.0], [85.3, 2163.0], [85.4, 2166.0], [85.5, 2168.0], [85.6, 2171.0], [85.7, 2174.0], [85.8, 2177.0], [85.9, 2180.0], [86.0, 2184.0], [86.1, 2186.0], [86.2, 2189.0], [86.3, 2192.0], [86.4, 2194.0], [86.5, 2198.0], [86.6, 2201.0], [86.7, 2204.0], [86.8, 2207.0], [86.9, 2210.0], [87.0, 2214.0], [87.1, 2218.0], [87.2, 2222.0], [87.3, 2225.0], [87.4, 2229.0], [87.5, 2233.0], [87.6, 2236.0], [87.7, 2240.0], [87.8, 2243.0], [87.9, 2247.0], [88.0, 2250.0], [88.1, 2254.0], [88.2, 2258.0], [88.3, 2262.0], [88.4, 2266.0], [88.5, 2270.0], [88.6, 2273.0], [88.7, 2277.0], [88.8, 2282.0], [88.9, 2285.0], [89.0, 2290.0], [89.1, 2295.0], [89.2, 2299.0], [89.3, 2303.0], [89.4, 2307.0], [89.5, 2312.0], [89.6, 2317.0], [89.7, 2322.0], [89.8, 2326.0], [89.9, 2331.0], [90.0, 2336.0], [90.1, 2342.0], [90.2, 2347.0], [90.3, 2352.0], [90.4, 2358.0], [90.5, 2363.0], [90.6, 2370.0], [90.7, 2375.0], [90.8, 2383.0], [90.9, 2389.0], [91.0, 2396.0], [91.1, 2401.0], [91.2, 2407.0], [91.3, 2416.0], [91.4, 2423.0], [91.5, 2429.0], [91.6, 2438.0], [91.7, 2445.0], [91.8, 2453.0], [91.9, 2460.0], [92.0, 2470.0], [92.1, 2478.0], [92.2, 2488.0], [92.3, 2496.0], [92.4, 2505.0], [92.5, 2516.0], [92.6, 2528.0], [92.7, 2537.0], [92.8, 2547.0], [92.9, 2560.0], [93.0, 2569.0], [93.1, 2579.0], [93.2, 2591.0], [93.3, 2604.0], [93.4, 2615.0], [93.5, 2629.0], [93.6, 2642.0], [93.7, 2653.0], [93.8, 2667.0], [93.9, 2679.0], [94.0, 2692.0], [94.1, 2707.0], [94.2, 2721.0], [94.3, 2733.0], [94.4, 2747.0], [94.5, 2761.0], [94.6, 2776.0], [94.7, 2791.0], [94.8, 2806.0], [94.9, 2823.0], [95.0, 2841.0], [95.1, 2858.0], [95.2, 2874.0], [95.3, 2894.0], [95.4, 2913.0], [95.5, 2937.0], [95.6, 2955.0], [95.7, 2978.0], [95.8, 2998.0], [95.9, 3021.0], [96.0, 3045.0], [96.1, 3070.0], [96.2, 3097.0], [96.3, 3120.0], [96.4, 3143.0], [96.5, 3173.0], [96.6, 3205.0], [96.7, 3237.0], [96.8, 3268.0], [96.9, 3300.0], [97.0, 3337.0], [97.1, 3376.0], [97.2, 3416.0], [97.3, 3465.0], [97.4, 3513.0], [97.5, 3579.0], [97.6, 3638.0], [97.7, 3696.0], [97.8, 3785.0], [97.9, 3863.0], [98.0, 3979.0], [98.1, 4104.0], [98.2, 4227.0], [98.3, 4345.0], [98.4, 4485.0], [98.5, 4660.0], [98.6, 4836.0], [98.7, 5091.0], [98.8, 5400.0], [98.9, 5756.0], [99.0, 6075.0], [99.1, 6642.0], [99.2, 7991.0], [99.3, 9147.0], [99.4, 9983.0], [99.5, 11923.0], [99.6, 15848.0], [99.7, 19005.0], [99.8, 30588.0], [99.9, 36155.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 9852.0, "series": [{"data": [[0.0, 4516.0], [100.0, 9613.0], [35300.0, 6.0], [35700.0, 2.0], [36100.0, 17.0], [36500.0, 4.0], [200.0, 9852.0], [300.0, 7957.0], [400.0, 5703.0], [500.0, 4170.0], [600.0, 3153.0], [700.0, 2483.0], [800.0, 1926.0], [900.0, 1581.0], [1000.0, 1559.0], [1100.0, 1525.0], [1200.0, 1553.0], [1300.0, 1675.0], [1400.0, 1902.0], [1500.0, 2127.0], [1600.0, 2432.0], [1700.0, 2572.0], [1800.0, 2607.0], [1900.0, 2720.0], [2000.0, 2778.0], [2100.0, 3118.0], [2200.0, 2388.0], [2300.0, 1650.0], [2400.0, 1143.0], [2500.0, 825.0], [2600.0, 713.0], [2700.0, 625.0], [2800.0, 510.0], [2900.0, 436.0], [3000.0, 368.0], [3100.0, 330.0], [3200.0, 279.0], [3300.0, 233.0], [3400.0, 194.0], [3500.0, 142.0], [3600.0, 152.0], [3700.0, 99.0], [3800.0, 110.0], [3900.0, 69.0], [4000.0, 73.0], [4300.0, 77.0], [4100.0, 76.0], [4200.0, 76.0], [4600.0, 48.0], [4500.0, 49.0], [4400.0, 51.0], [4700.0, 55.0], [4800.0, 48.0], [5100.0, 37.0], [4900.0, 29.0], [5000.0, 34.0], [5300.0, 28.0], [5200.0, 23.0], [5500.0, 20.0], [5400.0, 27.0], [5600.0, 26.0], [5700.0, 31.0], [5800.0, 33.0], [6000.0, 25.0], [6100.0, 19.0], [5900.0, 25.0], [6300.0, 19.0], [6200.0, 16.0], [6400.0, 12.0], [6600.0, 14.0], [6500.0, 9.0], [6700.0, 20.0], [6800.0, 13.0], [6900.0, 4.0], [7000.0, 5.0], [7100.0, 13.0], [7200.0, 3.0], [7400.0, 3.0], [7300.0, 1.0], [7600.0, 2.0], [7500.0, 4.0], [7800.0, 5.0], [7900.0, 7.0], [7700.0, 3.0], [8000.0, 5.0], [8100.0, 8.0], [8200.0, 4.0], [8300.0, 8.0], [8500.0, 12.0], [8600.0, 11.0], [8700.0, 12.0], [8400.0, 4.0], [8900.0, 5.0], [9200.0, 7.0], [9000.0, 13.0], [9100.0, 7.0], [8800.0, 5.0], [9600.0, 9.0], [9500.0, 11.0], [9700.0, 15.0], [9400.0, 10.0], [9300.0, 3.0], [9800.0, 18.0], [9900.0, 13.0], [10000.0, 11.0], [10100.0, 10.0], [10200.0, 5.0], [10600.0, 4.0], [10500.0, 10.0], [10300.0, 9.0], [10400.0, 1.0], [10700.0, 2.0], [11100.0, 3.0], [11200.0, 4.0], [10800.0, 1.0], [10900.0, 2.0], [11000.0, 4.0], [11600.0, 8.0], [11400.0, 2.0], [11500.0, 3.0], [11300.0, 2.0], [11700.0, 3.0], [12200.0, 5.0], [12100.0, 2.0], [12000.0, 3.0], [11900.0, 4.0], [11800.0, 3.0], [12300.0, 2.0], [12400.0, 6.0], [12600.0, 3.0], [12500.0, 2.0], [12700.0, 4.0], [12800.0, 3.0], [12900.0, 1.0], [13200.0, 3.0], [13300.0, 1.0], [13100.0, 3.0], [13600.0, 1.0], [13400.0, 2.0], [13500.0, 1.0], [13800.0, 1.0], [14200.0, 2.0], [13900.0, 2.0], [14100.0, 5.0], [14300.0, 1.0], [14400.0, 1.0], [14600.0, 2.0], [14500.0, 5.0], [14700.0, 1.0], [15000.0, 3.0], [15200.0, 2.0], [15100.0, 3.0], [15300.0, 2.0], [15400.0, 6.0], [15500.0, 2.0], [15800.0, 2.0], [15700.0, 2.0], [15600.0, 3.0], [15900.0, 1.0], [16300.0, 1.0], [16000.0, 3.0], [16100.0, 3.0], [16800.0, 3.0], [17000.0, 2.0], [17200.0, 6.0], [17400.0, 2.0], [16400.0, 1.0], [17600.0, 3.0], [18000.0, 3.0], [18200.0, 3.0], [17800.0, 2.0], [18400.0, 2.0], [18600.0, 3.0], [18800.0, 6.0], [19400.0, 2.0], [19000.0, 8.0], [19200.0, 2.0], [22400.0, 1.0], [22800.0, 2.0], [23400.0, 6.0], [23000.0, 2.0], [23200.0, 2.0], [23600.0, 1.0], [23800.0, 3.0], [24400.0, 3.0], [24200.0, 1.0], [28600.0, 1.0], [28800.0, 3.0], [29000.0, 3.0], [29600.0, 2.0], [29400.0, 1.0], [29800.0, 3.0], [30200.0, 4.0], [30000.0, 6.0], [30400.0, 4.0], [30600.0, 10.0], [30800.0, 6.0], [31000.0, 22.0], [31400.0, 2.0], [32200.0, 1.0], [33600.0, 1.0], [35600.0, 1.0], [36000.0, 4.0], [36400.0, 10.0], [35500.0, 10.0], [36300.0, 31.0], [35900.0, 1.0], [36700.0, 1.0], [17300.0, 5.0], [16700.0, 3.0], [16900.0, 4.0], [17100.0, 5.0], [16500.0, 3.0], [17700.0, 2.0], [17900.0, 5.0], [18100.0, 6.0], [18300.0, 1.0], [18500.0, 5.0], [18900.0, 6.0], [19100.0, 1.0], [19300.0, 2.0], [21500.0, 1.0], [22300.0, 1.0], [22700.0, 1.0], [23300.0, 2.0], [23100.0, 1.0], [23500.0, 2.0], [24500.0, 2.0], [24900.0, 1.0], [28300.0, 1.0], [28500.0, 2.0], [27900.0, 1.0], [29500.0, 2.0], [29900.0, 5.0], [30100.0, 1.0], [29700.0, 1.0], [30300.0, 2.0], [30500.0, 3.0], [30700.0, 6.0], [30900.0, 4.0], [31300.0, 1.0], [31100.0, 2.0], [32700.0, 1.0], [36200.0, 28.0], [36600.0, 5.0], [35400.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 36700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 21491.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 37693.0, "series": [{"data": [[1.0, 21491.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 37693.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 30383.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 310.28492681999813, "minX": 1.5498888E12, "maxY": 1252.4551455959495, "series": [{"data": [[1.54988892E12, 1252.4551455959495], [1.54988886E12, 947.2603169202432], [1.5498888E12, 310.28492681999813]], "isOverall": false, "label": "bzm - Concurrency Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54988892E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 60.0, "minX": 1.0, "maxY": 36756.0, "series": [{"data": [[3.0, 32491.5], [4.0, 31065.0], [5.0, 31070.0], [6.0, 31072.0], [7.0, 31092.0], [8.0, 31084.0], [9.0, 31086.0], [10.0, 31073.0], [11.0, 31074.0], [12.0, 31074.0], [13.0, 31085.0], [14.0, 31083.0], [15.0, 31072.0], [16.0, 31082.0], [17.0, 31063.0], [18.0, 31088.0], [19.0, 31078.0], [20.0, 31061.0], [21.0, 31083.0], [22.0, 31061.0], [23.0, 2914.0], [24.0, 2920.0], [25.0, 2930.0], [26.0, 2948.0], [27.0, 2936.0], [28.0, 3239.0], [29.0, 3263.0], [30.0, 3182.0], [31.0, 3347.0], [33.0, 3224.0], [32.0, 2926.0], [35.0, 3091.0], [34.0, 5913.0], [37.0, 5857.0], [36.0, 5885.0], [39.0, 3113.0], [38.0, 3237.0], [40.0, 5854.0], [42.0, 4537.5], [45.0, 3275.0], [44.0, 4625.5], [47.0, 3425.0], [46.0, 3303.0], [49.0, 6098.0], [48.0, 3143.0], [51.0, 6203.0], [50.0, 12005.0], [53.0, 6036.0], [52.0, 11832.0], [55.0, 36318.0], [54.0, 4475.0], [57.0, 4652.0], [56.0, 36344.0], [59.0, 35456.0], [58.0, 6129.0], [61.0, 11649.0], [60.0, 5603.0], [63.0, 4402.0], [62.0, 36312.0], [67.0, 6109.0], [66.0, 4404.0], [65.0, 6199.0], [64.0, 36336.0], [71.0, 36376.0], [70.0, 6113.0], [69.0, 5687.0], [68.0, 5994.0], [75.0, 5908.0], [74.0, 4409.0], [73.0, 36374.0], [72.0, 5817.0], [76.0, 874.125], [77.0, 3044.5], [78.0, 3788.6666666666665], [79.0, 5942.0], [81.0, 2099.666666666667], [82.0, 6049.5], [83.0, 4640.0], [80.0, 30891.0], [84.0, 11886.333333333334], [85.0, 9220.25], [86.0, 2856.5], [87.0, 9562.0], [89.0, 17804.5], [91.0, 5600.5], [90.0, 30968.0], [88.0, 36593.0], [92.0, 1221.0], [95.0, 12423.0], [94.0, 19075.0], [93.0, 36333.0], [96.0, 5999.0], [99.0, 10309.0], [98.0, 17353.0], [97.0, 6438.0], [102.0, 4790.0], [103.0, 36422.0], [101.0, 30920.0], [100.0, 11882.0], [106.0, 2073.666666666667], [107.0, 97.0], [105.0, 19062.0], [104.0, 6061.0], [108.0, 15697.333333333334], [109.0, 2049.0], [110.0, 18196.5], [111.0, 8694.5], [112.0, 2068.666666666667], [113.0, 4465.25], [114.0, 82.0], [115.0, 4137.0], [116.0, 2151.0], [118.0, 18276.5], [119.0, 2103.166666666667], [117.0, 36355.0], [120.0, 17957.0], [123.0, 15545.5], [122.0, 5979.0], [121.0, 36491.0], [124.0, 18315.5], [125.0, 18273.5], [126.0, 3010.5], [127.0, 4100.666666666666], [128.0, 12218.333333333334], [129.0, 192.54706565950005], [130.0, 9348.25], [131.0, 5385.571428571428], [135.0, 142.75], [134.0, 31164.0], [133.0, 36499.0], [132.0, 12278.0], [136.0, 17012.5], [137.0, 4240.222222222223], [138.0, 15792.5], [142.0, 10906.0], [141.0, 11728.0], [140.0, 5708.0], [139.0, 36606.0], [145.0, 1993.6666666666667], [146.0, 7848.75], [147.0, 18397.5], [151.0, 35396.0], [150.0, 36240.0], [149.0, 36756.0], [148.0, 5839.0], [144.0, 24499.0], [159.0, 36209.0], [158.0, 5742.0], [157.0, 5790.0], [156.0, 36544.0], [155.0, 36291.5], [153.0, 18992.0], [152.0, 19005.0], [165.0, 5362.5714285714275], [166.0, 3056.0], [167.0, 2011.6666666666667], [164.0, 18856.0], [163.0, 6426.0], [162.0, 5876.0], [161.0, 36691.0], [160.0, 6110.0], [170.0, 12247.0], [172.0, 6354.0], [173.0, 18355.5], [174.0, 18224.0], [175.0, 36432.0], [171.0, 36226.0], [169.0, 23996.5], [176.0, 11916.666666666666], [177.0, 12091.0], [179.0, 18113.0], [181.0, 4365.25], [183.0, 36635.0], [182.0, 36287.0], [180.0, 36421.0], [178.0, 18491.0], [186.0, 18123.5], [187.0, 18168.5], [189.0, 15756.5], [191.0, 31076.0], [190.0, 36155.0], [188.0, 36227.0], [185.0, 36155.0], [184.0, 19015.0], [194.0, 12310.333333333334], [198.0, 12219.666666666666], [199.0, 36216.0], [197.0, 36164.0], [196.0, 36316.0], [195.0, 36373.0], [193.0, 36256.0], [192.0, 31183.0], [206.0, 18246.0], [207.0, 11697.0], [205.0, 35333.0], [204.0, 36124.0], [203.0, 36130.0], [202.0, 35524.0], [201.0, 36277.0], [200.0, 36124.0], [208.0, 7897.25], [210.0, 8104.0], [215.0, 15477.5], [214.0, 36212.0], [213.0, 36150.0], [212.0, 16820.0], [211.0, 35518.0], [209.0, 35363.0], [217.0, 15479.0], [218.0, 6237.0], [220.0, 15487.0], [222.0, 18406.5], [223.0, 36323.0], [221.0, 36279.0], [219.0, 16100.0], [216.0, 36261.0], [224.0, 6287.8], [225.0, 9223.0], [226.0, 18215.5], [228.0, 6390.0], [230.0, 4078.25], [231.0, 36107.0], [229.0, 30691.0], [227.0, 36161.0], [233.0, 10324.333333333334], [234.0, 12266.333333333334], [239.0, 9177.0], [238.0, 30844.0], [237.0, 36339.0], [236.0, 17952.0], [235.0, 36307.0], [232.0, 18917.0], [241.0, 12236.0], [243.0, 1713.6923076923076], [244.0, 6042.999999999999], [245.0, 17732.0], [247.0, 30680.0], [246.0, 19253.0], [242.0, 3983.0], [240.0, 16119.0], [248.0, 5704.666666666667], [249.0, 7383.8], [251.0, 9755.0], [252.0, 9710.0], [253.0, 5526.333333333333], [254.0, 10288.666666666666], [255.0, 18112.0], [250.0, 29090.0], [268.0, 7410.4], [257.0, 7916.75], [256.0, 18256.0], [258.0, 375.5306092773022], [259.0, 36176.0], [261.0, 10522.666666666666], [260.0, 36088.0], [262.0, 36292.0], [263.0, 36369.0], [264.0, 439.0], [265.0, 6013.714285714285], [266.0, 15830.0], [267.0, 18386.5], [269.0, 1207.75], [270.0, 15528.5], [271.0, 12233.333333333334], [285.0, 12343.333333333334], [274.0, 2225.5], [279.0, 36302.0], [273.0, 36261.0], [272.0, 30932.0], [278.0, 36392.0], [276.0, 15466.5], [277.0, 1991.3333333333333], [281.0, 1351.75], [282.0, 1952.5], [283.0, 18925.0], [286.0, 1842.5], [287.0, 36250.0], [280.0, 17138.0], [284.0, 19188.0], [275.0, 5840.0], [300.0, 750.5], [290.0, 4602.2], [288.0, 9809.0], [291.0, 1603.0], [294.0, 988.3333333333334], [293.0, 36234.0], [292.0, 3119.0], [295.0, 2009.0], [297.0, 1437.3333333333335], [298.0, 499.5], [299.0, 2131.333333333333], [301.0, 1365.75], [303.0, 2692.5], [296.0, 2485.0], [302.0, 3785.0], [318.0, 1381.6666666666665], [305.0, 1683.3333333333335], [306.0, 15535.5], [307.0, 2881.0], [309.0, 8146.0], [308.0, 3730.0], [310.0, 8167.5], [311.0, 12302.666666666666], [304.0, 1515.0], [319.0, 1343.0], [313.0, 856.0], [312.0, 18970.0], [315.0, 3018.0], [314.0, 897.0], [317.0, 2853.0], [316.0, 19038.0], [332.0, 1325.5], [320.0, 679.0], [323.0, 1094.3333333333333], [322.0, 3284.0], [321.0, 4432.0], [324.0, 15535.5], [325.0, 30682.0], [327.0, 2475.0], [326.0, 2779.0], [328.0, 9632.0], [331.0, 1382.0], [330.0, 18567.0], [329.0, 3257.0], [333.0, 967.0], [335.0, 30683.0], [334.0, 2118.0], [349.0, 865.0], [339.0, 2285.5], [343.0, 753.0], [336.0, 30472.0], [338.0, 5385.0], [337.0, 1441.0], [348.0, 30797.0], [341.0, 503.0], [340.0, 3410.0], [342.0, 1368.0], [344.0, 1904.0], [346.0, 1830.5], [345.0, 30396.0], [347.0, 18135.5], [350.0, 12279.666666666666], [351.0, 2909.0], [366.0, 9618.5], [353.0, 1725.3333333333333], [354.0, 9887.5], [355.0, 2161.0], [365.0, 3773.0], [364.0, 5944.0], [356.0, 18103.0], [357.0, 8571.0], [359.0, 7940.0], [352.0, 812.0], [358.0, 29035.0], [360.0, 1835.5], [361.0, 794.5], [363.0, 3036.0], [362.0, 36364.0], [367.0, 36350.0], [371.0, 1173.6666666666665], [373.0, 1928.6666666666667], [372.0, 4491.0], [375.0, 729.0], [368.0, 18613.0], [370.0, 18986.0], [369.0, 18853.0], [374.0, 4340.0], [376.0, 680.0], [379.0, 6481.8], [383.0, 1848.0], [381.0, 3475.0], [380.0, 717.0], [378.0, 3600.0], [377.0, 4392.0], [387.0, 557.7981193064945], [384.0, 1295.0], [385.0, 2444.0], [386.0, 1197.75], [389.0, 539.0], [388.0, 3649.0], [390.0, 2447.0], [391.0, 4724.0], [393.0, 755.4], [392.0, 4990.0], [395.0, 2079.0], [394.0, 4898.0], [399.0, 1508.0], [398.0, 2354.0], [397.0, 1594.0], [396.0, 4650.0], [414.0, 3616.0], [408.0, 641.4], [407.0, 1011.6666666666667], [401.0, 2953.0], [400.0, 1866.0], [403.0, 2950.0], [402.0, 2985.0], [406.0, 705.0], [405.0, 1863.0], [404.0, 5744.0], [410.0, 1262.0], [415.0, 693.0], [413.0, 2369.0], [412.0, 7065.0], [411.0, 2956.0], [409.0, 1468.0], [428.0, 727.5], [416.0, 485.0], [418.0, 1085.5], [417.0, 1395.0], [419.0, 30589.0], [420.0, 618.25], [421.0, 2615.0], [422.0, 932.5], [423.0, 421.66666666666663], [431.0, 1261.0], [425.0, 710.0], [424.0, 5805.0], [427.0, 2849.0], [426.0, 4916.0], [430.0, 648.0], [429.0, 2705.0], [445.0, 3884.0], [447.0, 663.0], [436.0, 652.5], [438.0, 36235.0], [437.0, 1112.0], [441.0, 903.6666666666666], [446.0, 614.0], [444.0, 1169.0], [435.0, 681.0], [434.0, 1297.0], [433.0, 5052.0], [432.0, 4063.0], [443.0, 593.0], [442.0, 2712.0], [439.0, 2047.0], [460.0, 877.5], [449.0, 777.0], [451.0, 938.5], [450.0, 612.0], [453.0, 1962.5], [452.0, 7042.0], [454.0, 1685.0], [455.0, 3875.0], [448.0, 1444.0], [457.0, 1657.5], [458.0, 1411.0], [459.0, 649.0], [461.0, 297.6666666666667], [463.0, 673.0], [456.0, 635.0], [462.0, 1841.0], [465.0, 1223.0], [464.0, 633.0], [467.0, 3063.0], [466.0, 15604.0], [476.0, 1085.0], [477.0, 365.0], [479.0, 1115.0], [472.0, 1146.0], [478.0, 652.0], [468.0, 730.75], [469.0, 416.66666666666663], [470.0, 760.6666666666667], [471.0, 694.6666666666667], [473.0, 754.0], [474.0, 944.0], [475.0, 577.0], [494.0, 450.3333333333333], [481.0, 403.0], [480.0, 774.0], [483.0, 1082.0], [482.0, 1238.0], [487.0, 1259.5], [486.0, 531.0], [485.0, 1207.0], [484.0, 2765.0], [495.0, 659.5], [489.0, 6326.0], [488.0, 640.0], [493.0, 1188.0], [492.0, 1189.0], [491.0, 610.0], [490.0, 1695.0], [510.0, 1076.0], [503.0, 2384.0], [497.0, 1150.0], [496.0, 612.0], [499.0, 1715.0], [498.0, 1595.0], [502.0, 523.0], [501.0, 517.0], [500.0, 1566.0], [505.0, 1008.3333333333334], [506.0, 539.0], [507.0, 2213.25], [508.0, 670.6666666666666], [511.0, 1477.0], [509.0, 539.0], [504.0, 5962.0], [539.0, 1229.0], [516.0, 723.6995476433665], [518.0, 60.0], [536.0, 1549.0], [519.0, 963.0], [538.0, 2163.0], [537.0, 3003.0], [524.0, 3451.5], [523.0, 1243.0], [522.0, 6360.0], [521.0, 5319.0], [520.0, 560.0], [525.0, 595.0], [527.0, 5313.0], [513.0, 6050.0], [512.0, 4580.0], [515.0, 2909.0], [514.0, 2571.0], [526.0, 1798.0], [528.0, 1140.5], [532.0, 1275.6666666666667], [531.0, 3403.0], [530.0, 581.0], [529.0, 7287.0], [533.0, 15624.0], [535.0, 572.0], [534.0, 3810.0], [541.0, 813.0], [540.0, 1376.0], [543.0, 30415.0], [542.0, 496.0], [572.0, 1075.0], [549.0, 1639.5], [548.0, 2312.5], [547.0, 2268.0], [546.0, 5733.0], [545.0, 1008.0], [544.0, 5282.0], [550.0, 721.0], [551.0, 1095.0], [569.0, 1353.0], [568.0, 2753.0], [571.0, 3711.0], [570.0, 4515.0], [575.0, 5037.0], [560.0, 1561.0], [574.0, 464.0], [573.0, 6186.0], [552.0, 3581.5], [554.0, 4034.0], [553.0, 1104.0], [556.0, 1239.0], [555.0, 960.0], [557.0, 1475.6666666666667], [558.0, 1005.5], [559.0, 2084.0], [561.0, 2033.0], [563.0, 771.5], [562.0, 4521.0], [565.0, 5492.0], [564.0, 2508.0], [566.0, 1397.5], [567.0, 1771.0], [601.0, 589.0], [579.0, 880.5], [582.0, 411.3333333333333], [581.0, 473.0], [580.0, 1004.0], [600.0, 1845.0], [583.0, 588.0], [585.0, 545.0], [584.0, 5332.0], [587.0, 1319.0], [586.0, 1153.0], [590.0, 985.6666666666667], [591.0, 2359.0], [576.0, 531.0], [578.0, 1170.0], [577.0, 3369.0], [593.0, 613.0], [599.0, 426.0], [598.0, 1278.0], [597.0, 1287.0], [596.0, 1333.0], [595.0, 1563.0], [594.0, 1435.0], [603.0, 3104.5], [602.0, 1197.0], [604.0, 1064.0], [606.0, 1399.0], [592.0, 1324.0], [605.0, 4174.0], [635.0, 3880.5], [616.0, 2086.0], [617.0, 2774.0], [620.0, 835.0], [618.0, 1111.0], [621.0, 765.3333333333334], [630.0, 3035.333333333333], [628.0, 1436.0], [627.0, 519.0], [626.0, 491.0], [625.0, 2093.0], [624.0, 1519.0], [631.0, 434.0], [632.0, 1217.5], [615.0, 2126.5], [613.0, 2750.0], [612.0, 441.0], [611.0, 1310.0], [610.0, 2574.5], [608.0, 2351.5], [623.0, 5040.0], [622.0, 442.0], [634.0, 3751.0], [633.0, 1080.0], [636.0, 806.5], [637.0, 3451.0], [638.0, 580.0], [639.0, 1110.0], [645.0, 904.1841251106497], [643.0, 1319.0], [641.0, 691.0], [642.0, 7244.0], [655.0, 1768.0], [640.0, 1571.0], [644.0, 593.0], [649.0, 1333.0], [648.0, 3246.0], [651.0, 1805.0], [650.0, 1637.0], [653.0, 1987.0], [652.0, 1790.0], [654.0, 3826.0], [661.0, 1948.0], [660.0, 1921.0], [658.0, 5525.0], [657.0, 4173.0], [656.0, 2936.0], [663.0, 3684.0], [662.0, 542.0], [671.0, 1123.0], [670.0, 1647.0], [669.0, 928.0], [668.0, 400.0], [667.0, 2667.0], [665.0, 3325.3333333333335], [664.0, 1417.0], [647.0, 1314.0], [646.0, 3638.0], [666.0, 800.5], [698.0, 1614.0], [672.0, 687.5], [673.0, 3392.0], [674.0, 1906.5], [678.0, 565.0], [677.0, 35565.0], [676.0, 2838.0], [675.0, 35709.0], [679.0, 410.0], [680.0, 1028.5], [682.0, 1010.0], [681.0, 5431.0], [684.0, 438.0], [683.0, 457.0], [686.0, 1050.0], [685.0, 1898.0], [687.0, 1421.0], [702.0, 1336.3333333333333], [689.0, 2100.0], [688.0, 4155.0], [691.0, 1675.0], [690.0, 1556.0], [693.0, 2037.0], [692.0, 7150.0], [695.0, 1333.0], [694.0, 2748.0], [701.0, 3238.0], [699.0, 1787.0], [697.0, 5003.0], [696.0, 6125.0], [731.0, 813.5], [721.0, 1157.0], [708.0, 5909.5], [704.0, 2784.0], [705.0, 5704.0], [707.0, 1548.0], [706.0, 1605.0], [719.0, 3869.0], [718.0, 1327.0], [717.0, 2142.5], [715.0, 3396.0], [709.0, 1939.0], [711.0, 1487.0], [710.0, 3646.0], [730.0, 2506.5], [728.0, 1052.0], [733.0, 2097.0], [732.0, 340.0], [735.0, 658.0], [720.0, 1474.0], [734.0, 1393.0], [712.0, 1519.5], [713.0, 3326.0], [714.0, 853.3333333333334], [723.0, 1507.3333333333333], [724.0, 1879.0], [725.0, 488.5], [726.0, 338.5], [727.0, 672.5], [739.0, 1518.0], [749.0, 1034.0], [748.0, 35633.0], [747.0, 2543.0], [746.0, 2598.0], [745.0, 1760.0], [744.0, 1784.0], [750.0, 1454.3333333333333], [751.0, 1075.0], [737.0, 354.0], [736.0, 1417.0], [754.0, 1872.0], [756.0, 894.5], [755.0, 1763.0], [757.0, 5599.0], [759.0, 3575.0], [758.0, 341.0], [763.0, 5829.0], [761.0, 2724.0], [760.0, 5791.0], [743.0, 1681.0], [742.0, 494.0], [741.0, 913.3333333333333], [740.0, 1807.0], [765.0, 6791.0], [764.0, 1642.0], [767.0, 5294.0], [753.0, 4845.0], [752.0, 2313.0], [766.0, 1690.0], [793.0, 3553.0], [782.0, 1534.3333333333333], [774.0, 1141.643481074089], [773.0, 973.0], [772.0, 1147.5], [770.0, 3740.0], [769.0, 6700.0], [768.0, 5783.0], [792.0, 2536.0], [775.0, 1349.0], [794.0, 1799.0], [797.0, 6357.0], [796.0, 3041.5], [776.0, 959.6666666666666], [777.0, 1616.0], [778.0, 1030.5], [781.0, 1136.625], [780.0, 4353.0], [779.0, 1608.0], [786.0, 1172.6666666666667], [789.0, 2032.6666666666667], [788.0, 3624.0], [787.0, 1530.0], [791.0, 1670.0], [790.0, 30260.0], [799.0, 1373.0], [785.0, 1787.0], [784.0, 1366.0], [798.0, 1441.0], [824.0, 2020.0], [828.0, 2453.0], [800.0, 954.0], [806.0, 929.5], [805.0, 4116.0], [804.0, 2499.0], [803.0, 4447.0], [801.0, 1513.0], [807.0, 3879.0], [825.0, 297.0], [827.0, 35732.0], [826.0, 2706.0], [808.0, 817.5], [810.0, 3758.0], [809.0, 2195.0], [811.0, 2047.5], [813.0, 1491.0], [812.0, 3293.0], [815.0, 1747.0], [814.0, 5154.0], [820.0, 2186.5], [819.0, 1509.0], [818.0, 3295.5], [816.0, 3349.0], [821.0, 3503.0], [823.0, 293.0], [822.0, 2600.0], [831.0, 3675.5], [829.0, 1557.0], [860.0, 4374.0], [836.0, 1132.3333333333333], [842.0, 1656.0], [841.0, 1543.0], [840.0, 1960.0], [846.0, 2112.0], [832.0, 412.0], [834.0, 3678.0], [833.0, 795.0], [844.0, 3362.0], [849.0, 8675.25], [853.0, 1772.0], [851.0, 11815.333333333334], [863.0, 2800.0], [862.0, 762.5], [858.0, 1309.5], [856.0, 3662.5], [839.0, 1346.0], [838.0, 6189.0], [837.0, 3955.0], [855.0, 2704.0], [854.0, 18445.0], [867.0, 1134.5], [864.0, 1960.5], [866.0, 6717.0], [865.0, 1658.0], [871.0, 1554.6666666666667], [870.0, 2722.0], [869.0, 1124.0], [868.0, 10841.5], [874.0, 2586.0], [873.0, 833.0], [872.0, 3133.0], [875.0, 221.0], [876.0, 713.6666666666666], [878.0, 3129.0], [877.0, 5839.0], [879.0, 6002.0], [880.0, 315.5], [883.0, 1378.6666666666667], [882.0, 1953.5], [886.0, 1231.0], [885.0, 1325.5], [889.0, 10462.5], [890.0, 900.5], [894.0, 1746.6666666666667], [892.0, 3014.0], [903.0, 1312.8699366622463], [896.0, 599.6666666666666], [897.0, 991.0], [902.0, 1440.5], [901.0, 15413.0], [900.0, 1964.0], [899.0, 2504.0], [898.0, 2381.0], [905.0, 948.5], [904.0, 269.0], [906.0, 1537.0], [908.0, 1599.0], [907.0, 2606.0], [910.0, 2392.0], [909.0, 1178.0], [911.0, 1720.0], [914.0, 2158.5], [919.0, 1402.0], [918.0, 2058.0], [916.0, 8671.0], [927.0, 2638.0], [913.0, 1308.0], [912.0, 1549.0], [926.0, 1529.0], [925.0, 15407.0], [924.0, 15120.0], [923.0, 1891.0], [922.0, 1410.5], [920.0, 930.0], [953.0, 1983.0], [958.0, 3493.0], [929.0, 1074.0], [943.0, 1515.0], [928.0, 2670.0], [942.0, 1754.0], [941.0, 4785.0], [940.0, 251.0], [939.0, 2003.0], [937.0, 1893.0], [936.0, 959.0], [944.0, 4257.333333333333], [947.0, 1253.0], [946.0, 1417.0], [945.0, 2124.0], [949.0, 4534.0], [948.0, 3314.5], [951.0, 2353.0], [950.0, 1483.0], [959.0, 30031.0], [957.0, 2270.0], [956.0, 286.5], [954.0, 2428.0], [935.0, 1614.0], [934.0, 3444.0], [933.0, 1416.0], [932.0, 1522.0], [931.0, 1962.0], [930.0, 3347.0], [965.0, 1464.0], [986.0, 822.6666666666666], [967.0, 1225.0], [966.0, 1452.0], [964.0, 15865.5], [962.0, 1595.0], [961.0, 243.0], [960.0, 2536.0], [968.0, 3262.333333333333], [969.0, 4713.0], [971.0, 222.0], [970.0, 1572.0], [974.0, 2931.0], [972.0, 2516.0], [975.0, 1012.0], [980.0, 1076.5], [979.0, 751.0], [978.0, 1795.0], [977.0, 1500.0], [981.0, 2784.0], [983.0, 1164.0], [982.0, 984.0], [990.0, 1411.0], [988.0, 225.0], [987.0, 2849.0], [984.0, 1092.0], [998.0, 4162.0], [1018.0, 2644.0], [1001.0, 1242.5], [1000.0, 2128.0], [1002.0, 1236.0], [1003.0, 1933.0], [1007.0, 2310.0], [992.0, 1946.5], [995.0, 1706.0], [994.0, 3553.0], [997.0, 1322.0], [996.0, 4334.0], [999.0, 222.0], [1006.0, 2172.0], [1005.0, 1486.0], [1004.0, 1199.0], [1012.0, 2121.5], [1015.0, 1321.0], [1014.0, 1170.0], [1013.0, 1248.0], [1022.0, 865.6666666666666], [1023.0, 1929.5], [1008.0, 5356.0], [1010.0, 30303.0], [1009.0, 4298.0], [1019.0, 1092.0], [1017.0, 2192.0], [1016.0, 2235.0], [1078.0, 1406.0], [1038.0, 5100.25], [1024.0, 1350.0], [1026.0, 1644.6666666666665], [1028.0, 1863.0], [1032.0, 1455.8825940565066], [1034.0, 1431.5], [1058.0, 1363.0], [1082.0, 1796.0], [1080.0, 7461.0], [1076.0, 183.0], [1072.0, 2271.0], [1084.0, 1822.0], [1056.0, 1417.0], [1086.0, 1572.5], [1070.0, 585.0], [1068.0, 3839.0], [1064.0, 220.0], [1062.0, 1700.0], [1060.0, 4506.0], [1042.0, 2489.5], [1040.0, 4116.0], [1048.0, 1100.0], [1050.0, 791.0], [1052.0, 1001.0], [1054.0, 5033.0], [1102.0, 1101.0], [1090.0, 2275.0], [1088.0, 172.0], [1094.0, 127.0], [1092.0, 1028.0], [1096.0, 1072.0], [1098.0, 1399.5], [1100.0, 3082.0], [1136.0, 1320.5], [1142.0, 953.0], [1138.0, 1024.0], [1144.0, 999.0], [1146.0, 3009.5], [1148.0, 1341.0], [1150.0, 1008.5], [1122.0, 1471.0], [1124.0, 1650.5], [1126.0, 1714.0], [1128.0, 1646.0], [1134.0, 2522.5], [1104.0, 818.0], [1106.0, 1713.0], [1108.0, 1616.0], [1112.0, 762.0], [1114.0, 4308.0], [1116.0, 157.0], [1118.0, 1610.0], [1158.0, 1094.0], [1152.0, 1519.3333333333333], [1154.0, 999.6666666666666], [1156.0, 29822.0], [1160.0, 2100.0], [1164.0, 1053.5], [1162.0, 1279.0], [1166.0, 1769.0], [1184.0, 2756.0], [1200.0, 17853.0], [1204.0, 5147.0], [1186.0, 1862.0], [1188.0, 337.0], [1194.0, 3050.6666666666665], [1192.0, 4096.5], [1168.0, 4455.0], [1170.0, 1601.0], [1172.0, 783.0], [1174.0, 1297.0], [1176.0, 4094.0], [1182.0, 294.0], [1180.0, 928.0], [1266.0, 1332.0], [1246.0, 1925.5], [1218.0, 1036.0], [1220.0, 3863.5], [1222.0, 3087.0], [1224.0, 961.0], [1226.0, 399.0], [1264.0, 3885.5], [1268.0, 17952.0], [1272.0, 628.0], [1232.0, 2192.0], [1234.0, 196.0], [1240.0, 29983.0], [1236.0, 3462.0], [1244.0, 2715.0], [1248.0, 2481.6666666666665], [1250.0, 2983.0], [1254.0, 2793.5], [1252.0, 1363.6666666666667], [1256.0, 1343.5], [1258.0, 2421.0], [1262.0, 3516.0], [1278.0, 1699.0], [1276.0, 3752.0], [1274.0, 1346.0], [1288.0, 1371.6666666666665], [1290.0, 1609.5784691321132], [1286.0, 1493.5], [1284.0, 752.5], [1282.0, 1699.0], [1077.0, 1407.0], [1027.0, 1197.0], [1025.0, 1193.625], [1029.0, 1270.0], [1031.0, 2461.0], [1033.0, 1909.0], [1035.0, 2439.0], [1083.0, 8329.5], [1081.0, 2180.0], [1079.0, 1685.0], [1075.0, 2397.0], [1073.0, 242.0], [1087.0, 1437.0], [1057.0, 1604.0], [1069.0, 1633.0], [1067.0, 2428.5], [1065.0, 200.0], [1063.0, 1460.0], [1061.0, 1063.0], [1059.0, 1809.0], [1071.0, 1408.0], [1043.0, 3021.3333333333335], [1045.0, 15322.0], [1047.0, 4046.5], [1049.0, 2417.0], [1051.0, 1130.0], [1053.0, 4376.0], [1055.0, 3064.0], [1137.0, 2242.5], [1091.0, 2544.6666666666665], [1089.0, 3185.0], [1093.0, 3776.0], [1095.0, 2207.0], [1097.0, 1081.0], [1099.0, 553.0], [1103.0, 3249.0], [1143.0, 867.6666666666667], [1141.0, 2050.0], [1139.0, 1399.0], [1145.0, 124.0], [1147.0, 157.5], [1149.0, 307.0], [1123.0, 227.0], [1125.0, 234.0], [1127.0, 1018.0], [1133.0, 1232.0], [1131.0, 2105.0], [1129.0, 2789.6666666666665], [1105.0, 2369.0], [1107.0, 990.0], [1109.0, 1034.0], [1111.0, 1365.0], [1113.0, 2544.0], [1115.0, 6844.0], [1117.0, 1355.0], [1119.0, 1979.0], [1159.0, 155.0], [1167.0, 1285.5], [1153.0, 1685.0], [1155.0, 2460.0], [1157.0, 1146.0], [1161.0, 1670.948469976903], [1163.0, 5997.0], [1165.0, 2311.0], [1185.0, 3262.0], [1215.0, 528.0], [1203.0, 1778.0], [1201.0, 6681.0], [1207.0, 145.0], [1211.0, 251.0], [1191.0, 470.0], [1199.0, 1664.6666666666667], [1197.0, 1106.0], [1195.0, 1101.0], [1169.0, 1603.0], [1171.0, 1340.0], [1173.0, 101.0], [1175.0, 5451.0], [1177.0, 1858.0], [1179.0, 1093.0], [1183.0, 4614.0], [1223.0, 3263.0], [1271.0, 3102.0], [1217.0, 260.0], [1219.0, 3589.090909090909], [1221.0, 880.5], [1225.0, 776.0], [1229.0, 1910.0], [1231.0, 2040.0], [1267.0, 6673.0], [1269.0, 1884.0], [1233.0, 2111.0], [1235.0, 1531.5], [1241.0, 1084.6666666666667], [1239.0, 2193.0], [1237.0, 774.0], [1243.0, 3769.5], [1245.0, 145.0], [1257.0, 1728.0], [1259.0, 939.0], [1261.0, 3875.0], [1273.0, 1420.0], [1279.0, 1949.0], [1277.0, 2222.0], [1275.0, 1504.0], [1283.0, 2754.0], [1289.0, 879.0], [1281.0, 2633.0], [1.0, 31080.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[835.5225250371209, 1227.6911139147264]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1290.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 54921.4, "minX": 1.5498888E12, "maxY": 360025.51666666666, "series": [{"data": [[1.54988892E12, 193515.35], [1.54988886E12, 360025.51666666666], [1.5498888E12, 230169.38333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54988892E12, 54921.4], [1.54988886E12, 102179.23333333334], [1.5498888E12, 65324.083333333336]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54988892E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 443.85953240828337, "minX": 1.5498888E12, "maxY": 1966.7060047024816, "series": [{"data": [[1.54988892E12, 1966.7060047024816], [1.54988886E12, 1331.5805910659567], [1.5498888E12, 443.85953240828337]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54988892E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 443.85721345751654, "minX": 1.5498888E12, "maxY": 1966.7051908120804, "series": [{"data": [[1.54988892E12, 1966.7051908120804], [1.54988886E12, 1331.578379429347], [1.5498888E12, 443.85721345751654]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54988892E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.09667209260263995, "minX": 1.5498888E12, "maxY": 0.13122980421972985, "series": [{"data": [[1.54988892E12, 0.09667209260263995], [1.54988886E12, 0.12812910124920907], [1.5498888E12, 0.13122980421972985]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54988892E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 8.0, "minX": 1.5498888E12, "maxY": 36756.0, "series": [{"data": [[1.54988892E12, 36756.0], [1.54988886E12, 11631.0], [1.5498888E12, 7202.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54988892E12, 8.0], [1.54988886E12, 8.0], [1.5498888E12, 8.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54988892E12, 3361.800000000003], [1.54988886E12, 2541.0], [1.5498888E12, 1142.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54988892E12, 29955.76000000004], [1.54988886E12, 3304.0], [1.5498888E12, 2348.9100000000144]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54988892E12, 4662.850000000002], [1.54988886E12, 2812.0], [1.5498888E12, 1449.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54988892E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 355.0, "minX": 368.0, "maxY": 1892.0, "series": [{"data": [[685.0, 1892.0], [368.0, 1356.0], [438.0, 355.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 685.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 355.0, "minX": 368.0, "maxY": 1892.0, "series": [{"data": [[685.0, 1892.0], [368.0, 1356.0], [438.0, 355.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 685.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 347.1, "minX": 1.5498888E12, "maxY": 698.6666666666666, "series": [{"data": [[1.54988892E12, 347.1], [1.54988886E12, 698.6666666666666], [1.5498888E12, 447.01666666666665]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54988892E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 368.6, "minX": 1.5498888E12, "maxY": 685.7666666666667, "series": [{"data": [[1.54988892E12, 368.6], [1.54988886E12, 685.7666666666667], [1.5498888E12, 438.4166666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54988892E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 368.6, "minX": 1.5498888E12, "maxY": 685.7666666666667, "series": [{"data": [[1.54988892E12, 368.6], [1.54988886E12, 685.7666666666667], [1.5498888E12, 438.4166666666667]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54988892E12, "title": "Transactions Per Second"}},
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
