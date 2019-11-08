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
        data: {"result": {"minY": 6.0, "minX": 0.0, "maxY": 7283.0, "series": [{"data": [[0.0, 6.0], [0.1, 15.0], [0.2, 17.0], [0.3, 19.0], [0.4, 21.0], [0.5, 22.0], [0.6, 23.0], [0.7, 25.0], [0.8, 26.0], [0.9, 27.0], [1.0, 28.0], [1.1, 29.0], [1.2, 31.0], [1.3, 32.0], [1.4, 34.0], [1.5, 35.0], [1.6, 36.0], [1.7, 37.0], [1.8, 38.0], [1.9, 39.0], [2.0, 41.0], [2.1, 42.0], [2.2, 43.0], [2.3, 45.0], [2.4, 46.0], [2.5, 47.0], [2.6, 49.0], [2.7, 50.0], [2.8, 51.0], [2.9, 52.0], [3.0, 54.0], [3.1, 55.0], [3.2, 56.0], [3.3, 57.0], [3.4, 59.0], [3.5, 60.0], [3.6, 61.0], [3.7, 63.0], [3.8, 64.0], [3.9, 65.0], [4.0, 66.0], [4.1, 68.0], [4.2, 69.0], [4.3, 70.0], [4.4, 71.0], [4.5, 72.0], [4.6, 74.0], [4.7, 75.0], [4.8, 76.0], [4.9, 77.0], [5.0, 78.0], [5.1, 80.0], [5.2, 81.0], [5.3, 82.0], [5.4, 83.0], [5.5, 84.0], [5.6, 85.0], [5.7, 87.0], [5.8, 88.0], [5.9, 89.0], [6.0, 90.0], [6.1, 91.0], [6.2, 92.0], [6.3, 94.0], [6.4, 95.0], [6.5, 96.0], [6.6, 97.0], [6.7, 98.0], [6.8, 100.0], [6.9, 100.0], [7.0, 102.0], [7.1, 103.0], [7.2, 104.0], [7.3, 105.0], [7.4, 106.0], [7.5, 107.0], [7.6, 109.0], [7.7, 110.0], [7.8, 111.0], [7.9, 112.0], [8.0, 113.0], [8.1, 114.0], [8.2, 115.0], [8.3, 116.0], [8.4, 117.0], [8.5, 119.0], [8.6, 120.0], [8.7, 120.0], [8.8, 122.0], [8.9, 123.0], [9.0, 124.0], [9.1, 125.0], [9.2, 126.0], [9.3, 127.0], [9.4, 128.0], [9.5, 130.0], [9.6, 131.0], [9.7, 132.0], [9.8, 133.0], [9.9, 134.0], [10.0, 135.0], [10.1, 136.0], [10.2, 137.0], [10.3, 138.0], [10.4, 140.0], [10.5, 141.0], [10.6, 142.0], [10.7, 143.0], [10.8, 144.0], [10.9, 145.0], [11.0, 146.0], [11.1, 147.0], [11.2, 148.0], [11.3, 149.0], [11.4, 151.0], [11.5, 152.0], [11.6, 153.0], [11.7, 154.0], [11.8, 155.0], [11.9, 156.0], [12.0, 158.0], [12.1, 159.0], [12.2, 160.0], [12.3, 161.0], [12.4, 162.0], [12.5, 164.0], [12.6, 165.0], [12.7, 166.0], [12.8, 167.0], [12.9, 169.0], [13.0, 170.0], [13.1, 171.0], [13.2, 172.0], [13.3, 173.0], [13.4, 174.0], [13.5, 176.0], [13.6, 177.0], [13.7, 178.0], [13.8, 179.0], [13.9, 180.0], [14.0, 181.0], [14.1, 183.0], [14.2, 184.0], [14.3, 185.0], [14.4, 186.0], [14.5, 188.0], [14.6, 189.0], [14.7, 190.0], [14.8, 191.0], [14.9, 192.0], [15.0, 194.0], [15.1, 195.0], [15.2, 196.0], [15.3, 197.0], [15.4, 198.0], [15.5, 200.0], [15.6, 201.0], [15.7, 202.0], [15.8, 203.0], [15.9, 204.0], [16.0, 206.0], [16.1, 207.0], [16.2, 208.0], [16.3, 209.0], [16.4, 211.0], [16.5, 212.0], [16.6, 213.0], [16.7, 214.0], [16.8, 216.0], [16.9, 217.0], [17.0, 218.0], [17.1, 220.0], [17.2, 221.0], [17.3, 222.0], [17.4, 224.0], [17.5, 225.0], [17.6, 226.0], [17.7, 227.0], [17.8, 228.0], [17.9, 230.0], [18.0, 231.0], [18.1, 232.0], [18.2, 234.0], [18.3, 235.0], [18.4, 236.0], [18.5, 237.0], [18.6, 239.0], [18.7, 240.0], [18.8, 241.0], [18.9, 242.0], [19.0, 243.0], [19.1, 245.0], [19.2, 246.0], [19.3, 247.0], [19.4, 248.0], [19.5, 250.0], [19.6, 251.0], [19.7, 252.0], [19.8, 253.0], [19.9, 255.0], [20.0, 256.0], [20.1, 258.0], [20.2, 259.0], [20.3, 260.0], [20.4, 262.0], [20.5, 263.0], [20.6, 264.0], [20.7, 266.0], [20.8, 267.0], [20.9, 268.0], [21.0, 270.0], [21.1, 271.0], [21.2, 272.0], [21.3, 274.0], [21.4, 275.0], [21.5, 277.0], [21.6, 278.0], [21.7, 280.0], [21.8, 281.0], [21.9, 282.0], [22.0, 284.0], [22.1, 285.0], [22.2, 287.0], [22.3, 288.0], [22.4, 290.0], [22.5, 291.0], [22.6, 292.0], [22.7, 294.0], [22.8, 295.0], [22.9, 297.0], [23.0, 298.0], [23.1, 299.0], [23.2, 301.0], [23.3, 302.0], [23.4, 304.0], [23.5, 305.0], [23.6, 306.0], [23.7, 308.0], [23.8, 309.0], [23.9, 311.0], [24.0, 312.0], [24.1, 314.0], [24.2, 315.0], [24.3, 316.0], [24.4, 318.0], [24.5, 319.0], [24.6, 321.0], [24.7, 322.0], [24.8, 324.0], [24.9, 325.0], [25.0, 327.0], [25.1, 328.0], [25.2, 330.0], [25.3, 331.0], [25.4, 333.0], [25.5, 334.0], [25.6, 335.0], [25.7, 337.0], [25.8, 338.0], [25.9, 340.0], [26.0, 342.0], [26.1, 343.0], [26.2, 345.0], [26.3, 346.0], [26.4, 347.0], [26.5, 349.0], [26.6, 351.0], [26.7, 352.0], [26.8, 353.0], [26.9, 355.0], [27.0, 356.0], [27.1, 358.0], [27.2, 359.0], [27.3, 361.0], [27.4, 363.0], [27.5, 364.0], [27.6, 366.0], [27.7, 367.0], [27.8, 369.0], [27.9, 370.0], [28.0, 372.0], [28.1, 373.0], [28.2, 374.0], [28.3, 375.0], [28.4, 377.0], [28.5, 378.0], [28.6, 380.0], [28.7, 381.0], [28.8, 382.0], [28.9, 384.0], [29.0, 385.0], [29.1, 387.0], [29.2, 389.0], [29.3, 390.0], [29.4, 392.0], [29.5, 393.0], [29.6, 394.0], [29.7, 396.0], [29.8, 397.0], [29.9, 399.0], [30.0, 400.0], [30.1, 402.0], [30.2, 404.0], [30.3, 405.0], [30.4, 407.0], [30.5, 408.0], [30.6, 410.0], [30.7, 411.0], [30.8, 413.0], [30.9, 415.0], [31.0, 416.0], [31.1, 418.0], [31.2, 419.0], [31.3, 421.0], [31.4, 422.0], [31.5, 423.0], [31.6, 425.0], [31.7, 426.0], [31.8, 428.0], [31.9, 430.0], [32.0, 431.0], [32.1, 433.0], [32.2, 434.0], [32.3, 436.0], [32.4, 437.0], [32.5, 439.0], [32.6, 440.0], [32.7, 442.0], [32.8, 444.0], [32.9, 445.0], [33.0, 447.0], [33.1, 448.0], [33.2, 450.0], [33.3, 452.0], [33.4, 453.0], [33.5, 454.0], [33.6, 456.0], [33.7, 457.0], [33.8, 459.0], [33.9, 460.0], [34.0, 461.0], [34.1, 463.0], [34.2, 465.0], [34.3, 466.0], [34.4, 468.0], [34.5, 469.0], [34.6, 471.0], [34.7, 472.0], [34.8, 474.0], [34.9, 476.0], [35.0, 477.0], [35.1, 479.0], [35.2, 480.0], [35.3, 482.0], [35.4, 484.0], [35.5, 485.0], [35.6, 487.0], [35.7, 488.0], [35.8, 490.0], [35.9, 491.0], [36.0, 493.0], [36.1, 494.0], [36.2, 496.0], [36.3, 497.0], [36.4, 499.0], [36.5, 500.0], [36.6, 501.0], [36.7, 503.0], [36.8, 505.0], [36.9, 506.0], [37.0, 508.0], [37.1, 509.0], [37.2, 511.0], [37.3, 512.0], [37.4, 514.0], [37.5, 515.0], [37.6, 517.0], [37.7, 519.0], [37.8, 520.0], [37.9, 522.0], [38.0, 524.0], [38.1, 525.0], [38.2, 527.0], [38.3, 529.0], [38.4, 530.0], [38.5, 532.0], [38.6, 533.0], [38.7, 535.0], [38.8, 537.0], [38.9, 538.0], [39.0, 540.0], [39.1, 541.0], [39.2, 543.0], [39.3, 545.0], [39.4, 547.0], [39.5, 548.0], [39.6, 550.0], [39.7, 552.0], [39.8, 553.0], [39.9, 555.0], [40.0, 557.0], [40.1, 558.0], [40.2, 560.0], [40.3, 562.0], [40.4, 564.0], [40.5, 565.0], [40.6, 567.0], [40.7, 569.0], [40.8, 571.0], [40.9, 573.0], [41.0, 574.0], [41.1, 576.0], [41.2, 578.0], [41.3, 580.0], [41.4, 581.0], [41.5, 583.0], [41.6, 585.0], [41.7, 586.0], [41.8, 588.0], [41.9, 589.0], [42.0, 591.0], [42.1, 593.0], [42.2, 595.0], [42.3, 597.0], [42.4, 598.0], [42.5, 601.0], [42.6, 602.0], [42.7, 604.0], [42.8, 606.0], [42.9, 608.0], [43.0, 610.0], [43.1, 611.0], [43.2, 613.0], [43.3, 615.0], [43.4, 616.0], [43.5, 619.0], [43.6, 620.0], [43.7, 622.0], [43.8, 624.0], [43.9, 626.0], [44.0, 628.0], [44.1, 629.0], [44.2, 631.0], [44.3, 633.0], [44.4, 634.0], [44.5, 636.0], [44.6, 638.0], [44.7, 640.0], [44.8, 641.0], [44.9, 643.0], [45.0, 645.0], [45.1, 647.0], [45.2, 648.0], [45.3, 650.0], [45.4, 652.0], [45.5, 654.0], [45.6, 656.0], [45.7, 658.0], [45.8, 660.0], [45.9, 661.0], [46.0, 663.0], [46.1, 665.0], [46.2, 667.0], [46.3, 669.0], [46.4, 670.0], [46.5, 672.0], [46.6, 674.0], [46.7, 676.0], [46.8, 678.0], [46.9, 679.0], [47.0, 681.0], [47.1, 683.0], [47.2, 685.0], [47.3, 686.0], [47.4, 688.0], [47.5, 690.0], [47.6, 692.0], [47.7, 694.0], [47.8, 696.0], [47.9, 698.0], [48.0, 700.0], [48.1, 702.0], [48.2, 704.0], [48.3, 706.0], [48.4, 708.0], [48.5, 710.0], [48.6, 712.0], [48.7, 714.0], [48.8, 715.0], [48.9, 717.0], [49.0, 719.0], [49.1, 721.0], [49.2, 723.0], [49.3, 724.0], [49.4, 726.0], [49.5, 728.0], [49.6, 729.0], [49.7, 732.0], [49.8, 733.0], [49.9, 736.0], [50.0, 738.0], [50.1, 740.0], [50.2, 741.0], [50.3, 743.0], [50.4, 745.0], [50.5, 747.0], [50.6, 749.0], [50.7, 751.0], [50.8, 753.0], [50.9, 754.0], [51.0, 756.0], [51.1, 758.0], [51.2, 760.0], [51.3, 762.0], [51.4, 764.0], [51.5, 766.0], [51.6, 768.0], [51.7, 770.0], [51.8, 772.0], [51.9, 774.0], [52.0, 776.0], [52.1, 777.0], [52.2, 779.0], [52.3, 781.0], [52.4, 783.0], [52.5, 785.0], [52.6, 787.0], [52.7, 789.0], [52.8, 791.0], [52.9, 793.0], [53.0, 795.0], [53.1, 797.0], [53.2, 798.0], [53.3, 800.0], [53.4, 802.0], [53.5, 804.0], [53.6, 806.0], [53.7, 808.0], [53.8, 809.0], [53.9, 811.0], [54.0, 813.0], [54.1, 815.0], [54.2, 817.0], [54.3, 819.0], [54.4, 821.0], [54.5, 823.0], [54.6, 825.0], [54.7, 827.0], [54.8, 829.0], [54.9, 831.0], [55.0, 833.0], [55.1, 835.0], [55.2, 837.0], [55.3, 839.0], [55.4, 841.0], [55.5, 843.0], [55.6, 845.0], [55.7, 847.0], [55.8, 849.0], [55.9, 851.0], [56.0, 853.0], [56.1, 855.0], [56.2, 857.0], [56.3, 858.0], [56.4, 860.0], [56.5, 862.0], [56.6, 864.0], [56.7, 866.0], [56.8, 868.0], [56.9, 870.0], [57.0, 872.0], [57.1, 874.0], [57.2, 877.0], [57.3, 878.0], [57.4, 881.0], [57.5, 883.0], [57.6, 885.0], [57.7, 887.0], [57.8, 889.0], [57.9, 890.0], [58.0, 892.0], [58.1, 894.0], [58.2, 896.0], [58.3, 899.0], [58.4, 901.0], [58.5, 903.0], [58.6, 905.0], [58.7, 907.0], [58.8, 909.0], [58.9, 912.0], [59.0, 914.0], [59.1, 916.0], [59.2, 918.0], [59.3, 920.0], [59.4, 922.0], [59.5, 925.0], [59.6, 927.0], [59.7, 929.0], [59.8, 931.0], [59.9, 933.0], [60.0, 935.0], [60.1, 937.0], [60.2, 939.0], [60.3, 941.0], [60.4, 944.0], [60.5, 946.0], [60.6, 948.0], [60.7, 950.0], [60.8, 953.0], [60.9, 955.0], [61.0, 957.0], [61.1, 959.0], [61.2, 962.0], [61.3, 964.0], [61.4, 966.0], [61.5, 968.0], [61.6, 970.0], [61.7, 972.0], [61.8, 975.0], [61.9, 977.0], [62.0, 980.0], [62.1, 982.0], [62.2, 984.0], [62.3, 987.0], [62.4, 989.0], [62.5, 991.0], [62.6, 994.0], [62.7, 996.0], [62.8, 998.0], [62.9, 1000.0], [63.0, 1003.0], [63.1, 1005.0], [63.2, 1007.0], [63.3, 1009.0], [63.4, 1012.0], [63.5, 1014.0], [63.6, 1016.0], [63.7, 1019.0], [63.8, 1022.0], [63.9, 1024.0], [64.0, 1026.0], [64.1, 1029.0], [64.2, 1031.0], [64.3, 1033.0], [64.4, 1036.0], [64.5, 1038.0], [64.6, 1040.0], [64.7, 1042.0], [64.8, 1045.0], [64.9, 1047.0], [65.0, 1049.0], [65.1, 1052.0], [65.2, 1054.0], [65.3, 1056.0], [65.4, 1059.0], [65.5, 1062.0], [65.6, 1064.0], [65.7, 1067.0], [65.8, 1069.0], [65.9, 1071.0], [66.0, 1073.0], [66.1, 1076.0], [66.2, 1078.0], [66.3, 1081.0], [66.4, 1084.0], [66.5, 1086.0], [66.6, 1089.0], [66.7, 1092.0], [66.8, 1094.0], [66.9, 1097.0], [67.0, 1099.0], [67.1, 1102.0], [67.2, 1105.0], [67.3, 1107.0], [67.4, 1110.0], [67.5, 1112.0], [67.6, 1115.0], [67.7, 1118.0], [67.8, 1120.0], [67.9, 1123.0], [68.0, 1125.0], [68.1, 1128.0], [68.2, 1130.0], [68.3, 1133.0], [68.4, 1135.0], [68.5, 1138.0], [68.6, 1141.0], [68.7, 1143.0], [68.8, 1146.0], [68.9, 1148.0], [69.0, 1151.0], [69.1, 1154.0], [69.2, 1157.0], [69.3, 1159.0], [69.4, 1163.0], [69.5, 1165.0], [69.6, 1168.0], [69.7, 1171.0], [69.8, 1173.0], [69.9, 1175.0], [70.0, 1178.0], [70.1, 1181.0], [70.2, 1184.0], [70.3, 1186.0], [70.4, 1189.0], [70.5, 1192.0], [70.6, 1194.0], [70.7, 1197.0], [70.8, 1200.0], [70.9, 1203.0], [71.0, 1206.0], [71.1, 1209.0], [71.2, 1212.0], [71.3, 1215.0], [71.4, 1217.0], [71.5, 1220.0], [71.6, 1223.0], [71.7, 1227.0], [71.8, 1230.0], [71.9, 1233.0], [72.0, 1236.0], [72.1, 1239.0], [72.2, 1242.0], [72.3, 1245.0], [72.4, 1248.0], [72.5, 1251.0], [72.6, 1254.0], [72.7, 1257.0], [72.8, 1260.0], [72.9, 1263.0], [73.0, 1265.0], [73.1, 1268.0], [73.2, 1271.0], [73.3, 1274.0], [73.4, 1277.0], [73.5, 1280.0], [73.6, 1284.0], [73.7, 1287.0], [73.8, 1290.0], [73.9, 1293.0], [74.0, 1296.0], [74.1, 1300.0], [74.2, 1303.0], [74.3, 1306.0], [74.4, 1310.0], [74.5, 1313.0], [74.6, 1317.0], [74.7, 1321.0], [74.8, 1324.0], [74.9, 1328.0], [75.0, 1331.0], [75.1, 1334.0], [75.2, 1337.0], [75.3, 1341.0], [75.4, 1345.0], [75.5, 1349.0], [75.6, 1352.0], [75.7, 1355.0], [75.8, 1359.0], [75.9, 1363.0], [76.0, 1366.0], [76.1, 1370.0], [76.2, 1373.0], [76.3, 1377.0], [76.4, 1380.0], [76.5, 1384.0], [76.6, 1387.0], [76.7, 1391.0], [76.8, 1395.0], [76.9, 1398.0], [77.0, 1402.0], [77.1, 1406.0], [77.2, 1409.0], [77.3, 1413.0], [77.4, 1417.0], [77.5, 1420.0], [77.6, 1423.0], [77.7, 1427.0], [77.8, 1431.0], [77.9, 1434.0], [78.0, 1438.0], [78.1, 1443.0], [78.2, 1447.0], [78.3, 1451.0], [78.4, 1454.0], [78.5, 1458.0], [78.6, 1461.0], [78.7, 1464.0], [78.8, 1468.0], [78.9, 1472.0], [79.0, 1476.0], [79.1, 1480.0], [79.2, 1484.0], [79.3, 1488.0], [79.4, 1492.0], [79.5, 1497.0], [79.6, 1502.0], [79.7, 1505.0], [79.8, 1509.0], [79.9, 1513.0], [80.0, 1517.0], [80.1, 1521.0], [80.2, 1526.0], [80.3, 1530.0], [80.4, 1535.0], [80.5, 1539.0], [80.6, 1544.0], [80.7, 1548.0], [80.8, 1553.0], [80.9, 1557.0], [81.0, 1561.0], [81.1, 1565.0], [81.2, 1569.0], [81.3, 1573.0], [81.4, 1578.0], [81.5, 1583.0], [81.6, 1587.0], [81.7, 1591.0], [81.8, 1596.0], [81.9, 1600.0], [82.0, 1604.0], [82.1, 1608.0], [82.2, 1612.0], [82.3, 1617.0], [82.4, 1621.0], [82.5, 1625.0], [82.6, 1630.0], [82.7, 1634.0], [82.8, 1638.0], [82.9, 1643.0], [83.0, 1648.0], [83.1, 1652.0], [83.2, 1657.0], [83.3, 1662.0], [83.4, 1667.0], [83.5, 1671.0], [83.6, 1675.0], [83.7, 1680.0], [83.8, 1685.0], [83.9, 1690.0], [84.0, 1696.0], [84.1, 1701.0], [84.2, 1706.0], [84.3, 1711.0], [84.4, 1715.0], [84.5, 1720.0], [84.6, 1725.0], [84.7, 1730.0], [84.8, 1735.0], [84.9, 1740.0], [85.0, 1745.0], [85.1, 1750.0], [85.2, 1756.0], [85.3, 1761.0], [85.4, 1767.0], [85.5, 1772.0], [85.6, 1777.0], [85.7, 1783.0], [85.8, 1788.0], [85.9, 1794.0], [86.0, 1800.0], [86.1, 1805.0], [86.2, 1811.0], [86.3, 1816.0], [86.4, 1822.0], [86.5, 1828.0], [86.6, 1834.0], [86.7, 1840.0], [86.8, 1846.0], [86.9, 1853.0], [87.0, 1859.0], [87.1, 1865.0], [87.2, 1870.0], [87.3, 1877.0], [87.4, 1882.0], [87.5, 1889.0], [87.6, 1895.0], [87.7, 1902.0], [87.8, 1910.0], [87.9, 1915.0], [88.0, 1922.0], [88.1, 1927.0], [88.2, 1934.0], [88.3, 1942.0], [88.4, 1948.0], [88.5, 1956.0], [88.6, 1963.0], [88.7, 1970.0], [88.8, 1977.0], [88.9, 1984.0], [89.0, 1991.0], [89.1, 1999.0], [89.2, 2005.0], [89.3, 2012.0], [89.4, 2019.0], [89.5, 2027.0], [89.6, 2034.0], [89.7, 2043.0], [89.8, 2049.0], [89.9, 2056.0], [90.0, 2065.0], [90.1, 2072.0], [90.2, 2081.0], [90.3, 2088.0], [90.4, 2096.0], [90.5, 2104.0], [90.6, 2111.0], [90.7, 2119.0], [90.8, 2127.0], [90.9, 2134.0], [91.0, 2142.0], [91.1, 2149.0], [91.2, 2156.0], [91.3, 2164.0], [91.4, 2172.0], [91.5, 2179.0], [91.6, 2187.0], [91.7, 2193.0], [91.8, 2200.0], [91.9, 2208.0], [92.0, 2216.0], [92.1, 2223.0], [92.2, 2230.0], [92.3, 2237.0], [92.4, 2245.0], [92.5, 2252.0], [92.6, 2258.0], [92.7, 2268.0], [92.8, 2276.0], [92.9, 2284.0], [93.0, 2294.0], [93.1, 2302.0], [93.2, 2309.0], [93.3, 2317.0], [93.4, 2326.0], [93.5, 2335.0], [93.6, 2344.0], [93.7, 2352.0], [93.8, 2361.0], [93.9, 2370.0], [94.0, 2381.0], [94.1, 2391.0], [94.2, 2402.0], [94.3, 2412.0], [94.4, 2423.0], [94.5, 2434.0], [94.6, 2448.0], [94.7, 2458.0], [94.8, 2471.0], [94.9, 2486.0], [95.0, 2500.0], [95.1, 2513.0], [95.2, 2527.0], [95.3, 2539.0], [95.4, 2555.0], [95.5, 2568.0], [95.6, 2583.0], [95.7, 2599.0], [95.8, 2619.0], [95.9, 2636.0], [96.0, 2651.0], [96.1, 2668.0], [96.2, 2685.0], [96.3, 2705.0], [96.4, 2718.0], [96.5, 2740.0], [96.6, 2761.0], [96.7, 2780.0], [96.8, 2796.0], [96.9, 2816.0], [97.0, 2833.0], [97.1, 2858.0], [97.2, 2878.0], [97.3, 2898.0], [97.4, 2922.0], [97.5, 2941.0], [97.6, 2964.0], [97.7, 2987.0], [97.8, 3018.0], [97.9, 3042.0], [98.0, 3069.0], [98.1, 3094.0], [98.2, 3118.0], [98.3, 3154.0], [98.4, 3194.0], [98.5, 3231.0], [98.6, 3270.0], [98.7, 3321.0], [98.8, 3374.0], [98.9, 3438.0], [99.0, 3503.0], [99.1, 3576.0], [99.2, 3628.0], [99.3, 3704.0], [99.4, 3804.0], [99.5, 3918.0], [99.6, 4067.0], [99.7, 4286.0], [99.8, 4579.0], [99.9, 5192.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 9802.0, "series": [{"data": [[0.0, 7676.0], [600.0, 6219.0], [700.0, 5984.0], [800.0, 5714.0], [900.0, 5116.0], [1000.0, 4688.0], [1100.0, 4272.0], [1200.0, 3741.0], [1300.0, 3208.0], [1400.0, 2957.0], [1500.0, 2621.0], [1600.0, 2488.0], [1700.0, 2162.0], [1800.0, 1879.0], [1900.0, 1636.0], [2000.0, 1499.0], [2100.0, 1531.0], [2200.0, 1445.0], [2300.0, 1243.0], [2400.0, 923.0], [2500.0, 799.0], [2600.0, 646.0], [2700.0, 605.0], [2800.0, 563.0], [2900.0, 490.0], [3000.0, 426.0], [3100.0, 327.0], [3300.0, 202.0], [3200.0, 290.0], [3400.0, 167.0], [3500.0, 189.0], [3600.0, 155.0], [3700.0, 114.0], [3800.0, 104.0], [3900.0, 80.0], [4000.0, 69.0], [4100.0, 61.0], [4300.0, 51.0], [4200.0, 34.0], [4600.0, 21.0], [4500.0, 32.0], [4400.0, 28.0], [4700.0, 22.0], [4800.0, 33.0], [5100.0, 6.0], [4900.0, 20.0], [5000.0, 9.0], [5200.0, 15.0], [5300.0, 14.0], [5400.0, 13.0], [5500.0, 5.0], [5600.0, 7.0], [5700.0, 3.0], [5800.0, 9.0], [5900.0, 8.0], [6100.0, 9.0], [6000.0, 10.0], [6200.0, 5.0], [6300.0, 3.0], [6600.0, 3.0], [6400.0, 2.0], [6500.0, 2.0], [6700.0, 1.0], [7200.0, 2.0], [100.0, 9802.0], [200.0, 8626.0], [300.0, 7706.0], [400.0, 7361.0], [500.0, 6756.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 7200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 23057.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 48586.0, "series": [{"data": [[1.0, 48586.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 41264.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 23057.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 194.5483659741654, "minX": 1.54989168E12, "maxY": 1200.3649539165299, "series": [{"data": [[1.5498918E12, 1200.3649539165299], [1.54989174E12, 689.8963213921269], [1.54989168E12, 194.5483659741654]], "isOverall": false, "label": "bzm - Concurrency Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498918E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 23.0, "minX": 3.0, "maxY": 3594.0, "series": [{"data": [[3.0, 2893.0], [4.0, 2247.6666666666665], [6.0, 1910.5], [7.0, 1586.0], [8.0, 1865.0], [9.0, 2063.0], [10.0, 2399.0], [11.0, 2278.0], [12.0, 2267.0], [13.0, 2001.0], [14.0, 3058.0], [15.0, 2302.0], [16.0, 2881.0], [17.0, 2392.0], [18.0, 1797.0], [19.0, 2050.0], [20.0, 2209.0], [21.0, 1897.0], [22.0, 2819.0], [23.0, 1805.0], [24.0, 1538.0], [26.0, 1713.0], [27.0, 1534.0], [28.0, 1571.0], [29.0, 1535.0], [30.0, 1581.0], [31.0, 2858.0], [33.0, 1598.0], [32.0, 3019.0], [35.0, 1882.5], [37.0, 2498.0], [36.0, 1680.0], [39.0, 1671.0], [38.0, 1546.0], [41.0, 1693.0], [40.0, 1675.0], [43.0, 1722.0], [42.0, 1608.0], [45.0, 2042.0], [44.0, 1641.0], [47.0, 1979.0], [46.0, 1678.0], [49.0, 1608.0], [48.0, 1604.0], [51.0, 1536.0], [50.0, 1961.0], [53.0, 1610.0], [52.0, 1614.0], [55.0, 1680.0], [54.0, 1593.0], [57.0, 1672.0], [56.0, 1642.0], [59.0, 1840.0], [58.0, 1607.0], [61.0, 1615.0], [60.0, 1675.0], [63.0, 2243.0], [62.0, 1865.0], [67.0, 1874.0], [66.0, 1565.0], [65.0, 1591.0], [64.0, 1770.0], [71.0, 1716.0], [70.0, 1660.0], [69.0, 1809.0], [68.0, 1629.0], [75.0, 1730.0], [74.0, 1668.0], [73.0, 1668.0], [72.0, 1628.0], [79.0, 1806.0], [78.0, 1671.0], [77.0, 1671.0], [76.0, 1704.0], [82.0, 1760.0], [81.0, 1873.0], [80.0, 1816.0], [87.0, 1786.0], [86.0, 2319.0], [85.0, 1824.0], [84.0, 2479.0], [91.0, 2376.0], [90.0, 2442.0], [89.0, 1842.0], [88.0, 2028.0], [95.0, 1730.5], [93.0, 1715.0], [92.0, 1861.0], [99.0, 2170.0], [98.0, 2408.0], [97.0, 1600.0], [96.0, 1913.0], [103.0, 2419.0], [102.0, 2127.0], [101.0, 1827.0], [100.0, 1796.0], [106.0, 2102.5], [104.0, 1841.0], [111.0, 1705.0], [110.0, 1949.0], [109.0, 2394.0], [108.0, 2032.5], [115.0, 2367.0], [114.0, 1671.0], [113.0, 1842.0], [119.0, 2193.0], [118.0, 2367.0], [116.0, 1629.0], [123.0, 3054.0], [122.0, 2066.0], [121.0, 1895.0], [120.0, 2055.5], [124.0, 165.1935056328695], [125.0, 305.90909090909093], [126.0, 577.0], [127.0, 495.75], [130.0, 1271.3333333333333], [131.0, 275.0], [135.0, 1827.0], [134.0, 1948.0], [133.0, 2045.5], [128.0, 1901.0], [136.0, 55.5], [137.0, 1326.0], [141.0, 31.0], [142.0, 596.375], [143.0, 1760.0], [140.0, 1632.0], [139.0, 2008.0], [138.0, 2045.0], [151.0, 1613.0], [150.0, 2118.0], [149.0, 1927.0], [148.0, 1938.0], [147.0, 1945.0], [146.0, 2260.0], [145.0, 1784.0], [144.0, 1596.0], [155.0, 1467.0], [156.0, 166.0], [158.0, 160.83333333333331], [159.0, 796.4285714285713], [157.0, 1941.5], [152.0, 2171.0], [160.0, 396.0], [161.0, 1194.0], [163.0, 265.73333333333335], [164.0, 709.3333333333334], [165.0, 1136.5], [167.0, 1540.0], [166.0, 2757.0], [162.0, 1722.0], [173.0, 518.2], [174.0, 428.1111111111111], [175.0, 193.0], [172.0, 1956.0], [171.0, 1686.0], [170.0, 1538.0], [169.0, 1548.0], [176.0, 435.94117647058823], [182.0, 362.0], [183.0, 637.6], [181.0, 2292.0], [180.0, 2716.0], [179.0, 2326.0], [178.0, 2807.0], [177.0, 2280.0], [184.0, 1279.0], [186.0, 720.8333333333334], [187.0, 443.1666666666667], [188.0, 1046.0], [189.0, 1201.5], [190.0, 608.75], [191.0, 1707.0], [192.0, 474.0], [195.0, 262.99999999999994], [197.0, 649.0], [198.0, 1486.5], [199.0, 596.4], [196.0, 2744.0], [194.0, 1939.5], [200.0, 853.3333333333334], [202.0, 805.3333333333334], [203.0, 193.0], [205.0, 352.75], [207.0, 1359.6666666666667], [204.0, 2139.5], [201.0, 1982.0], [208.0, 334.0], [212.0, 1129.0], [213.0, 1035.0], [214.0, 743.3333333333333], [215.0, 1632.5], [211.0, 1935.5], [209.0, 1970.0], [222.0, 1781.0], [220.0, 2930.0], [219.0, 1533.0], [218.0, 1727.5], [216.0, 1701.0], [229.0, 1037.0], [230.0, 2834.0], [228.0, 1930.5], [226.0, 1785.0], [225.0, 2007.0], [224.0, 1747.0], [233.0, 65.0], [236.0, 1593.0], [234.0, 1824.0], [232.0, 1769.0], [245.0, 1699.0], [243.0, 1822.0], [248.0, 284.29425420777693], [249.0, 1017.5], [250.0, 537.5], [255.0, 1452.75], [254.0, 1565.0], [253.0, 2237.0], [252.0, 1861.0], [251.0, 2330.0], [270.0, 751.6666666666666], [256.0, 599.2], [262.0, 23.0], [263.0, 1654.5], [265.0, 1869.5], [267.0, 45.5], [268.0, 567.75], [259.0, 1392.5], [258.0, 1670.0], [271.0, 554.0], [269.0, 2434.0], [266.0, 1526.0], [285.0, 1593.0], [272.0, 1392.0], [275.0, 1354.2], [274.0, 2204.0], [273.0, 2786.0], [284.0, 1750.0], [277.0, 69.0], [276.0, 1145.0], [278.0, 642.125], [279.0, 652.0], [281.0, 635.625], [283.0, 2069.5], [287.0, 1789.0], [286.0, 1475.0], [302.0, 89.5], [288.0, 923.6666666666666], [289.0, 2324.0], [294.0, 2243.0], [293.0, 1100.0], [292.0, 2304.0], [290.0, 411.3333333333333], [300.0, 1018.5], [291.0, 2144.0], [303.0, 594.25], [301.0, 1960.0], [299.0, 1151.0], [298.0, 2299.0], [297.0, 1150.0], [296.0, 1613.0], [304.0, 1709.0], [305.0, 935.5], [311.0, 91.0], [310.0, 1090.5], [308.0, 1372.0], [314.0, 1099.5], [319.0, 1160.0], [318.0, 1122.0], [316.0, 1871.5], [313.0, 1702.0], [312.0, 1693.0], [335.0, 427.0], [320.0, 92.0], [326.0, 1106.5], [324.0, 1144.0], [321.0, 578.5], [328.0, 197.0], [329.0, 1004.5], [330.0, 1373.0], [331.0, 1137.0], [332.0, 1283.2], [323.0, 1759.5], [334.0, 1092.0], [333.0, 1452.0], [348.0, 1947.0], [336.0, 1009.5], [350.0, 1538.0], [347.0, 1961.0], [344.0, 1949.0], [343.0, 1861.75], [339.0, 2166.0], [338.0, 2160.0], [337.0, 1838.0], [364.0, 115.0], [353.0, 393.5], [352.0, 1005.0], [354.0, 1279.5], [357.0, 80.0], [358.0, 1236.0], [363.0, 904.0], [362.0, 1555.5], [360.0, 1803.0], [365.0, 1194.3333333333333], [366.0, 1083.0], [367.0, 629.0], [380.0, 1018.25], [371.0, 203.0], [370.0, 2131.0], [369.0, 1872.0], [368.0, 2017.0], [375.0, 1571.0], [374.0, 1198.0], [372.0, 426.14007602810705], [373.0, 490.7222222222222], [381.0, 833.0], [382.0, 1271.0], [379.0, 1132.0], [378.0, 1083.0], [376.0, 2240.0], [398.0, 2416.0], [385.0, 458.0], [387.0, 274.0], [386.0, 1576.0], [388.0, 303.0], [389.0, 975.1666666666667], [384.0, 2651.0], [399.0, 925.0], [393.0, 1977.8], [392.0, 1168.0], [397.0, 2078.5], [395.0, 2304.0], [394.0, 2100.0], [414.0, 1692.5], [400.0, 362.0], [415.0, 1174.0], [413.0, 1121.0], [402.0, 3395.0], [401.0, 1472.5], [411.0, 1109.0], [410.0, 1164.0], [409.0, 1303.5], [407.0, 1948.0], [406.0, 2067.0], [405.0, 1079.0], [404.0, 1633.5], [430.0, 2832.0], [420.0, 1392.6666666666667], [431.0, 1959.0], [429.0, 1532.5], [418.0, 1163.0], [417.0, 1139.0], [427.0, 1536.0], [426.0, 1773.0], [424.0, 1673.0], [423.0, 1393.0], [422.0, 2310.0], [421.0, 1067.0], [445.0, 1790.0], [447.0, 1134.0], [444.0, 1813.5], [433.0, 1987.0], [432.0, 1161.0], [442.0, 1075.0], [441.0, 1162.0], [440.0, 1870.0], [439.0, 1752.5], [438.0, 1915.0], [436.0, 2053.0], [460.0, 946.5], [451.0, 1259.5], [449.0, 1064.0], [448.0, 1164.0], [452.0, 1000.0], [453.0, 847.0], [462.0, 1045.5], [463.0, 2969.0], [459.0, 2203.0], [458.0, 1206.0], [457.0, 1383.3333333333333], [456.0, 2325.0], [477.0, 707.4], [465.0, 421.0], [464.0, 484.0], [467.0, 1146.0], [466.0, 1637.0], [470.0, 1615.5], [469.0, 1081.5], [478.0, 421.0], [479.0, 1217.0], [476.0, 1118.0], [474.0, 2154.0], [473.0, 1469.0], [472.0, 2016.0], [492.0, 1332.0], [481.0, 1043.0], [480.0, 1080.0], [483.0, 1379.0], [488.0, 823.0], [493.0, 407.3333333333333], [494.0, 1359.0], [491.0, 1058.0], [490.0, 1277.5], [487.0, 1094.0], [486.0, 1095.0], [485.0, 1980.5], [509.0, 689.52], [496.0, 557.399495470705], [501.0, 623.1666666666667], [500.0, 1617.0], [507.0, 1013.7777777777778], [508.0, 970.5], [499.0, 1528.0], [498.0, 2290.0], [510.0, 990.5], [511.0, 2263.0], [505.0, 1208.0], [503.0, 1384.5], [502.0, 1163.0], [515.0, 978.5], [513.0, 260.0], [512.0, 1336.0], [514.0, 1325.0], [516.0, 656.8571428571428], [517.0, 890.3333333333333], [519.0, 739.6666666666666], [518.0, 1036.0], [536.0, 1047.3333333333333], [540.0, 1182.3333333333333], [539.0, 1781.0], [538.0, 1894.0], [537.0, 2032.0], [542.0, 1674.5], [528.0, 1817.0], [522.0, 997.6666666666667], [523.0, 764.6666666666666], [527.0, 341.6666666666667], [526.0, 1564.0], [525.0, 2386.0], [524.0, 1113.3333333333333], [530.0, 772.090909090909], [533.0, 368.75], [532.0, 1183.0], [531.0, 1185.0], [535.0, 1306.0], [534.0, 2150.5], [570.0, 1730.6666666666667], [546.0, 995.6666666666666], [545.0, 683.6666666666667], [544.0, 1286.5], [555.0, 2013.0], [554.0, 1054.0], [553.0, 1685.5], [547.0, 520.25], [549.0, 1753.0], [548.0, 1099.0], [568.0, 1950.5], [551.0, 1088.0], [566.0, 427.0], [564.0, 1490.0], [563.0, 1300.0], [573.0, 963.4], [575.0, 2324.0], [574.0, 2870.0], [571.0, 1114.0], [603.0, 1294.3333333333333], [577.0, 698.0], [578.0, 995.0], [582.0, 2686.0], [579.0, 1774.0], [600.0, 2099.0], [583.0, 2855.0], [602.0, 1313.0], [601.0, 1975.0], [586.0, 890.5], [585.0, 1884.5], [588.0, 1236.3333333333333], [576.0, 2274.0], [587.0, 1654.6666666666665], [592.0, 1055.0], [595.0, 670.0], [594.0, 1864.1666666666667], [598.0, 597.7142857142857], [599.0, 1138.25], [605.0, 318.0], [619.0, 821.0], [616.0, 720.0], [617.0, 546.6], [618.0, 722.0], [620.0, 689.3777387229067], [621.0, 2247.0], [623.0, 1428.0], [622.0, 1191.5], [637.0, 1115.5500000000002], [638.0, 939.3333333333333], [625.0, 1462.0], [624.0, 1932.5], [627.0, 1572.0], [626.0, 1685.0], [630.0, 2313.3333333333335], [628.0, 1915.25], [633.0, 1557.0], [632.0, 1753.5], [669.0, 1274.0], [643.0, 1244.25], [645.0, 615.0], [664.0, 1877.0], [646.0, 1011.0], [666.0, 2125.0], [665.0, 2193.0], [654.0, 1086.0], [653.0, 2020.5], [652.0, 1349.0], [650.0, 1982.0], [648.0, 1833.0], [655.0, 2392.0], [641.0, 1878.0], [640.0, 1355.3333333333333], [661.0, 845.4150943396228], [662.0, 1100.8333333333333], [663.0, 2159.0], [671.0, 1148.5], [656.0, 1209.0], [660.0, 1093.5], [658.0, 1935.6666666666667], [668.0, 1241.0], [667.0, 1831.0], [702.0, 2014.0], [687.0, 1144.25], [674.0, 2833.0], [673.0, 1230.5], [677.0, 1960.5], [675.0, 1161.0], [679.0, 1153.0], [678.0, 2762.0], [686.0, 1108.0], [684.0, 1805.5], [682.0, 2323.0], [681.0, 1175.0], [680.0, 1866.0], [688.0, 874.0], [695.0, 409.0], [697.0, 1466.3333333333335], [703.0, 1629.3333333333333], [700.0, 2015.0], [699.0, 1956.0], [690.0, 1539.0], [689.0, 1175.0], [732.0, 416.0], [715.0, 1021.0], [714.0, 1535.0], [713.0, 1806.5], [712.0, 1212.0], [716.0, 3347.0], [719.0, 2792.0], [704.0, 1276.5], [706.0, 1977.0], [705.0, 1198.5], [709.0, 2700.0], [708.0, 1593.0], [718.0, 2463.5], [721.0, 871.0], [727.0, 862.0], [726.0, 1084.0], [725.0, 1149.0], [724.0, 2009.0], [723.0, 1316.0], [722.0, 2184.0], [728.0, 754.0], [729.0, 1066.0], [734.0, 794.0], [733.0, 1489.5], [731.0, 1064.0], [730.0, 2019.5], [761.0, 87.0], [744.0, 828.9236553657927], [745.0, 1514.0], [747.0, 1474.0], [746.0, 1310.0], [748.0, 105.0], [750.0, 543.5], [749.0, 1363.5], [760.0, 1191.0], [743.0, 1088.0], [742.0, 2019.0], [741.0, 2003.0], [740.0, 2058.0], [739.0, 1174.0], [757.0, 867.0], [758.0, 675.6666666666666], [759.0, 2104.0], [762.0, 1167.0], [767.0, 752.5], [753.0, 1962.0], [752.0, 2085.0], [756.0, 1837.0], [754.0, 1589.0], [766.0, 1259.0], [794.0, 1115.0], [769.0, 130.0], [770.0, 1243.0], [773.0, 1816.0], [781.0, 2381.0], [780.0, 1427.5], [782.0, 1487.1666666666667], [783.0, 1680.5], [788.0, 41.0], [790.0, 1571.0], [789.0, 1528.5], [791.0, 1244.0], [798.0, 1689.3333333333333], [785.0, 1692.0], [787.0, 1129.0], [786.0, 1186.5], [793.0, 1239.5], [774.0, 1453.4], [828.0, 1616.6666666666667], [806.0, 1133.0], [815.0, 1588.0], [805.0, 1535.5], [814.0, 1555.0], [813.0, 1479.0], [812.0, 1130.0], [810.0, 2005.5], [809.0, 1090.0], [808.0, 1918.5], [831.0, 1496.0], [830.0, 1334.5], [826.0, 2189.5], [825.0, 1605.0], [824.0, 1775.0], [822.0, 1415.5], [820.0, 1458.0], [819.0, 1290.0], [818.0, 1640.0], [817.0, 1844.0], [861.0, 48.0], [833.0, 1055.3333333333333], [839.0, 951.0], [838.0, 1735.5], [836.0, 1552.0], [835.0, 1815.0], [834.0, 1797.0], [856.0, 2692.0], [860.0, 1028.0], [858.0, 1890.0], [841.0, 1626.5], [840.0, 1506.5], [843.0, 2869.0], [842.0, 1602.5], [846.0, 1295.0], [847.0, 1031.0], [849.0, 1061.6666666666667], [850.0, 1496.0], [851.0, 1213.0], [853.0, 1020.0], [852.0, 1101.0], [855.0, 1480.0], [854.0, 3108.0], [863.0, 1809.0], [848.0, 1157.0], [862.0, 1344.0], [868.0, 994.4142520612479], [865.0, 864.5], [864.0, 1013.0], [866.0, 1032.6666666666667], [867.0, 1239.0], [881.0, 770.7], [882.0, 817.75], [893.0, 1640.5], [883.0, 2144.0], [876.0, 1699.0], [875.0, 1156.0], [874.0, 1517.5], [872.0, 1227.5], [926.0, 913.0], [927.0, 938.0], [912.0, 1531.0], [915.0, 1526.0], [913.0, 1597.0], [917.0, 999.0], [916.0, 843.0], [925.0, 2628.0], [924.0, 1600.0], [923.0, 882.0], [921.0, 928.0], [920.0, 901.0], [903.0, 1135.0], [901.0, 1859.0], [899.0, 1404.625], [898.0, 1464.5625000000002], [910.0, 1828.0], [909.0, 2136.0], [908.0, 1589.0], [906.0, 1011.0], [905.0, 1510.0], [904.0, 2481.0], [919.0, 968.0], [918.0, 1349.0], [954.0, 878.5], [959.0, 1314.0], [956.0, 635.8], [948.0, 1074.1739130434783], [947.0, 946.0], [946.0, 1834.0], [945.0, 860.0], [944.0, 983.0], [949.0, 890.0], [955.0, 1226.2307692307693], [957.0, 854.3333333333334], [952.0, 896.0], [934.0, 1132.0], [933.0, 1006.0], [932.0, 1663.0], [931.0, 1557.0], [930.0, 1119.0], [929.0, 979.0], [928.0, 875.0], [942.0, 1173.5], [940.0, 977.0], [939.0, 1432.0], [938.0, 1136.0], [937.0, 924.0], [936.0, 911.0], [951.0, 877.0], [950.0, 1291.5], [990.0, 1689.5], [961.0, 1057.5], [974.0, 1845.5], [960.0, 876.0], [972.0, 1038.5], [970.0, 956.0], [969.0, 1046.0], [968.0, 914.6666666666666], [991.0, 3594.0], [977.0, 2125.0], [988.0, 1523.0], [987.0, 1689.0], [986.0, 1733.6666666666667], [965.0, 951.0], [963.0, 1543.0], [983.0, 1459.0], [981.0, 2653.0], [980.0, 1767.0], [979.0, 1278.0], [1020.0, 1674.0], [992.0, 1124.6686746987907], [1004.0, 972.0], [1003.0, 913.0], [1002.0, 1250.0], [1001.0, 973.0], [1000.0, 937.0], [1010.0, 1341.0], [1011.0, 857.0], [1012.0, 1174.0], [1014.0, 2463.0], [1013.0, 1107.0], [1017.0, 757.0], [1021.0, 958.0], [1009.0, 1446.5], [1008.0, 1149.5], [1019.0, 1751.0], [1018.0, 1293.5], [1016.0, 1089.5], [999.0, 2430.0], [998.0, 937.0], [997.0, 1665.0], [996.0, 1502.5], [994.0, 1671.5], [1038.0, 1128.0], [1032.0, 767.0], [1048.0, 1021.5], [1026.0, 680.0], [1024.0, 1542.0], [1028.0, 1061.0], [1052.0, 1071.0], [1054.0, 992.0], [1050.0, 1649.5], [1034.0, 726.0], [1072.0, 1055.0], [1074.0, 833.0], [1080.0, 1868.5], [1076.0, 875.5], [1086.0, 1906.0], [1056.0, 924.0], [1060.0, 997.0], [1064.0, 797.0], [1066.0, 773.0], [1070.0, 1279.0], [1040.0, 1247.3333333333333], [1044.0, 1298.5], [1046.0, 1047.5], [1094.0, 1273.5], [1090.0, 1576.0], [1102.0, 1064.0], [1092.0, 1092.0], [1138.0, 1222.0], [1140.0, 2340.0], [1142.0, 1153.0], [1108.0, 953.0], [1104.0, 896.0], [1110.0, 931.0], [1112.0, 1265.6666666666667], [1114.0, 1563.0], [1116.0, 1275.3294751317953], [1088.0, 1443.6666666666667], [1118.0, 1228.5], [1120.0, 1540.0], [1122.0, 882.5], [1126.0, 1477.0], [1124.0, 2144.0], [1128.0, 1577.5], [1132.0, 1219.0], [1150.0, 1604.0], [1146.0, 1087.5], [1144.0, 1735.0], [1208.0, 1142.8636363636365], [1206.0, 1026.0], [1214.0, 1446.0], [1212.0, 1089.0], [1210.0, 999.6666666666666], [1178.0, 1260.0], [1152.0, 1488.0], [1156.0, 1250.5], [1154.0, 1129.0], [1158.0, 1212.0], [1160.0, 1166.0], [1164.0, 1265.0], [1166.0, 1468.0], [1176.0, 1942.0], [1174.0, 1147.0], [1172.0, 1316.0], [1170.0, 1333.0], [1168.0, 1114.0], [1216.0, 1088.5], [1240.0, 1419.3975473100443], [1220.0, 1152.0], [1218.0, 1326.0], [1222.0, 1274.0], [1224.0, 786.0], [1228.0, 1028.0], [1236.0, 1095.0], [1234.0, 1198.5], [1035.0, 1083.5], [1025.0, 1075.3333333333333], [1027.0, 963.0], [1031.0, 1166.0], [1029.0, 1090.0], [1053.0, 1340.0], [1055.0, 1165.0], [1051.0, 1636.6666666666667], [1033.0, 1249.0], [1037.0, 1002.0], [1073.0, 1039.0], [1075.0, 1994.0], [1079.0, 958.5], [1077.0, 782.0], [1081.0, 952.0], [1083.0, 1812.3333333333333], [1059.0, 893.0], [1057.0, 870.0], [1061.0, 810.0], [1063.0, 878.0], [1065.0, 460.0], [1067.0, 1521.0], [1069.0, 1358.75], [1071.0, 883.0], [1043.0, 971.5], [1041.0, 2270.0], [1045.0, 827.0], [1047.0, 1793.0], [1103.0, 1088.0], [1147.0, 1627.0], [1101.0, 1261.0], [1099.0, 1303.0], [1097.0, 1278.0], [1091.0, 1325.0], [1137.0, 1591.0], [1139.0, 1452.0], [1141.0, 1614.0], [1109.0, 1592.0], [1107.0, 1485.0], [1105.0, 956.0], [1113.0, 886.0], [1115.0, 2140.0], [1119.0, 1406.0], [1089.0, 1130.0], [1151.0, 1368.0], [1123.0, 1445.0], [1129.0, 834.0], [1131.0, 1512.0], [1135.0, 2398.0], [1133.0, 1480.0], [1149.0, 1539.5], [1163.0, 1376.5], [1211.0, 1049.0], [1213.0, 980.5], [1209.0, 1311.6], [1153.0, 1322.0], [1157.0, 1454.0], [1159.0, 1222.0], [1161.0, 1622.0], [1165.0, 1218.0], [1167.0, 1117.0], [1177.0, 1213.0], [1175.0, 1214.0], [1173.0, 1470.0], [1171.0, 1514.0], [1169.0, 1084.0], [1217.0, 1047.0], [1239.0, 1881.0], [1223.0, 1135.0], [1225.0, 1250.0], [1227.0, 1394.5], [1237.0, 1244.0], [1235.0, 914.0], [1233.0, 1649.0], [1231.0, 1025.5], [1229.0, 1174.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[815.8260249585904, 940.2671667832797]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1240.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 41717.51666666667, "minX": 1.54989168E12, "maxY": 295071.05, "series": [{"data": [[1.5498918E12, 250821.91666666666], [1.54989174E12, 295071.05], [1.54989168E12, 95419.45]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5498918E12, 109661.51666666666], [1.54989174E12, 129006.68333333333], [1.54989168E12, 41717.51666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498918E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 229.63557354604433, "minX": 1.54989168E12, "maxY": 1403.2290359835963, "series": [{"data": [[1.5498918E12, 1403.2290359835963], [1.54989174E12, 776.5290188454146], [1.54989168E12, 229.63557354604433]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5498918E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 229.6316447407576, "minX": 1.54989168E12, "maxY": 1403.2243483774314, "series": [{"data": [[1.5498918E12, 1403.2243483774314], [1.54989174E12, 776.5277676182442], [1.54989168E12, 229.6316447407576]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5498918E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.13003137692737182, "minX": 1.54989168E12, "maxY": 0.2027501637002212, "series": [{"data": [[1.5498918E12, 0.1444779093729476], [1.54989174E12, 0.13003137692737182], [1.54989168E12, 0.2027501637002212]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5498918E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 6.0, "minX": 1.54989168E12, "maxY": 7283.0, "series": [{"data": [[1.5498918E12, 6645.0], [1.54989174E12, 7283.0], [1.54989168E12, 3366.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5498918E12, 61.0], [1.54989174E12, 9.0], [1.54989168E12, 6.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5498918E12, 2513.0], [1.54989174E12, 2199.0], [1.54989168E12, 450.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5498918E12, 4159.950000000008], [1.54989174E12, 3152.980000000003], [1.54989168E12, 903.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5498918E12, 3000.0], [1.54989174E12, 2552.0], [1.54989168E12, 568.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498918E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 180.0, "minX": 279.0, "maxY": 1228.0, "series": [{"data": [[279.0, 180.0], [735.0, 1228.0], [865.0, 831.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 865.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 180.0, "minX": 279.0, "maxY": 1228.0, "series": [{"data": [[279.0, 180.0], [735.0, 1228.0], [865.0, 831.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 865.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 286.18333333333334, "minX": 1.54989168E12, "maxY": 878.2166666666667, "series": [{"data": [[1.5498918E12, 717.3833333333333], [1.54989174E12, 878.2166666666667], [1.54989168E12, 286.18333333333334]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498918E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 279.98333333333335, "minX": 1.54989168E12, "maxY": 865.8166666666667, "series": [{"data": [[1.5498918E12, 735.9833333333333], [1.54989174E12, 865.8166666666667], [1.54989168E12, 279.98333333333335]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5498918E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 279.98333333333335, "minX": 1.54989168E12, "maxY": 865.8166666666667, "series": [{"data": [[1.5498918E12, 735.9833333333333], [1.54989174E12, 865.8166666666667], [1.54989168E12, 279.98333333333335]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5498918E12, "title": "Transactions Per Second"}},
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
