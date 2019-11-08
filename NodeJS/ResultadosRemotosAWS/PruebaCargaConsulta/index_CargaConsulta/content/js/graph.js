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
        data: {"result": {"minY": 9.0, "minX": 0.0, "maxY": 21329.0, "series": [{"data": [[0.0, 9.0], [0.1, 16.0], [0.2, 19.0], [0.3, 21.0], [0.4, 23.0], [0.5, 25.0], [0.6, 27.0], [0.7, 29.0], [0.8, 30.0], [0.9, 32.0], [1.0, 33.0], [1.1, 35.0], [1.2, 36.0], [1.3, 37.0], [1.4, 39.0], [1.5, 40.0], [1.6, 41.0], [1.7, 43.0], [1.8, 44.0], [1.9, 46.0], [2.0, 47.0], [2.1, 48.0], [2.2, 50.0], [2.3, 51.0], [2.4, 52.0], [2.5, 53.0], [2.6, 55.0], [2.7, 56.0], [2.8, 58.0], [2.9, 59.0], [3.0, 60.0], [3.1, 61.0], [3.2, 63.0], [3.3, 64.0], [3.4, 66.0], [3.5, 67.0], [3.6, 68.0], [3.7, 70.0], [3.8, 71.0], [3.9, 72.0], [4.0, 74.0], [4.1, 75.0], [4.2, 77.0], [4.3, 78.0], [4.4, 79.0], [4.5, 80.0], [4.6, 82.0], [4.7, 83.0], [4.8, 84.0], [4.9, 85.0], [5.0, 87.0], [5.1, 88.0], [5.2, 89.0], [5.3, 90.0], [5.4, 91.0], [5.5, 93.0], [5.6, 94.0], [5.7, 95.0], [5.8, 96.0], [5.9, 98.0], [6.0, 99.0], [6.1, 100.0], [6.2, 101.0], [6.3, 102.0], [6.4, 104.0], [6.5, 105.0], [6.6, 106.0], [6.7, 108.0], [6.8, 109.0], [6.9, 110.0], [7.0, 111.0], [7.1, 112.0], [7.2, 114.0], [7.3, 115.0], [7.4, 116.0], [7.5, 117.0], [7.6, 119.0], [7.7, 120.0], [7.8, 121.0], [7.9, 122.0], [8.0, 123.0], [8.1, 124.0], [8.2, 125.0], [8.3, 126.0], [8.4, 128.0], [8.5, 129.0], [8.6, 130.0], [8.7, 131.0], [8.8, 132.0], [8.9, 133.0], [9.0, 134.0], [9.1, 135.0], [9.2, 136.0], [9.3, 137.0], [9.4, 138.0], [9.5, 139.0], [9.6, 140.0], [9.7, 141.0], [9.8, 142.0], [9.9, 143.0], [10.0, 144.0], [10.1, 146.0], [10.2, 147.0], [10.3, 148.0], [10.4, 149.0], [10.5, 150.0], [10.6, 151.0], [10.7, 152.0], [10.8, 153.0], [10.9, 154.0], [11.0, 155.0], [11.1, 156.0], [11.2, 157.0], [11.3, 158.0], [11.4, 159.0], [11.5, 160.0], [11.6, 162.0], [11.7, 163.0], [11.8, 164.0], [11.9, 165.0], [12.0, 166.0], [12.1, 167.0], [12.2, 168.0], [12.3, 169.0], [12.4, 170.0], [12.5, 171.0], [12.6, 172.0], [12.7, 173.0], [12.8, 174.0], [12.9, 176.0], [13.0, 177.0], [13.1, 178.0], [13.2, 179.0], [13.3, 180.0], [13.4, 181.0], [13.5, 182.0], [13.6, 183.0], [13.7, 184.0], [13.8, 185.0], [13.9, 187.0], [14.0, 188.0], [14.1, 189.0], [14.2, 190.0], [14.3, 191.0], [14.4, 192.0], [14.5, 193.0], [14.6, 194.0], [14.7, 195.0], [14.8, 196.0], [14.9, 198.0], [15.0, 199.0], [15.1, 200.0], [15.2, 201.0], [15.3, 202.0], [15.4, 203.0], [15.5, 204.0], [15.6, 205.0], [15.7, 207.0], [15.8, 208.0], [15.9, 209.0], [16.0, 210.0], [16.1, 211.0], [16.2, 212.0], [16.3, 213.0], [16.4, 214.0], [16.5, 215.0], [16.6, 217.0], [16.7, 218.0], [16.8, 219.0], [16.9, 220.0], [17.0, 221.0], [17.1, 222.0], [17.2, 223.0], [17.3, 225.0], [17.4, 226.0], [17.5, 227.0], [17.6, 228.0], [17.7, 229.0], [17.8, 230.0], [17.9, 231.0], [18.0, 233.0], [18.1, 234.0], [18.2, 235.0], [18.3, 236.0], [18.4, 237.0], [18.5, 239.0], [18.6, 240.0], [18.7, 241.0], [18.8, 242.0], [18.9, 243.0], [19.0, 244.0], [19.1, 245.0], [19.2, 247.0], [19.3, 248.0], [19.4, 249.0], [19.5, 250.0], [19.6, 251.0], [19.7, 252.0], [19.8, 253.0], [19.9, 254.0], [20.0, 256.0], [20.1, 257.0], [20.2, 258.0], [20.3, 259.0], [20.4, 260.0], [20.5, 262.0], [20.6, 263.0], [20.7, 264.0], [20.8, 265.0], [20.9, 266.0], [21.0, 267.0], [21.1, 268.0], [21.2, 269.0], [21.3, 271.0], [21.4, 272.0], [21.5, 273.0], [21.6, 274.0], [21.7, 275.0], [21.8, 276.0], [21.9, 277.0], [22.0, 279.0], [22.1, 280.0], [22.2, 281.0], [22.3, 282.0], [22.4, 283.0], [22.5, 284.0], [22.6, 286.0], [22.7, 287.0], [22.8, 288.0], [22.9, 289.0], [23.0, 290.0], [23.1, 291.0], [23.2, 293.0], [23.3, 294.0], [23.4, 295.0], [23.5, 296.0], [23.6, 297.0], [23.7, 298.0], [23.8, 299.0], [23.9, 300.0], [24.0, 302.0], [24.1, 303.0], [24.2, 304.0], [24.3, 305.0], [24.4, 306.0], [24.5, 307.0], [24.6, 308.0], [24.7, 309.0], [24.8, 310.0], [24.9, 312.0], [25.0, 313.0], [25.1, 314.0], [25.2, 315.0], [25.3, 316.0], [25.4, 317.0], [25.5, 319.0], [25.6, 320.0], [25.7, 321.0], [25.8, 322.0], [25.9, 323.0], [26.0, 324.0], [26.1, 326.0], [26.2, 327.0], [26.3, 328.0], [26.4, 329.0], [26.5, 330.0], [26.6, 332.0], [26.7, 333.0], [26.8, 334.0], [26.9, 335.0], [27.0, 336.0], [27.1, 337.0], [27.2, 339.0], [27.3, 340.0], [27.4, 342.0], [27.5, 343.0], [27.6, 344.0], [27.7, 345.0], [27.8, 346.0], [27.9, 348.0], [28.0, 349.0], [28.1, 350.0], [28.2, 351.0], [28.3, 353.0], [28.4, 354.0], [28.5, 355.0], [28.6, 356.0], [28.7, 358.0], [28.8, 359.0], [28.9, 360.0], [29.0, 361.0], [29.1, 363.0], [29.2, 364.0], [29.3, 365.0], [29.4, 366.0], [29.5, 368.0], [29.6, 369.0], [29.7, 370.0], [29.8, 371.0], [29.9, 373.0], [30.0, 374.0], [30.1, 375.0], [30.2, 377.0], [30.3, 378.0], [30.4, 379.0], [30.5, 381.0], [30.6, 382.0], [30.7, 383.0], [30.8, 384.0], [30.9, 386.0], [31.0, 387.0], [31.1, 388.0], [31.2, 389.0], [31.3, 391.0], [31.4, 392.0], [31.5, 394.0], [31.6, 395.0], [31.7, 396.0], [31.8, 397.0], [31.9, 399.0], [32.0, 400.0], [32.1, 402.0], [32.2, 403.0], [32.3, 405.0], [32.4, 406.0], [32.5, 407.0], [32.6, 408.0], [32.7, 410.0], [32.8, 411.0], [32.9, 413.0], [33.0, 414.0], [33.1, 416.0], [33.2, 417.0], [33.3, 418.0], [33.4, 420.0], [33.5, 421.0], [33.6, 423.0], [33.7, 425.0], [33.8, 426.0], [33.9, 427.0], [34.0, 429.0], [34.1, 430.0], [34.2, 432.0], [34.3, 433.0], [34.4, 435.0], [34.5, 436.0], [34.6, 437.0], [34.7, 439.0], [34.8, 441.0], [34.9, 442.0], [35.0, 444.0], [35.1, 446.0], [35.2, 447.0], [35.3, 449.0], [35.4, 451.0], [35.5, 452.0], [35.6, 454.0], [35.7, 455.0], [35.8, 457.0], [35.9, 458.0], [36.0, 460.0], [36.1, 462.0], [36.2, 463.0], [36.3, 465.0], [36.4, 466.0], [36.5, 468.0], [36.6, 469.0], [36.7, 471.0], [36.8, 473.0], [36.9, 474.0], [37.0, 476.0], [37.1, 477.0], [37.2, 479.0], [37.3, 481.0], [37.4, 482.0], [37.5, 484.0], [37.6, 486.0], [37.7, 487.0], [37.8, 489.0], [37.9, 491.0], [38.0, 492.0], [38.1, 494.0], [38.2, 496.0], [38.3, 497.0], [38.4, 498.0], [38.5, 500.0], [38.6, 502.0], [38.7, 504.0], [38.8, 506.0], [38.9, 508.0], [39.0, 510.0], [39.1, 512.0], [39.2, 513.0], [39.3, 515.0], [39.4, 517.0], [39.5, 519.0], [39.6, 520.0], [39.7, 522.0], [39.8, 524.0], [39.9, 526.0], [40.0, 528.0], [40.1, 530.0], [40.2, 532.0], [40.3, 533.0], [40.4, 535.0], [40.5, 537.0], [40.6, 539.0], [40.7, 541.0], [40.8, 543.0], [40.9, 545.0], [41.0, 547.0], [41.1, 549.0], [41.2, 551.0], [41.3, 553.0], [41.4, 555.0], [41.5, 557.0], [41.6, 559.0], [41.7, 561.0], [41.8, 563.0], [41.9, 565.0], [42.0, 567.0], [42.1, 569.0], [42.2, 571.0], [42.3, 574.0], [42.4, 576.0], [42.5, 578.0], [42.6, 580.0], [42.7, 582.0], [42.8, 585.0], [42.9, 586.0], [43.0, 589.0], [43.1, 591.0], [43.2, 593.0], [43.3, 595.0], [43.4, 597.0], [43.5, 599.0], [43.6, 602.0], [43.7, 604.0], [43.8, 606.0], [43.9, 609.0], [44.0, 612.0], [44.1, 615.0], [44.2, 617.0], [44.3, 620.0], [44.4, 622.0], [44.5, 625.0], [44.6, 627.0], [44.7, 629.0], [44.8, 632.0], [44.9, 634.0], [45.0, 636.0], [45.1, 639.0], [45.2, 642.0], [45.3, 644.0], [45.4, 647.0], [45.5, 649.0], [45.6, 652.0], [45.7, 655.0], [45.8, 657.0], [45.9, 659.0], [46.0, 662.0], [46.1, 665.0], [46.2, 668.0], [46.3, 670.0], [46.4, 673.0], [46.5, 676.0], [46.6, 679.0], [46.7, 682.0], [46.8, 684.0], [46.9, 688.0], [47.0, 690.0], [47.1, 693.0], [47.2, 696.0], [47.3, 699.0], [47.4, 702.0], [47.5, 705.0], [47.6, 708.0], [47.7, 712.0], [47.8, 715.0], [47.9, 718.0], [48.0, 721.0], [48.1, 724.0], [48.2, 727.0], [48.3, 730.0], [48.4, 732.0], [48.5, 736.0], [48.6, 738.0], [48.7, 741.0], [48.8, 745.0], [48.9, 748.0], [49.0, 752.0], [49.1, 755.0], [49.2, 759.0], [49.3, 763.0], [49.4, 766.0], [49.5, 770.0], [49.6, 773.0], [49.7, 777.0], [49.8, 780.0], [49.9, 784.0], [50.0, 787.0], [50.1, 791.0], [50.2, 795.0], [50.3, 798.0], [50.4, 802.0], [50.5, 805.0], [50.6, 808.0], [50.7, 812.0], [50.8, 816.0], [50.9, 819.0], [51.0, 823.0], [51.1, 826.0], [51.2, 830.0], [51.3, 834.0], [51.4, 838.0], [51.5, 842.0], [51.6, 847.0], [51.7, 851.0], [51.8, 856.0], [51.9, 859.0], [52.0, 864.0], [52.1, 869.0], [52.2, 873.0], [52.3, 876.0], [52.4, 880.0], [52.5, 885.0], [52.6, 889.0], [52.7, 894.0], [52.8, 898.0], [52.9, 903.0], [53.0, 907.0], [53.1, 913.0], [53.2, 917.0], [53.3, 922.0], [53.4, 926.0], [53.5, 931.0], [53.6, 937.0], [53.7, 941.0], [53.8, 946.0], [53.9, 951.0], [54.0, 955.0], [54.1, 960.0], [54.2, 964.0], [54.3, 970.0], [54.4, 975.0], [54.5, 980.0], [54.6, 985.0], [54.7, 989.0], [54.8, 994.0], [54.9, 998.0], [55.0, 1004.0], [55.1, 1009.0], [55.2, 1014.0], [55.3, 1019.0], [55.4, 1025.0], [55.5, 1030.0], [55.6, 1035.0], [55.7, 1039.0], [55.8, 1045.0], [55.9, 1051.0], [56.0, 1055.0], [56.1, 1061.0], [56.2, 1065.0], [56.3, 1071.0], [56.4, 1075.0], [56.5, 1081.0], [56.6, 1086.0], [56.7, 1091.0], [56.8, 1097.0], [56.9, 1102.0], [57.0, 1108.0], [57.1, 1113.0], [57.2, 1118.0], [57.3, 1124.0], [57.4, 1128.0], [57.5, 1133.0], [57.6, 1138.0], [57.7, 1143.0], [57.8, 1148.0], [57.9, 1153.0], [58.0, 1157.0], [58.1, 1161.0], [58.2, 1166.0], [58.3, 1170.0], [58.4, 1175.0], [58.5, 1181.0], [58.6, 1186.0], [58.7, 1191.0], [58.8, 1196.0], [58.9, 1200.0], [59.0, 1205.0], [59.1, 1211.0], [59.2, 1216.0], [59.3, 1222.0], [59.4, 1227.0], [59.5, 1232.0], [59.6, 1237.0], [59.7, 1242.0], [59.8, 1246.0], [59.9, 1250.0], [60.0, 1255.0], [60.1, 1259.0], [60.2, 1263.0], [60.3, 1267.0], [60.4, 1272.0], [60.5, 1277.0], [60.6, 1281.0], [60.7, 1285.0], [60.8, 1290.0], [60.9, 1295.0], [61.0, 1299.0], [61.1, 1304.0], [61.2, 1308.0], [61.3, 1312.0], [61.4, 1317.0], [61.5, 1321.0], [61.6, 1326.0], [61.7, 1330.0], [61.8, 1334.0], [61.9, 1338.0], [62.0, 1343.0], [62.1, 1347.0], [62.2, 1351.0], [62.3, 1356.0], [62.4, 1360.0], [62.5, 1365.0], [62.6, 1369.0], [62.7, 1374.0], [62.8, 1378.0], [62.9, 1382.0], [63.0, 1387.0], [63.1, 1390.0], [63.2, 1395.0], [63.3, 1398.0], [63.4, 1402.0], [63.5, 1406.0], [63.6, 1410.0], [63.7, 1415.0], [63.8, 1418.0], [63.9, 1423.0], [64.0, 1428.0], [64.1, 1432.0], [64.2, 1437.0], [64.3, 1441.0], [64.4, 1445.0], [64.5, 1449.0], [64.6, 1453.0], [64.7, 1458.0], [64.8, 1462.0], [64.9, 1465.0], [65.0, 1470.0], [65.1, 1474.0], [65.2, 1477.0], [65.3, 1481.0], [65.4, 1484.0], [65.5, 1488.0], [65.6, 1492.0], [65.7, 1496.0], [65.8, 1499.0], [65.9, 1503.0], [66.0, 1507.0], [66.1, 1510.0], [66.2, 1514.0], [66.3, 1517.0], [66.4, 1520.0], [66.5, 1524.0], [66.6, 1527.0], [66.7, 1531.0], [66.8, 1534.0], [66.9, 1538.0], [67.0, 1542.0], [67.1, 1546.0], [67.2, 1550.0], [67.3, 1553.0], [67.4, 1556.0], [67.5, 1560.0], [67.6, 1564.0], [67.7, 1567.0], [67.8, 1571.0], [67.9, 1574.0], [68.0, 1578.0], [68.1, 1582.0], [68.2, 1586.0], [68.3, 1589.0], [68.4, 1593.0], [68.5, 1597.0], [68.6, 1602.0], [68.7, 1605.0], [68.8, 1608.0], [68.9, 1612.0], [69.0, 1616.0], [69.1, 1620.0], [69.2, 1624.0], [69.3, 1628.0], [69.4, 1632.0], [69.5, 1636.0], [69.6, 1640.0], [69.7, 1643.0], [69.8, 1647.0], [69.9, 1650.0], [70.0, 1654.0], [70.1, 1657.0], [70.2, 1661.0], [70.3, 1665.0], [70.4, 1669.0], [70.5, 1672.0], [70.6, 1676.0], [70.7, 1680.0], [70.8, 1684.0], [70.9, 1688.0], [71.0, 1692.0], [71.1, 1696.0], [71.2, 1699.0], [71.3, 1703.0], [71.4, 1708.0], [71.5, 1712.0], [71.6, 1716.0], [71.7, 1720.0], [71.8, 1724.0], [71.9, 1728.0], [72.0, 1732.0], [72.1, 1735.0], [72.2, 1740.0], [72.3, 1743.0], [72.4, 1747.0], [72.5, 1751.0], [72.6, 1754.0], [72.7, 1757.0], [72.8, 1761.0], [72.9, 1764.0], [73.0, 1768.0], [73.1, 1772.0], [73.2, 1775.0], [73.3, 1779.0], [73.4, 1783.0], [73.5, 1787.0], [73.6, 1790.0], [73.7, 1794.0], [73.8, 1797.0], [73.9, 1801.0], [74.0, 1804.0], [74.1, 1808.0], [74.2, 1812.0], [74.3, 1816.0], [74.4, 1820.0], [74.5, 1824.0], [74.6, 1828.0], [74.7, 1832.0], [74.8, 1836.0], [74.9, 1840.0], [75.0, 1843.0], [75.1, 1848.0], [75.2, 1851.0], [75.3, 1855.0], [75.4, 1859.0], [75.5, 1863.0], [75.6, 1867.0], [75.7, 1871.0], [75.8, 1876.0], [75.9, 1880.0], [76.0, 1884.0], [76.1, 1889.0], [76.2, 1892.0], [76.3, 1897.0], [76.4, 1901.0], [76.5, 1905.0], [76.6, 1909.0], [76.7, 1914.0], [76.8, 1918.0], [76.9, 1923.0], [77.0, 1927.0], [77.1, 1930.0], [77.2, 1935.0], [77.3, 1940.0], [77.4, 1943.0], [77.5, 1948.0], [77.6, 1952.0], [77.7, 1956.0], [77.8, 1959.0], [77.9, 1964.0], [78.0, 1969.0], [78.1, 1973.0], [78.2, 1977.0], [78.3, 1981.0], [78.4, 1985.0], [78.5, 1989.0], [78.6, 1992.0], [78.7, 1996.0], [78.8, 2000.0], [78.9, 2004.0], [79.0, 2008.0], [79.1, 2012.0], [79.2, 2016.0], [79.3, 2020.0], [79.4, 2024.0], [79.5, 2028.0], [79.6, 2033.0], [79.7, 2037.0], [79.8, 2041.0], [79.9, 2045.0], [80.0, 2048.0], [80.1, 2052.0], [80.2, 2057.0], [80.3, 2061.0], [80.4, 2064.0], [80.5, 2068.0], [80.6, 2072.0], [80.7, 2076.0], [80.8, 2081.0], [80.9, 2086.0], [81.0, 2089.0], [81.1, 2094.0], [81.2, 2098.0], [81.3, 2101.0], [81.4, 2104.0], [81.5, 2108.0], [81.6, 2112.0], [81.7, 2115.0], [81.8, 2119.0], [81.9, 2124.0], [82.0, 2127.0], [82.1, 2131.0], [82.2, 2135.0], [82.3, 2138.0], [82.4, 2141.0], [82.5, 2145.0], [82.6, 2148.0], [82.7, 2152.0], [82.8, 2155.0], [82.9, 2159.0], [83.0, 2162.0], [83.1, 2166.0], [83.2, 2169.0], [83.3, 2173.0], [83.4, 2176.0], [83.5, 2180.0], [83.6, 2184.0], [83.7, 2187.0], [83.8, 2191.0], [83.9, 2194.0], [84.0, 2197.0], [84.1, 2201.0], [84.2, 2205.0], [84.3, 2208.0], [84.4, 2212.0], [84.5, 2215.0], [84.6, 2218.0], [84.7, 2221.0], [84.8, 2224.0], [84.9, 2228.0], [85.0, 2230.0], [85.1, 2234.0], [85.2, 2237.0], [85.3, 2241.0], [85.4, 2244.0], [85.5, 2248.0], [85.6, 2251.0], [85.7, 2255.0], [85.8, 2259.0], [85.9, 2263.0], [86.0, 2266.0], [86.1, 2270.0], [86.2, 2275.0], [86.3, 2279.0], [86.4, 2283.0], [86.5, 2286.0], [86.6, 2290.0], [86.7, 2294.0], [86.8, 2298.0], [86.9, 2302.0], [87.0, 2306.0], [87.1, 2310.0], [87.2, 2314.0], [87.3, 2319.0], [87.4, 2323.0], [87.5, 2328.0], [87.6, 2332.0], [87.7, 2337.0], [87.8, 2342.0], [87.9, 2347.0], [88.0, 2352.0], [88.1, 2357.0], [88.2, 2362.0], [88.3, 2367.0], [88.4, 2372.0], [88.5, 2377.0], [88.6, 2383.0], [88.7, 2387.0], [88.8, 2393.0], [88.9, 2400.0], [89.0, 2406.0], [89.1, 2411.0], [89.2, 2418.0], [89.3, 2425.0], [89.4, 2431.0], [89.5, 2437.0], [89.6, 2444.0], [89.7, 2450.0], [89.8, 2456.0], [89.9, 2462.0], [90.0, 2468.0], [90.1, 2475.0], [90.2, 2481.0], [90.3, 2488.0], [90.4, 2495.0], [90.5, 2501.0], [90.6, 2507.0], [90.7, 2514.0], [90.8, 2523.0], [90.9, 2530.0], [91.0, 2537.0], [91.1, 2546.0], [91.2, 2554.0], [91.3, 2564.0], [91.4, 2575.0], [91.5, 2585.0], [91.6, 2595.0], [91.7, 2604.0], [91.8, 2614.0], [91.9, 2627.0], [92.0, 2637.0], [92.1, 2648.0], [92.2, 2658.0], [92.3, 2670.0], [92.4, 2680.0], [92.5, 2694.0], [92.6, 2708.0], [92.7, 2722.0], [92.8, 2734.0], [92.9, 2745.0], [93.0, 2760.0], [93.1, 2772.0], [93.2, 2786.0], [93.3, 2799.0], [93.4, 2815.0], [93.5, 2830.0], [93.6, 2845.0], [93.7, 2862.0], [93.8, 2876.0], [93.9, 2894.0], [94.0, 2911.0], [94.1, 2926.0], [94.2, 2945.0], [94.3, 2963.0], [94.4, 2979.0], [94.5, 2997.0], [94.6, 3016.0], [94.7, 3036.0], [94.8, 3053.0], [94.9, 3071.0], [95.0, 3092.0], [95.1, 3113.0], [95.2, 3131.0], [95.3, 3149.0], [95.4, 3167.0], [95.5, 3190.0], [95.6, 3214.0], [95.7, 3239.0], [95.8, 3266.0], [95.9, 3289.0], [96.0, 3322.0], [96.1, 3346.0], [96.2, 3373.0], [96.3, 3403.0], [96.4, 3424.0], [96.5, 3457.0], [96.6, 3489.0], [96.7, 3530.0], [96.8, 3563.0], [96.9, 3600.0], [97.0, 3641.0], [97.1, 3669.0], [97.2, 3695.0], [97.3, 3716.0], [97.4, 3742.0], [97.5, 3772.0], [97.6, 3800.0], [97.7, 3829.0], [97.8, 3864.0], [97.9, 3903.0], [98.0, 3941.0], [98.1, 3979.0], [98.2, 4028.0], [98.3, 4074.0], [98.4, 4138.0], [98.5, 4198.0], [98.6, 4275.0], [98.7, 4331.0], [98.8, 4394.0], [98.9, 4470.0], [99.0, 4556.0], [99.1, 4660.0], [99.2, 4825.0], [99.3, 5121.0], [99.4, 5498.0], [99.5, 6014.0], [99.6, 6704.0], [99.7, 8308.0], [99.8, 10759.0], [99.9, 15158.0], [100.0, 21329.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 8109.0, "series": [{"data": [[0.0, 5435.0], [100.0, 8109.0], [200.0, 7868.0], [300.0, 7313.0], [400.0, 5866.0], [500.0, 4539.0], [600.0, 3422.0], [700.0, 2708.0], [800.0, 2250.0], [900.0, 1879.0], [1000.0, 1738.0], [1100.0, 1823.0], [1200.0, 1908.0], [1300.0, 2091.0], [1400.0, 2252.0], [1500.0, 2448.0], [1600.0, 2382.0], [1700.0, 2391.0], [1800.0, 2249.0], [1900.0, 2189.0], [2000.0, 2209.0], [2100.0, 2527.0], [2200.0, 2491.0], [2300.0, 1851.0], [2400.0, 1416.0], [2500.0, 1064.0], [2600.0, 796.0], [2700.0, 693.0], [2800.0, 563.0], [2900.0, 523.0], [3000.0, 471.0], [3100.0, 454.0], [3200.0, 352.0], [3300.0, 323.0], [3400.0, 308.0], [3500.0, 238.0], [3700.0, 344.0], [3600.0, 285.0], [3800.0, 259.0], [3900.0, 236.0], [4000.0, 174.0], [4100.0, 143.0], [4200.0, 120.0], [4300.0, 156.0], [4600.0, 80.0], [4500.0, 88.0], [4400.0, 115.0], [4700.0, 56.0], [4800.0, 38.0], [4900.0, 34.0], [5000.0, 23.0], [5100.0, 22.0], [5200.0, 25.0], [5300.0, 25.0], [5500.0, 20.0], [5600.0, 24.0], [5400.0, 27.0], [5700.0, 22.0], [5800.0, 9.0], [5900.0, 12.0], [6100.0, 13.0], [6000.0, 6.0], [6200.0, 9.0], [6300.0, 14.0], [6400.0, 18.0], [6600.0, 13.0], [6500.0, 16.0], [6700.0, 13.0], [6800.0, 11.0], [6900.0, 9.0], [7100.0, 4.0], [7000.0, 5.0], [7400.0, 3.0], [7200.0, 3.0], [7300.0, 6.0], [7600.0, 8.0], [7500.0, 2.0], [7700.0, 7.0], [7800.0, 7.0], [7900.0, 3.0], [8100.0, 4.0], [8000.0, 2.0], [8400.0, 6.0], [8700.0, 3.0], [8600.0, 1.0], [8200.0, 4.0], [8500.0, 6.0], [8300.0, 2.0], [8900.0, 4.0], [8800.0, 1.0], [9200.0, 3.0], [9000.0, 1.0], [9100.0, 1.0], [9400.0, 4.0], [9300.0, 5.0], [9700.0, 4.0], [9600.0, 3.0], [9500.0, 2.0], [9800.0, 3.0], [9900.0, 2.0], [10000.0, 4.0], [10200.0, 4.0], [10100.0, 2.0], [10500.0, 7.0], [10300.0, 9.0], [10400.0, 7.0], [10600.0, 5.0], [10700.0, 4.0], [11100.0, 3.0], [11200.0, 5.0], [10900.0, 6.0], [10800.0, 2.0], [11500.0, 3.0], [11700.0, 3.0], [11600.0, 4.0], [11400.0, 7.0], [11300.0, 2.0], [11800.0, 1.0], [12200.0, 2.0], [12100.0, 3.0], [12000.0, 1.0], [12300.0, 3.0], [12600.0, 4.0], [12500.0, 2.0], [12700.0, 1.0], [12400.0, 4.0], [13300.0, 1.0], [12900.0, 2.0], [12800.0, 3.0], [13000.0, 2.0], [13100.0, 2.0], [13700.0, 2.0], [13800.0, 2.0], [13400.0, 1.0], [13500.0, 1.0], [14300.0, 1.0], [14200.0, 1.0], [13900.0, 1.0], [14000.0, 1.0], [14100.0, 4.0], [14600.0, 2.0], [14800.0, 2.0], [15200.0, 4.0], [15000.0, 1.0], [15100.0, 3.0], [15300.0, 1.0], [14900.0, 1.0], [15700.0, 7.0], [15800.0, 6.0], [15500.0, 3.0], [15600.0, 3.0], [15400.0, 1.0], [16100.0, 3.0], [15900.0, 5.0], [16300.0, 4.0], [16000.0, 5.0], [16200.0, 1.0], [17300.0, 2.0], [16500.0, 4.0], [16800.0, 1.0], [16900.0, 5.0], [17200.0, 3.0], [17400.0, 3.0], [16400.0, 2.0], [17100.0, 4.0], [17000.0, 1.0], [17900.0, 1.0], [19000.0, 3.0], [18600.0, 2.0], [19300.0, 2.0], [19400.0, 2.0], [18900.0, 2.0], [19100.0, 1.0], [20400.0, 2.0], [19500.0, 1.0], [19700.0, 1.0], [20100.0, 1.0], [20000.0, 1.0], [19600.0, 1.0], [21300.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 21300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 24584.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 34637.0, "series": [{"data": [[1.0, 24584.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 34637.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 30706.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 169.0855859672914, "minX": 1.54989516E12, "maxY": 1181.5142987322802, "series": [{"data": [[1.54989528E12, 1181.5142987322802], [1.54989516E12, 169.0855859672914], [1.54989522E12, 639.1134631875556]], "isOverall": false, "label": "bzm - Concurrency Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989528E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 49.0, "minX": 1.0, "maxY": 4599.0, "series": [{"data": [[2.0, 4003.0], [3.0, 1755.0], [4.0, 1758.0], [5.0, 1918.0], [6.0, 1828.0], [7.0, 1757.0], [8.0, 1802.0], [9.0, 1771.0], [10.0, 1752.0], [11.0, 1902.0], [12.0, 1749.0], [13.0, 1890.0], [14.0, 1881.0], [15.0, 1891.0], [16.0, 1841.0], [17.0, 1890.0], [18.0, 1854.0], [19.0, 1726.0], [20.0, 2890.0], [21.0, 3023.0], [22.0, 1909.0], [23.0, 3854.0], [24.0, 3060.0], [25.0, 351.8333333333333], [26.0, 1604.5], [27.0, 280.1818181818182], [28.0, 204.72727272727275], [29.0, 652.6666666666666], [30.0, 1878.0], [31.0, 539.8333333333334], [32.0, 949.0], [33.0, 977.3333333333334], [34.0, 275.875], [35.0, 1454.5], [36.0, 433.2], [37.0, 1059.0], [38.0, 470.6], [39.0, 236.70000000000002], [40.0, 390.1666666666667], [41.0, 886.5], [42.0, 943.5], [43.0, 2018.0], [44.0, 911.5], [45.0, 1858.0], [46.0, 1070.0], [47.0, 874.5], [49.0, 580.4285714285714], [48.0, 3686.0], [50.0, 410.8], [51.0, 319.125], [52.0, 382.66666666666663], [53.0, 442.6], [54.0, 621.6666666666666], [55.0, 1854.0], [56.0, 1016.5], [57.0, 882.0], [58.0, 517.75], [59.0, 1972.0], [60.0, 535.5], [61.0, 537.25], [62.0, 234.1], [63.0, 724.6666666666666], [64.0, 952.0], [65.0, 635.3333333333334], [66.0, 961.5], [67.0, 984.5], [68.0, 624.0], [69.0, 81.5], [70.0, 1986.0], [71.0, 1825.0], [72.0, 1871.0], [73.0, 637.6666666666666], [74.0, 630.0], [75.0, 1313.3333333333333], [76.0, 669.6666666666666], [77.0, 910.5], [78.0, 541.25], [79.0, 660.6666666666666], [80.0, 668.0], [82.0, 429.2], [83.0, 1148.0], [81.0, 1703.0], [86.0, 1030.3333333333335], [87.0, 539.25], [85.0, 1936.0], [84.0, 3176.0], [88.0, 404.6], [89.0, 320.0], [90.0, 619.2857142857143], [91.0, 91.66666666666667], [94.0, 369.375], [95.0, 1687.0], [93.0, 2875.0], [92.0, 2540.0], [97.0, 318.0], [98.0, 902.0], [99.0, 1693.0], [96.0, 2801.0], [100.0, 110.5], [102.0, 705.6666666666666], [103.0, 1930.0], [101.0, 2756.5], [106.0, 902.5], [107.0, 411.6666666666667], [105.0, 1831.0], [104.0, 2884.0], [108.0, 1035.0], [109.0, 944.0], [110.0, 896.0], [111.0, 2021.0], [113.0, 545.25], [115.0, 897.5], [114.0, 1874.0], [112.0, 2117.0], [116.0, 644.0], [118.0, 1017.5], [119.0, 1222.6666666666667], [117.0, 2066.0], [120.0, 924.5], [121.0, 956.5], [123.0, 959.0], [122.0, 3094.0], [124.0, 170.80694386112353], [125.0, 811.6666666666666], [126.0, 695.3333333333334], [127.0, 1858.0], [131.0, 904.5], [132.0, 978.0], [133.0, 1709.0], [135.0, 1860.0], [134.0, 1766.0], [130.0, 1779.0], [129.0, 2911.0], [128.0, 1669.0], [137.0, 527.0], [138.0, 577.0], [139.0, 663.5], [142.0, 1046.5], [143.0, 1007.5], [141.0, 1726.0], [140.0, 2771.0], [136.0, 1657.0], [145.0, 1147.5], [148.0, 451.8571428571429], [149.0, 1087.5], [150.0, 1336.5], [151.0, 1882.0], [147.0, 1635.0], [146.0, 3224.0], [144.0, 1617.0], [152.0, 703.6], [153.0, 845.3333333333333], [155.0, 1035.5], [156.0, 639.0], [157.0, 475.25], [158.0, 1089.0], [159.0, 1774.0], [154.0, 1770.0], [161.0, 859.3333333333334], [165.0, 1142.25], [167.0, 992.5], [166.0, 1867.0], [163.0, 1869.0], [162.0, 1769.0], [160.0, 1609.0], [172.0, 951.5], [173.0, 1012.0], [175.0, 1754.0], [174.0, 1838.0], [171.0, 1876.0], [170.0, 1893.0], [169.0, 1802.0], [168.0, 2036.0], [180.0, 1275.0], [183.0, 942.0], [182.0, 2842.0], [181.0, 1948.0], [179.0, 2842.0], [178.0, 2849.0], [177.0, 1752.0], [176.0, 2502.0], [187.0, 1898.0], [189.0, 788.8], [191.0, 965.5], [190.0, 1693.0], [188.0, 1805.0], [186.0, 1839.0], [185.0, 1684.0], [184.0, 1792.0], [192.0, 466.4], [194.0, 1204.5], [195.0, 894.0], [199.0, 1861.0], [198.0, 1766.0], [197.0, 1990.0], [196.0, 2111.0], [193.0, 1838.0], [200.0, 932.0], [202.0, 824.5], [207.0, 1673.0], [206.0, 2810.0], [205.0, 3648.0], [204.0, 2270.5], [201.0, 2830.0], [215.0, 1714.0], [213.0, 1551.0], [212.0, 1760.5], [210.0, 1809.5], [208.0, 1824.0], [223.0, 1642.0], [222.0, 1951.0], [221.0, 2760.0], [220.0, 1666.0], [219.0, 1611.0], [218.0, 1705.0], [217.0, 1667.0], [216.0, 1744.0], [227.0, 49.0], [230.0, 935.0], [231.0, 2177.0], [229.0, 1927.0], [228.0, 1649.5], [226.0, 1835.0], [225.0, 1744.0], [224.0, 1756.0], [235.0, 588.6666666666666], [236.0, 892.5], [239.0, 1637.0], [238.0, 1817.0], [237.0, 1757.0], [234.0, 1767.0], [233.0, 1659.0], [232.0, 1677.0], [246.0, 1198.5], [247.0, 2108.0], [245.0, 1822.0], [244.0, 1624.0], [243.0, 1910.0], [242.0, 1753.0], [241.0, 1850.0], [240.0, 3258.0], [248.0, 346.3621209943975], [249.0, 1054.75], [250.0, 861.3333333333333], [251.0, 937.75], [252.0, 651.0], [253.0, 63.0], [255.0, 1631.0], [254.0, 1769.0], [271.0, 1646.0], [256.0, 595.3333333333334], [262.0, 1412.6666666666667], [261.0, 1559.0], [260.0, 1808.0], [263.0, 1651.0], [264.0, 1031.4], [265.0, 1431.5], [266.0, 1499.5], [267.0, 952.3333333333334], [268.0, 701.2], [259.0, 1662.0], [258.0, 1678.0], [257.0, 1827.0], [270.0, 2846.0], [269.0, 1861.0], [273.0, 828.0], [272.0, 652.5], [274.0, 757.3333333333333], [275.0, 1044.0], [276.0, 867.5], [277.0, 1672.0], [278.0, 590.3333333333333], [279.0, 1386.5], [280.0, 433.0], [281.0, 1579.0], [287.0, 2819.0], [285.0, 648.3333333333334], [284.0, 2682.0], [286.0, 1107.0], [282.0, 1490.5], [283.0, 899.5], [301.0, 1127.6666666666665], [288.0, 572.5], [289.0, 1510.5], [294.0, 1144.0], [293.0, 1688.0], [292.0, 2255.0], [295.0, 972.5], [297.0, 1498.5], [296.0, 1672.0], [299.0, 2734.0], [298.0, 2770.0], [303.0, 960.5], [302.0, 3117.0], [300.0, 2602.0], [290.0, 1698.0], [318.0, 2658.0], [314.0, 1102.0], [315.0, 149.0], [319.0, 1793.0], [317.0, 2295.0], [316.0, 2384.0], [313.0, 1755.0], [312.0, 2758.0], [311.0, 3142.0], [305.0, 1814.0], [304.0, 1765.0], [307.0, 1583.0], [306.0, 1614.0], [310.0, 3419.0], [309.0, 1572.0], [308.0, 2777.0], [323.0, 923.5], [320.0, 690.5], [321.0, 1768.0], [322.0, 901.0], [326.0, 927.0], [325.0, 2126.0], [327.0, 1987.0], [328.0, 617.3333333333334], [329.0, 1656.0], [331.0, 1642.0], [330.0, 1681.0], [335.0, 1917.0], [334.0, 1550.0], [333.0, 1797.0], [332.0, 2901.0], [350.0, 1596.0], [341.0, 1398.5], [340.0, 2083.0], [343.0, 1820.0], [336.0, 1730.0], [338.0, 1648.0], [337.0, 2624.0], [342.0, 1752.0], [348.0, 1177.0], [349.0, 1394.5], [351.0, 1715.0], [347.0, 1669.0], [346.0, 1719.0], [345.0, 1654.0], [344.0, 1701.0], [366.0, 1744.0], [352.0, 1716.5], [356.0, 1042.5], [357.0, 2940.0], [359.0, 2576.0], [358.0, 1645.0], [367.0, 2638.0], [365.0, 1786.0], [364.0, 1687.0], [355.0, 2631.0], [354.0, 2704.0], [353.0, 1775.0], [363.0, 1746.0], [362.0, 1737.0], [361.0, 2178.5], [381.0, 687.3333333333333], [372.0, 526.4037375054297], [373.0, 2661.0], [374.0, 1431.5], [376.0, 1384.0], [378.0, 1379.75], [380.0, 957.5], [375.0, 1734.0], [368.0, 2113.0], [370.0, 2616.0], [369.0, 2225.0], [371.0, 2656.0], [382.0, 385.8214285714285], [383.0, 553.4], [379.0, 1588.0], [396.0, 940.0], [384.0, 820.0], [385.0, 1153.5], [387.0, 1743.0], [386.0, 3443.0], [388.0, 1225.0], [389.0, 1051.0], [391.0, 2553.5], [392.0, 82.0], [393.0, 1107.6666666666667], [395.0, 1721.5], [399.0, 1891.0], [398.0, 1593.0], [397.0, 1637.0], [413.0, 592.090909090909], [400.0, 1104.0], [407.0, 876.5], [406.0, 2229.0], [405.0, 1579.0], [404.0, 1585.0], [411.0, 827.3333333333333], [412.0, 1128.0], [403.0, 1611.0], [402.0, 1608.0], [401.0, 1755.0], [415.0, 1593.0], [414.0, 2468.0], [410.0, 1582.0], [409.0, 1637.0], [408.0, 2087.0], [430.0, 1044.8], [417.0, 1688.0], [416.0, 3011.0], [418.0, 1364.0], [419.0, 507.35714285714283], [420.0, 768.5], [422.0, 1645.0], [421.0, 1711.0], [423.0, 1611.0], [425.0, 1113.0], [427.0, 1282.0], [426.0, 1666.0], [431.0, 2527.0], [424.0, 1660.0], [428.0, 1800.0], [445.0, 1791.5], [433.0, 1304.3333333333335], [434.0, 707.6666666666666], [436.0, 1046.0], [437.0, 1702.0], [439.0, 1798.0], [432.0, 1559.0], [438.0, 1854.0], [440.0, 976.0], [443.0, 236.0], [442.0, 1802.0], [441.0, 2033.0], [446.0, 855.5], [447.0, 3284.0], [444.0, 1634.0], [435.0, 2015.0], [462.0, 1953.0], [457.0, 1673.0], [459.0, 961.5], [463.0, 2007.0], [461.0, 1644.0], [460.0, 1864.0], [458.0, 2146.0], [456.0, 2105.0], [455.0, 2267.0], [449.0, 1557.0], [448.0, 2450.0], [451.0, 2080.0], [450.0, 2780.0], [454.0, 2092.0], [453.0, 1619.0], [452.0, 2197.0], [479.0, 1673.0], [475.0, 1087.5], [477.0, 1662.0], [478.0, 1850.0], [476.0, 1955.0], [467.0, 3019.0], [466.0, 2106.0], [465.0, 3079.0], [464.0, 1566.0], [474.0, 1608.0], [473.0, 1954.0], [472.0, 2141.0], [471.0, 1999.0], [470.0, 1813.0], [469.0, 3344.0], [468.0, 3097.0], [494.0, 2073.0], [495.0, 1803.0], [493.0, 1881.0], [492.0, 1499.0], [491.0, 1675.0], [490.0, 1806.0], [489.0, 1866.0], [488.0, 1828.0], [487.0, 2367.0], [481.0, 3301.0], [480.0, 2438.0], [483.0, 2254.0], [482.0, 1847.0], [486.0, 1998.0], [485.0, 1963.0], [484.0, 2390.0], [509.0, 1871.0], [496.0, 724.0937912813744], [498.0, 1137.0], [497.0, 1802.0], [503.0, 199.0], [502.0, 2100.0], [501.0, 1593.0], [500.0, 2067.0], [507.0, 830.0], [511.0, 1685.0], [510.0, 1602.0], [508.0, 1506.0], [499.0, 1803.0], [506.0, 1653.0], [505.0, 1563.0], [504.0, 1741.5], [537.0, 1574.0], [542.0, 1593.0], [530.0, 1210.5], [512.0, 1310.5], [526.0, 1671.0], [525.0, 1575.0], [524.0, 1538.0], [523.0, 1585.0], [522.0, 1703.0], [521.0, 1662.0], [520.0, 1743.0], [536.0, 1941.0], [519.0, 1604.0], [518.0, 1766.0], [517.0, 1598.0], [516.0, 1582.0], [515.0, 1655.0], [514.0, 1782.0], [513.0, 1611.0], [538.0, 1653.0], [531.0, 904.5], [532.0, 1635.0], [533.0, 926.5], [535.0, 1230.5], [534.0, 1669.0], [539.0, 953.0], [543.0, 1708.0], [529.0, 1608.0], [528.0, 1780.0], [541.0, 1564.0], [540.0, 1537.0], [570.0, 1650.0], [574.0, 1663.0], [575.0, 1573.0], [561.0, 1665.0], [560.0, 1516.0], [564.0, 1650.0], [563.0, 1598.0], [573.0, 2548.0], [572.0, 1774.0], [571.0, 1671.0], [569.0, 1667.0], [551.0, 1541.0], [550.0, 1629.0], [548.0, 2437.0], [547.0, 1638.0], [546.0, 1758.0], [545.0, 1689.0], [544.0, 1550.0], [559.0, 2000.0], [558.0, 1615.0], [556.0, 1591.0], [555.0, 1607.0], [554.0, 1598.0], [553.0, 1999.0], [552.0, 1543.0], [567.0, 1691.0], [565.0, 1525.0], [604.0, 1707.0], [607.0, 1663.0], [593.0, 1531.0], [592.0, 1806.0], [595.0, 1520.0], [594.0, 1556.0], [597.0, 1798.0], [596.0, 1509.0], [606.0, 1479.0], [605.0, 1708.0], [603.0, 1662.0], [602.0, 2384.0], [601.0, 1521.0], [600.0, 2032.0], [591.0, 1578.0], [577.0, 1816.0], [576.0, 1659.0], [579.0, 1654.0], [578.0, 1569.0], [581.0, 1813.0], [580.0, 1667.0], [583.0, 1661.0], [582.0, 1538.0], [589.0, 1619.0], [588.0, 1714.0], [587.0, 1723.0], [586.0, 1535.0], [585.0, 1547.0], [584.0, 1507.0], [599.0, 1713.0], [598.0, 2530.0], [634.0, 1090.0], [620.0, 884.7858742720624], [619.0, 1478.0], [618.0, 1620.0], [617.0, 1623.0], [616.0, 1556.0], [621.0, 1683.0], [622.0, 1455.0], [624.0, 935.0], [625.0, 2047.5], [626.0, 2092.5], [627.0, 1679.0], [629.0, 1798.0], [628.0, 1725.0], [631.0, 1759.0], [630.0, 1681.0], [633.0, 1308.0], [632.0, 1800.0], [623.0, 1765.0], [609.0, 1520.0], [608.0, 1478.0], [611.0, 1669.0], [610.0, 1668.0], [613.0, 1523.0], [612.0, 1769.0], [615.0, 1497.0], [614.0, 1722.0], [637.0, 1562.5], [636.0, 1591.0], [635.0, 1749.0], [638.0, 1722.0], [639.0, 1765.0], [643.0, 1100.4], [667.0, 299.0], [641.0, 1597.0], [642.0, 1950.0], [655.0, 1456.0], [640.0, 1793.0], [646.0, 1222.3333333333333], [645.0, 1696.0], [644.0, 1761.0], [664.0, 1699.0], [647.0, 1643.0], [666.0, 1862.0], [665.0, 1723.0], [648.0, 1381.0], [649.0, 1924.0], [651.0, 1537.0], [650.0, 1469.0], [653.0, 1708.0], [652.0, 1539.0], [654.0, 894.0], [658.0, 947.0], [660.0, 1041.5], [659.0, 1589.0], [661.0, 1619.0], [662.0, 125.0], [663.0, 1540.5], [670.0, 868.5], [669.0, 1644.0], [668.0, 1431.0], [671.0, 1943.0], [657.0, 1460.0], [656.0, 1686.0], [697.0, 1154.3333333333335], [683.0, 670.6666666666667], [672.0, 848.0], [675.0, 1425.0], [674.0, 1507.0], [673.0, 1454.0], [687.0, 1552.0], [676.0, 1961.0], [677.0, 2152.5], [678.0, 1807.0], [696.0, 1548.0], [679.0, 1517.0], [698.0, 863.75], [699.0, 1459.0], [700.0, 882.5], [701.0, 1677.5], [702.0, 958.5], [703.0, 1441.0], [688.0, 898.0], [690.0, 908.0], [689.0, 1532.0], [691.0, 1417.0], [693.0, 1460.0], [692.0, 1892.0], [695.0, 1866.0], [694.0, 2395.0], [680.0, 1252.5], [681.0, 867.5], [682.0, 816.0], [684.0, 1187.0], [685.0, 1883.0], [686.0, 1456.0], [709.0, 944.5], [717.0, 1877.5], [705.0, 1329.0], [704.0, 1472.0], [707.0, 1643.0], [706.0, 1560.0], [711.0, 842.5], [710.0, 1565.0], [728.0, 1587.0], [730.0, 1404.0], [729.0, 1443.0], [731.0, 1968.5], [735.0, 963.6666666666666], [721.0, 1745.0], [720.0, 1537.0], [734.0, 1478.0], [733.0, 1478.0], [732.0, 1533.0], [712.0, 1237.0], [714.0, 1520.0], [713.0, 1468.0], [715.0, 1070.0], [716.0, 1101.5], [719.0, 1234.0], [718.0, 1543.0], [722.0, 863.5], [725.0, 959.0], [724.0, 1547.0], [723.0, 1824.0], [727.0, 1406.0], [726.0, 1552.0], [763.0, 1387.0], [738.0, 901.5], [736.0, 911.5], [737.0, 1526.0], [740.0, 2224.5], [739.0, 1796.0], [742.0, 1137.75], [744.0, 1072.4572397522843], [745.0, 1794.0], [747.0, 1506.0], [746.0, 1512.0], [748.0, 1264.0], [749.0, 1217.0], [751.0, 1638.5], [752.0, 1161.0], [754.0, 1779.0], [753.0, 1438.0], [762.0, 999.0], [761.0, 1408.0], [760.0, 1462.0], [743.0, 1707.0], [764.0, 1496.0], [766.0, 1377.0], [765.0, 1384.0], [767.0, 1457.0], [755.0, 1776.3333333333333], [758.0, 1228.0], [757.0, 2310.0], [756.0, 1977.0], [759.0, 947.6666666666667], [792.0, 944.5], [768.0, 974.0], [770.0, 1101.0], [769.0, 1474.0], [771.0, 1508.0], [773.0, 1576.0], [772.0, 1372.0], [775.0, 1847.0], [774.0, 1366.0], [795.0, 966.5], [794.0, 1425.0], [793.0, 1449.0], [797.0, 1724.0], [796.0, 1921.0], [799.0, 2668.0], [784.0, 1762.0], [798.0, 1923.0], [778.0, 994.0], [777.0, 2292.0], [776.0, 1476.0], [779.0, 1638.0], [780.0, 986.5], [782.0, 1839.0], [781.0, 1759.0], [783.0, 1157.5], [785.0, 1326.5], [786.0, 1464.5], [787.0, 2297.5], [790.0, 1853.6666666666667], [789.0, 1906.0], [788.0, 1913.0], [791.0, 1543.0], [828.0, 1469.0], [804.0, 826.3333333333333], [803.0, 896.3333333333333], [802.0, 1541.0], [801.0, 1465.0], [800.0, 1851.0], [806.0, 357.0], [805.0, 2566.0], [824.0, 2123.0], [807.0, 1676.0], [809.0, 916.3333333333333], [808.0, 1959.0], [810.0, 1950.0], [811.0, 489.0], [812.0, 1959.0], [814.0, 1900.0], [813.0, 1400.0], [815.0, 1066.3333333333333], [822.0, 1164.5], [823.0, 1668.0], [831.0, 1185.0], [817.0, 2521.0], [816.0, 1944.0], [819.0, 1713.0], [818.0, 1394.0], [821.0, 1436.0], [820.0, 1400.0], [829.0, 946.0], [827.0, 1409.0], [826.0, 1409.0], [830.0, 1108.5], [825.0, 971.5], [856.0, 1359.0], [860.0, 1153.0], [833.0, 2209.5], [837.0, 1005.6666666666666], [836.0, 1880.0], [835.0, 1932.0], [834.0, 1464.0], [839.0, 1546.0], [838.0, 1874.0], [857.0, 1706.0], [859.0, 1488.0], [858.0, 1369.0], [862.0, 1420.0], [861.0, 1833.0], [843.0, 1491.0], [842.0, 1801.0], [841.0, 1752.5], [844.0, 1941.0], [847.0, 1175.4], [832.0, 1392.0], [846.0, 1685.0], [845.0, 1476.0], [848.0, 1168.0], [850.0, 927.0], [849.0, 1676.0], [851.0, 1755.0], [852.0, 1258.5], [854.0, 872.5], [853.0, 1499.0], [855.0, 1494.0], [890.0, 949.6666666666666], [870.0, 1389.0], [868.0, 1279.3313643567162], [869.0, 2171.0], [879.0, 1345.0], [865.0, 1999.0], [864.0, 2010.5], [867.0, 1526.0], [866.0, 1420.0], [871.0, 1633.5], [889.0, 1517.5], [875.0, 1759.5], [874.0, 1612.5], [872.0, 1918.0], [877.0, 1574.0], [876.0, 1708.0], [878.0, 1681.5], [884.0, 1792.0], [887.0, 1673.6666666666667], [885.0, 2002.0], [891.0, 1055.0], [892.0, 1290.0], [895.0, 988.5], [881.0, 1537.0], [880.0, 1637.0], [883.0, 1530.0], [882.0, 1813.0], [894.0, 1589.0], [893.0, 1507.0], [921.0, 1021.0], [900.0, 1504.0], [902.0, 1031.6666666666667], [901.0, 1613.0], [920.0, 1745.0], [903.0, 1886.0], [910.0, 1876.0], [909.0, 1428.0], [908.0, 1520.0], [907.0, 1769.0], [906.0, 2048.0], [905.0, 1591.0], [904.0, 1432.0], [911.0, 1566.5], [896.0, 2769.0], [899.0, 2018.0], [898.0, 1731.0], [915.0, 1430.5], [916.0, 1525.5], [917.0, 1830.0], [919.0, 1936.5], [918.0, 1415.0], [925.0, 1599.0], [924.0, 1745.0], [923.0, 2738.0], [922.0, 1787.0], [927.0, 1741.0], [912.0, 1999.0], [914.0, 1423.0], [913.0, 1303.0], [926.0, 1683.0], [955.0, 937.0], [959.0, 2070.0], [940.0, 1217.0], [938.0, 1438.0], [937.0, 1592.0], [936.0, 1667.0], [941.0, 2783.0], [942.0, 1980.5], [944.0, 952.5], [945.0, 1647.0], [946.0, 1009.5], [947.0, 2100.0], [949.0, 1576.0], [948.0, 1494.0], [950.0, 1033.0], [951.0, 2283.0], [954.0, 1586.0], [953.0, 1551.0], [952.0, 1578.0], [943.0, 1466.0], [928.0, 1712.0], [930.0, 1335.0], [929.0, 2554.0], [932.0, 1718.0], [931.0, 1573.0], [934.0, 1552.0], [933.0, 2110.0], [935.0, 1404.0], [956.0, 1483.0], [958.0, 1917.0], [957.0, 1416.0], [964.0, 1319.5], [963.0, 1692.0], [962.0, 1641.0], [961.0, 1720.0], [960.0, 1372.0], [966.0, 1328.5], [965.0, 2686.0], [967.0, 1511.0], [985.0, 1751.0], [984.0, 2006.0], [987.0, 2599.0], [986.0, 1329.0], [989.0, 1576.0], [988.0, 2652.0], [991.0, 1548.0], [976.0, 1449.0], [978.0, 2510.0], [977.0, 2024.0], [990.0, 2556.0], [969.0, 824.0], [968.0, 1387.0], [970.0, 2514.0], [972.0, 1581.0], [971.0, 1391.0], [973.0, 2127.5], [975.0, 1932.0], [974.0, 2501.0], [979.0, 905.0], [980.0, 1527.3333333333333], [981.0, 1567.0], [983.0, 1367.3333333333333], [982.0, 2018.0], [1017.0, 1319.3333333333333], [992.0, 1409.0640459364029], [998.0, 1196.0], [997.0, 1895.0], [996.0, 1577.0], [995.0, 1605.0], [993.0, 2244.0], [999.0, 1698.0], [1002.0, 702.8], [1001.0, 1528.0], [1000.0, 2449.0], [1003.0, 1869.0], [1007.0, 1677.0], [1006.0, 2359.0], [1005.0, 1684.0], [1004.0, 1677.0], [1019.0, 1486.0], [1018.0, 1499.0], [1023.0, 2669.0], [1009.0, 1677.5], [1011.0, 1956.0], [1010.0, 1710.0], [1013.0, 1610.0], [1012.0, 1882.0], [1015.0, 3263.0], [1014.0, 2201.0], [1022.0, 2751.0], [1021.0, 1481.0], [1020.0, 2496.0], [1034.0, 1955.0], [1024.0, 1501.0], [1054.0, 2420.0], [1052.0, 2421.0], [1072.0, 1809.0], [1038.0, 2133.0], [1036.0, 2156.0], [1032.0, 1958.0], [1030.0, 2465.0], [1026.0, 2068.0], [1040.0, 2246.0], [1042.0, 2167.0], [1044.0, 2490.0], [1048.0, 2528.0], [1046.0, 2489.5], [1050.0, 2530.0], [1056.0, 2178.0], [1058.0, 2562.0], [1060.0, 2416.0], [1062.0, 2453.0], [1064.0, 2462.0], [1066.0, 2467.0], [1068.0, 2470.0], [1070.0, 2359.0], [1082.0, 992.5], [1084.0, 2124.0], [1086.0, 2454.0], [1076.0, 1324.0], [1078.0, 2429.0], [1080.0, 2356.0], [1088.0, 2578.0], [1144.0, 1703.0], [1100.0, 1532.3333333333333], [1102.0, 2336.0], [1136.0, 2305.0], [1104.0, 2218.0], [1106.0, 2172.0], [1108.0, 2971.0], [1110.0, 2272.0], [1112.0, 1291.0], [1114.0, 2296.0], [1116.0, 1583.584348084349], [1090.0, 2401.0], [1092.0, 2395.0], [1094.0, 1897.0], [1096.0, 1980.0], [1098.0, 2228.0], [1118.0, 2296.0], [1124.0, 2341.0], [1122.0, 2532.0], [1120.0, 2227.0], [1126.0, 2254.0], [1128.0, 2308.0], [1130.0, 1380.0], [1132.0, 2308.0], [1134.0, 2420.0], [1146.0, 1966.0], [1148.0, 2325.0], [1150.0, 2406.0], [1140.0, 1944.5], [1138.0, 2340.0], [1142.0, 2376.0], [1164.0, 2263.0], [1152.0, 3740.5], [1180.0, 2417.5], [1182.0, 2437.5], [1154.0, 2212.0], [1162.0, 2292.0], [1160.0, 2279.0], [1158.0, 2580.0], [1156.0, 2364.0], [1166.0, 1582.0], [1186.0, 1989.3333333333335], [1204.0, 2764.5], [1184.0, 2316.0], [1214.0, 2332.5], [1212.0, 2609.3333333333335], [1210.0, 2352.0], [1206.0, 3385.0], [1198.0, 3334.0], [1196.0, 2310.0], [1194.0, 2313.0], [1190.0, 2522.0], [1174.0, 2976.0], [1172.0, 2349.0], [1170.0, 2403.0], [1168.0, 3429.0], [1176.0, 2462.0], [1220.0, 2452.0], [1240.0, 1848.7109644406569], [1222.0, 612.0], [1218.0, 2392.0], [1216.0, 2453.0], [1224.0, 2375.0], [1228.0, 2372.5], [1232.0, 1528.3333333333333], [1230.0, 2323.5], [1035.0, 2112.0], [1081.0, 1348.0], [1051.0, 2193.0], [1025.0, 985.5], [1055.0, 1783.0], [1053.0, 1818.0], [1039.0, 2218.0], [1037.0, 2128.0], [1033.0, 2605.0], [1031.0, 2418.0], [1029.0, 2702.0], [1027.0, 2722.0], [1075.0, 2406.0], [1073.0, 1687.0], [1041.0, 1181.0], [1043.0, 2342.0], [1045.0, 647.0], [1049.0, 1513.0], [1047.0, 1884.0], [1057.0, 2388.0], [1059.0, 2463.0], [1061.0, 1820.0], [1063.0, 1842.0], [1065.0, 2002.0], [1067.0, 2610.0], [1069.0, 2027.0], [1071.0, 1869.0], [1085.0, 2685.0], [1087.0, 2190.0], [1077.0, 2091.5], [1079.0, 2535.0], [1119.0, 2304.0], [1101.0, 1721.0], [1103.0, 2336.0], [1105.0, 1973.0], [1107.0, 2364.0], [1109.0, 2310.0], [1111.0, 2307.0], [1115.0, 1470.0], [1113.0, 2269.0], [1117.0, 3243.0], [1089.0, 2367.0], [1091.0, 1734.0], [1093.0, 2285.0], [1095.0, 2493.0], [1097.0, 2345.0], [1099.0, 2418.0], [1125.0, 1942.3333333333333], [1123.0, 2187.0], [1121.0, 2486.0], [1127.0, 2294.0], [1129.0, 2326.0], [1131.0, 2309.0], [1133.0, 2565.0], [1135.0, 2529.0], [1145.0, 2956.0], [1147.0, 2451.0], [1149.0, 3232.0], [1151.0, 2016.3333333333333], [1139.0, 2353.0], [1141.0, 2272.0], [1143.0, 2295.0], [1137.0, 3554.0], [1167.0, 2881.75], [1155.0, 4599.0], [1181.0, 2527.6666666666665], [1179.0, 2404.0], [1183.0, 2401.0], [1153.0, 3026.5], [1163.0, 2015.5], [1161.0, 2467.0], [1159.0, 2538.0], [1157.0, 2546.0], [1165.0, 1679.5], [1203.0, 2506.0], [1201.0, 2355.0], [1205.0, 3708.0], [1215.0, 2364.0], [1209.0, 2286.5], [1207.0, 2401.0], [1197.0, 2409.0], [1195.0, 2437.0], [1191.0, 2293.0], [1189.0, 2334.5], [1187.0, 2399.0], [1199.0, 2262.0], [1175.0, 1989.0], [1173.0, 2360.0], [1171.0, 3392.0], [1169.0, 2427.0], [1177.0, 3052.0], [1219.0, 2303.0], [1221.0, 2328.0], [1217.0, 2466.0], [1223.0, 2413.0], [1227.0, 2345.5], [1239.0, 2341.6666666666665], [1237.0, 2659.0], [1235.0, 2652.5], [1233.0, 2314.0], [1231.0, 2930.0], [1.0, 1740.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[802.4435264158809, 1185.634648103466]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1240.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 29305.816666666666, "minX": 1.54989516E12, "maxY": 357128.13333333336, "series": [{"data": [[1.54989528E12, 326471.6], [1.54989516E12, 103257.7], [1.54989522E12, 357128.13333333336]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54989528E12, 92655.65], [1.54989516E12, 29305.816666666666], [1.54989522E12, 101357.25]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989528E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 233.54207270570274, "minX": 1.54989516E12, "maxY": 1773.6035753531103, "series": [{"data": [[1.54989528E12, 1773.6035753531103], [1.54989516E12, 233.54207270570274], [1.54989522E12, 923.4255543305169]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989528E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 233.53741208372057, "minX": 1.54989516E12, "maxY": 1773.6025300849558, "series": [{"data": [[1.54989528E12, 1773.6025300849558], [1.54989516E12, 233.53741208372057], [1.54989522E12, 923.4242067867187]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989528E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.09560210706847959, "minX": 1.54989516E12, "maxY": 0.2192187102787905, "series": [{"data": [[1.54989528E12, 0.11988421645091282], [1.54989516E12, 0.2192187102787905], [1.54989522E12, 0.09560210706847959]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989528E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 9.0, "minX": 1.54989516E12, "maxY": 21329.0, "series": [{"data": [[1.54989528E12, 21329.0], [1.54989516E12, 2260.0], [1.54989522E12, 7179.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54989528E12, 10.0], [1.54989516E12, 9.0], [1.54989522E12, 12.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54989528E12, 3093.9000000000015], [1.54989516E12, 497.0], [1.54989522E12, 2266.9000000000015]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54989528E12, 6531.930000000011], [1.54989516E12, 1259.7799999999952], [1.54989522E12, 3786.9900000000016]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54989528E12, 3769.9500000000007], [1.54989516E12, 719.8999999999996], [1.54989522E12, 2741.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989528E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 157.0, "minX": 196.0, "maxY": 1944.0, "series": [{"data": [[621.0, 1944.0], [680.0, 1125.0], [196.0, 157.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 680.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 157.0, "minX": 196.0, "maxY": 1944.0, "series": [{"data": [[621.0, 1944.0], [680.0, 1125.0], [196.0, 157.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 680.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 200.81666666666666, "minX": 1.54989516E12, "maxY": 692.65, "series": [{"data": [[1.54989528E12, 605.3166666666667], [1.54989516E12, 200.81666666666666], [1.54989522E12, 692.65]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989528E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 196.68333333333334, "minX": 1.54989516E12, "maxY": 680.25, "series": [{"data": [[1.54989528E12, 621.85], [1.54989516E12, 196.68333333333334], [1.54989522E12, 680.25]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989528E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 196.68333333333334, "minX": 1.54989516E12, "maxY": 680.25, "series": [{"data": [[1.54989528E12, 621.85], [1.54989516E12, 196.68333333333334], [1.54989522E12, 680.25]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989528E12, "title": "Transactions Per Second"}},
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
