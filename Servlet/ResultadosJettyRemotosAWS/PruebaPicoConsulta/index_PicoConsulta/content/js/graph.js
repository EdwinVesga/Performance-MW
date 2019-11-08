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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 6127.0, "series": [{"data": [[0.0, 2.0], [0.1, 3.0], [0.2, 4.0], [0.3, 6.0], [0.4, 8.0], [0.5, 10.0], [0.6, 12.0], [0.7, 13.0], [0.8, 15.0], [0.9, 17.0], [1.0, 19.0], [1.1, 20.0], [1.2, 22.0], [1.3, 23.0], [1.4, 24.0], [1.5, 25.0], [1.6, 26.0], [1.7, 27.0], [1.8, 29.0], [1.9, 30.0], [2.0, 31.0], [2.1, 33.0], [2.2, 34.0], [2.3, 35.0], [2.4, 37.0], [2.5, 39.0], [2.6, 41.0], [2.7, 42.0], [2.8, 44.0], [2.9, 45.0], [3.0, 47.0], [3.1, 49.0], [3.2, 50.0], [3.3, 52.0], [3.4, 54.0], [3.5, 56.0], [3.6, 58.0], [3.7, 60.0], [3.8, 61.0], [3.9, 63.0], [4.0, 65.0], [4.1, 67.0], [4.2, 69.0], [4.3, 71.0], [4.4, 73.0], [4.5, 74.0], [4.6, 76.0], [4.7, 78.0], [4.8, 80.0], [4.9, 82.0], [5.0, 84.0], [5.1, 86.0], [5.2, 88.0], [5.3, 90.0], [5.4, 92.0], [5.5, 94.0], [5.6, 96.0], [5.7, 98.0], [5.8, 100.0], [5.9, 102.0], [6.0, 103.0], [6.1, 105.0], [6.2, 107.0], [6.3, 109.0], [6.4, 111.0], [6.5, 113.0], [6.6, 115.0], [6.7, 117.0], [6.8, 119.0], [6.9, 122.0], [7.0, 124.0], [7.1, 126.0], [7.2, 128.0], [7.3, 130.0], [7.4, 132.0], [7.5, 134.0], [7.6, 136.0], [7.7, 138.0], [7.8, 140.0], [7.9, 142.0], [8.0, 144.0], [8.1, 146.0], [8.2, 148.0], [8.3, 150.0], [8.4, 152.0], [8.5, 154.0], [8.6, 156.0], [8.7, 158.0], [8.8, 160.0], [8.9, 163.0], [9.0, 164.0], [9.1, 167.0], [9.2, 169.0], [9.3, 171.0], [9.4, 173.0], [9.5, 175.0], [9.6, 177.0], [9.7, 179.0], [9.8, 181.0], [9.9, 183.0], [10.0, 186.0], [10.1, 188.0], [10.2, 190.0], [10.3, 193.0], [10.4, 195.0], [10.5, 197.0], [10.6, 199.0], [10.7, 201.0], [10.8, 204.0], [10.9, 206.0], [11.0, 208.0], [11.1, 211.0], [11.2, 213.0], [11.3, 215.0], [11.4, 217.0], [11.5, 220.0], [11.6, 222.0], [11.7, 224.0], [11.8, 227.0], [11.9, 229.0], [12.0, 232.0], [12.1, 235.0], [12.2, 238.0], [12.3, 240.0], [12.4, 242.0], [12.5, 245.0], [12.6, 248.0], [12.7, 250.0], [12.8, 253.0], [12.9, 256.0], [13.0, 258.0], [13.1, 261.0], [13.2, 263.0], [13.3, 266.0], [13.4, 269.0], [13.5, 272.0], [13.6, 275.0], [13.7, 277.0], [13.8, 280.0], [13.9, 282.0], [14.0, 285.0], [14.1, 287.0], [14.2, 290.0], [14.3, 293.0], [14.4, 296.0], [14.5, 299.0], [14.6, 301.0], [14.7, 304.0], [14.8, 306.0], [14.9, 309.0], [15.0, 311.0], [15.1, 314.0], [15.2, 316.0], [15.3, 319.0], [15.4, 322.0], [15.5, 324.0], [15.6, 327.0], [15.7, 329.0], [15.8, 332.0], [15.9, 334.0], [16.0, 337.0], [16.1, 340.0], [16.2, 342.0], [16.3, 345.0], [16.4, 347.0], [16.5, 350.0], [16.6, 352.0], [16.7, 355.0], [16.8, 357.0], [16.9, 359.0], [17.0, 362.0], [17.1, 364.0], [17.2, 366.0], [17.3, 368.0], [17.4, 371.0], [17.5, 373.0], [17.6, 375.0], [17.7, 377.0], [17.8, 380.0], [17.9, 381.0], [18.0, 384.0], [18.1, 386.0], [18.2, 388.0], [18.3, 390.0], [18.4, 391.0], [18.5, 393.0], [18.6, 396.0], [18.7, 398.0], [18.8, 400.0], [18.9, 402.0], [19.0, 403.0], [19.1, 405.0], [19.2, 407.0], [19.3, 409.0], [19.4, 411.0], [19.5, 412.0], [19.6, 415.0], [19.7, 416.0], [19.8, 418.0], [19.9, 420.0], [20.0, 422.0], [20.1, 424.0], [20.2, 425.0], [20.3, 427.0], [20.4, 429.0], [20.5, 430.0], [20.6, 432.0], [20.7, 434.0], [20.8, 436.0], [20.9, 438.0], [21.0, 440.0], [21.1, 441.0], [21.2, 443.0], [21.3, 445.0], [21.4, 447.0], [21.5, 448.0], [21.6, 450.0], [21.7, 452.0], [21.8, 454.0], [21.9, 455.0], [22.0, 457.0], [22.1, 459.0], [22.2, 461.0], [22.3, 462.0], [22.4, 464.0], [22.5, 466.0], [22.6, 467.0], [22.7, 469.0], [22.8, 471.0], [22.9, 472.0], [23.0, 474.0], [23.1, 476.0], [23.2, 478.0], [23.3, 480.0], [23.4, 482.0], [23.5, 484.0], [23.6, 485.0], [23.7, 487.0], [23.8, 489.0], [23.9, 491.0], [24.0, 493.0], [24.1, 495.0], [24.2, 496.0], [24.3, 498.0], [24.4, 500.0], [24.5, 502.0], [24.6, 504.0], [24.7, 506.0], [24.8, 508.0], [24.9, 510.0], [25.0, 512.0], [25.1, 515.0], [25.2, 517.0], [25.3, 519.0], [25.4, 521.0], [25.5, 524.0], [25.6, 526.0], [25.7, 528.0], [25.8, 531.0], [25.9, 533.0], [26.0, 536.0], [26.1, 538.0], [26.2, 540.0], [26.3, 543.0], [26.4, 545.0], [26.5, 548.0], [26.6, 551.0], [26.7, 553.0], [26.8, 556.0], [26.9, 559.0], [27.0, 562.0], [27.1, 565.0], [27.2, 568.0], [27.3, 571.0], [27.4, 574.0], [27.5, 577.0], [27.6, 580.0], [27.7, 582.0], [27.8, 585.0], [27.9, 588.0], [28.0, 591.0], [28.1, 594.0], [28.2, 597.0], [28.3, 601.0], [28.4, 603.0], [28.5, 606.0], [28.6, 609.0], [28.7, 612.0], [28.8, 615.0], [28.9, 618.0], [29.0, 621.0], [29.1, 625.0], [29.2, 628.0], [29.3, 631.0], [29.4, 634.0], [29.5, 638.0], [29.6, 641.0], [29.7, 645.0], [29.8, 648.0], [29.9, 652.0], [30.0, 655.0], [30.1, 659.0], [30.2, 662.0], [30.3, 665.0], [30.4, 669.0], [30.5, 672.0], [30.6, 675.0], [30.7, 678.0], [30.8, 681.0], [30.9, 684.0], [31.0, 688.0], [31.1, 691.0], [31.2, 694.0], [31.3, 697.0], [31.4, 700.0], [31.5, 703.0], [31.6, 706.0], [31.7, 710.0], [31.8, 713.0], [31.9, 717.0], [32.0, 720.0], [32.1, 722.0], [32.2, 726.0], [32.3, 729.0], [32.4, 732.0], [32.5, 735.0], [32.6, 739.0], [32.7, 741.0], [32.8, 744.0], [32.9, 747.0], [33.0, 750.0], [33.1, 754.0], [33.2, 757.0], [33.3, 759.0], [33.4, 762.0], [33.5, 765.0], [33.6, 768.0], [33.7, 771.0], [33.8, 774.0], [33.9, 777.0], [34.0, 779.0], [34.1, 782.0], [34.2, 784.0], [34.3, 787.0], [34.4, 790.0], [34.5, 792.0], [34.6, 795.0], [34.7, 797.0], [34.8, 800.0], [34.9, 803.0], [35.0, 805.0], [35.1, 808.0], [35.2, 811.0], [35.3, 814.0], [35.4, 817.0], [35.5, 819.0], [35.6, 822.0], [35.7, 825.0], [35.8, 827.0], [35.9, 830.0], [36.0, 832.0], [36.1, 835.0], [36.2, 838.0], [36.3, 841.0], [36.4, 843.0], [36.5, 845.0], [36.6, 848.0], [36.7, 850.0], [36.8, 853.0], [36.9, 856.0], [37.0, 859.0], [37.1, 862.0], [37.2, 864.0], [37.3, 867.0], [37.4, 870.0], [37.5, 872.0], [37.6, 875.0], [37.7, 877.0], [37.8, 880.0], [37.9, 883.0], [38.0, 886.0], [38.1, 889.0], [38.2, 892.0], [38.3, 894.0], [38.4, 897.0], [38.5, 900.0], [38.6, 903.0], [38.7, 906.0], [38.8, 909.0], [38.9, 912.0], [39.0, 915.0], [39.1, 919.0], [39.2, 922.0], [39.3, 925.0], [39.4, 928.0], [39.5, 931.0], [39.6, 934.0], [39.7, 938.0], [39.8, 941.0], [39.9, 944.0], [40.0, 947.0], [40.1, 950.0], [40.2, 953.0], [40.3, 956.0], [40.4, 960.0], [40.5, 963.0], [40.6, 967.0], [40.7, 970.0], [40.8, 973.0], [40.9, 977.0], [41.0, 980.0], [41.1, 983.0], [41.2, 987.0], [41.3, 990.0], [41.4, 993.0], [41.5, 997.0], [41.6, 1000.0], [41.7, 1004.0], [41.8, 1007.0], [41.9, 1010.0], [42.0, 1013.0], [42.1, 1017.0], [42.2, 1020.0], [42.3, 1024.0], [42.4, 1027.0], [42.5, 1031.0], [42.6, 1034.0], [42.7, 1037.0], [42.8, 1040.0], [42.9, 1044.0], [43.0, 1047.0], [43.1, 1050.0], [43.2, 1054.0], [43.3, 1057.0], [43.4, 1060.0], [43.5, 1063.0], [43.6, 1067.0], [43.7, 1070.0], [43.8, 1074.0], [43.9, 1077.0], [44.0, 1080.0], [44.1, 1084.0], [44.2, 1087.0], [44.3, 1090.0], [44.4, 1094.0], [44.5, 1097.0], [44.6, 1101.0], [44.7, 1104.0], [44.8, 1108.0], [44.9, 1111.0], [45.0, 1115.0], [45.1, 1118.0], [45.2, 1122.0], [45.3, 1125.0], [45.4, 1127.0], [45.5, 1131.0], [45.6, 1134.0], [45.7, 1137.0], [45.8, 1140.0], [45.9, 1143.0], [46.0, 1146.0], [46.1, 1150.0], [46.2, 1153.0], [46.3, 1156.0], [46.4, 1159.0], [46.5, 1162.0], [46.6, 1165.0], [46.7, 1168.0], [46.8, 1171.0], [46.9, 1174.0], [47.0, 1177.0], [47.1, 1180.0], [47.2, 1183.0], [47.3, 1186.0], [47.4, 1189.0], [47.5, 1192.0], [47.6, 1196.0], [47.7, 1199.0], [47.8, 1202.0], [47.9, 1205.0], [48.0, 1208.0], [48.1, 1211.0], [48.2, 1214.0], [48.3, 1216.0], [48.4, 1220.0], [48.5, 1222.0], [48.6, 1225.0], [48.7, 1228.0], [48.8, 1231.0], [48.9, 1234.0], [49.0, 1237.0], [49.1, 1240.0], [49.2, 1243.0], [49.3, 1246.0], [49.4, 1249.0], [49.5, 1252.0], [49.6, 1255.0], [49.7, 1258.0], [49.8, 1261.0], [49.9, 1264.0], [50.0, 1267.0], [50.1, 1270.0], [50.2, 1273.0], [50.3, 1276.0], [50.4, 1279.0], [50.5, 1282.0], [50.6, 1285.0], [50.7, 1287.0], [50.8, 1290.0], [50.9, 1292.0], [51.0, 1295.0], [51.1, 1298.0], [51.2, 1301.0], [51.3, 1304.0], [51.4, 1307.0], [51.5, 1310.0], [51.6, 1313.0], [51.7, 1316.0], [51.8, 1318.0], [51.9, 1321.0], [52.0, 1324.0], [52.1, 1327.0], [52.2, 1329.0], [52.3, 1333.0], [52.4, 1335.0], [52.5, 1338.0], [52.6, 1341.0], [52.7, 1343.0], [52.8, 1346.0], [52.9, 1348.0], [53.0, 1351.0], [53.1, 1353.0], [53.2, 1356.0], [53.3, 1358.0], [53.4, 1361.0], [53.5, 1364.0], [53.6, 1367.0], [53.7, 1370.0], [53.8, 1372.0], [53.9, 1375.0], [54.0, 1378.0], [54.1, 1381.0], [54.2, 1384.0], [54.3, 1387.0], [54.4, 1390.0], [54.5, 1392.0], [54.6, 1395.0], [54.7, 1397.0], [54.8, 1400.0], [54.9, 1402.0], [55.0, 1405.0], [55.1, 1407.0], [55.2, 1410.0], [55.3, 1413.0], [55.4, 1416.0], [55.5, 1419.0], [55.6, 1422.0], [55.7, 1425.0], [55.8, 1427.0], [55.9, 1430.0], [56.0, 1433.0], [56.1, 1436.0], [56.2, 1439.0], [56.3, 1441.0], [56.4, 1444.0], [56.5, 1447.0], [56.6, 1449.0], [56.7, 1452.0], [56.8, 1455.0], [56.9, 1457.0], [57.0, 1460.0], [57.1, 1462.0], [57.2, 1465.0], [57.3, 1468.0], [57.4, 1470.0], [57.5, 1473.0], [57.6, 1476.0], [57.7, 1478.0], [57.8, 1481.0], [57.9, 1484.0], [58.0, 1487.0], [58.1, 1490.0], [58.2, 1492.0], [58.3, 1495.0], [58.4, 1498.0], [58.5, 1501.0], [58.6, 1504.0], [58.7, 1507.0], [58.8, 1509.0], [58.9, 1512.0], [59.0, 1514.0], [59.1, 1517.0], [59.2, 1520.0], [59.3, 1522.0], [59.4, 1525.0], [59.5, 1528.0], [59.6, 1530.0], [59.7, 1533.0], [59.8, 1535.0], [59.9, 1538.0], [60.0, 1540.0], [60.1, 1543.0], [60.2, 1545.0], [60.3, 1547.0], [60.4, 1550.0], [60.5, 1552.0], [60.6, 1554.0], [60.7, 1556.0], [60.8, 1559.0], [60.9, 1561.0], [61.0, 1564.0], [61.1, 1566.0], [61.2, 1569.0], [61.3, 1571.0], [61.4, 1573.0], [61.5, 1576.0], [61.6, 1579.0], [61.7, 1581.0], [61.8, 1583.0], [61.9, 1585.0], [62.0, 1588.0], [62.1, 1590.0], [62.2, 1592.0], [62.3, 1594.0], [62.4, 1597.0], [62.5, 1599.0], [62.6, 1601.0], [62.7, 1604.0], [62.8, 1606.0], [62.9, 1608.0], [63.0, 1610.0], [63.1, 1613.0], [63.2, 1615.0], [63.3, 1617.0], [63.4, 1620.0], [63.5, 1622.0], [63.6, 1624.0], [63.7, 1626.0], [63.8, 1629.0], [63.9, 1632.0], [64.0, 1634.0], [64.1, 1636.0], [64.2, 1639.0], [64.3, 1641.0], [64.4, 1643.0], [64.5, 1646.0], [64.6, 1648.0], [64.7, 1650.0], [64.8, 1653.0], [64.9, 1655.0], [65.0, 1658.0], [65.1, 1660.0], [65.2, 1663.0], [65.3, 1665.0], [65.4, 1668.0], [65.5, 1670.0], [65.6, 1672.0], [65.7, 1674.0], [65.8, 1677.0], [65.9, 1680.0], [66.0, 1682.0], [66.1, 1685.0], [66.2, 1687.0], [66.3, 1690.0], [66.4, 1692.0], [66.5, 1695.0], [66.6, 1698.0], [66.7, 1700.0], [66.8, 1702.0], [66.9, 1705.0], [67.0, 1707.0], [67.1, 1710.0], [67.2, 1712.0], [67.3, 1715.0], [67.4, 1718.0], [67.5, 1720.0], [67.6, 1723.0], [67.7, 1726.0], [67.8, 1728.0], [67.9, 1731.0], [68.0, 1733.0], [68.1, 1736.0], [68.2, 1739.0], [68.3, 1741.0], [68.4, 1744.0], [68.5, 1746.0], [68.6, 1749.0], [68.7, 1751.0], [68.8, 1753.0], [68.9, 1756.0], [69.0, 1758.0], [69.1, 1761.0], [69.2, 1763.0], [69.3, 1766.0], [69.4, 1768.0], [69.5, 1771.0], [69.6, 1773.0], [69.7, 1776.0], [69.8, 1778.0], [69.9, 1781.0], [70.0, 1784.0], [70.1, 1786.0], [70.2, 1789.0], [70.3, 1791.0], [70.4, 1794.0], [70.5, 1797.0], [70.6, 1799.0], [70.7, 1801.0], [70.8, 1804.0], [70.9, 1806.0], [71.0, 1808.0], [71.1, 1811.0], [71.2, 1814.0], [71.3, 1816.0], [71.4, 1819.0], [71.5, 1821.0], [71.6, 1824.0], [71.7, 1826.0], [71.8, 1829.0], [71.9, 1832.0], [72.0, 1834.0], [72.1, 1837.0], [72.2, 1839.0], [72.3, 1842.0], [72.4, 1845.0], [72.5, 1847.0], [72.6, 1850.0], [72.7, 1852.0], [72.8, 1855.0], [72.9, 1857.0], [73.0, 1859.0], [73.1, 1862.0], [73.2, 1865.0], [73.3, 1868.0], [73.4, 1871.0], [73.5, 1874.0], [73.6, 1876.0], [73.7, 1879.0], [73.8, 1881.0], [73.9, 1884.0], [74.0, 1886.0], [74.1, 1889.0], [74.2, 1892.0], [74.3, 1894.0], [74.4, 1897.0], [74.5, 1900.0], [74.6, 1902.0], [74.7, 1905.0], [74.8, 1908.0], [74.9, 1910.0], [75.0, 1913.0], [75.1, 1917.0], [75.2, 1919.0], [75.3, 1922.0], [75.4, 1924.0], [75.5, 1926.0], [75.6, 1929.0], [75.7, 1931.0], [75.8, 1934.0], [75.9, 1936.0], [76.0, 1939.0], [76.1, 1942.0], [76.2, 1944.0], [76.3, 1947.0], [76.4, 1949.0], [76.5, 1952.0], [76.6, 1955.0], [76.7, 1957.0], [76.8, 1960.0], [76.9, 1963.0], [77.0, 1965.0], [77.1, 1968.0], [77.2, 1971.0], [77.3, 1973.0], [77.4, 1976.0], [77.5, 1978.0], [77.6, 1981.0], [77.7, 1983.0], [77.8, 1986.0], [77.9, 1989.0], [78.0, 1992.0], [78.1, 1995.0], [78.2, 1998.0], [78.3, 2000.0], [78.4, 2003.0], [78.5, 2006.0], [78.6, 2009.0], [78.7, 2012.0], [78.8, 2015.0], [78.9, 2017.0], [79.0, 2020.0], [79.1, 2023.0], [79.2, 2025.0], [79.3, 2028.0], [79.4, 2031.0], [79.5, 2034.0], [79.6, 2037.0], [79.7, 2040.0], [79.8, 2043.0], [79.9, 2046.0], [80.0, 2048.0], [80.1, 2051.0], [80.2, 2054.0], [80.3, 2057.0], [80.4, 2060.0], [80.5, 2063.0], [80.6, 2067.0], [80.7, 2070.0], [80.8, 2073.0], [80.9, 2076.0], [81.0, 2079.0], [81.1, 2082.0], [81.2, 2085.0], [81.3, 2089.0], [81.4, 2092.0], [81.5, 2095.0], [81.6, 2099.0], [81.7, 2102.0], [81.8, 2105.0], [81.9, 2108.0], [82.0, 2111.0], [82.1, 2114.0], [82.2, 2117.0], [82.3, 2120.0], [82.4, 2124.0], [82.5, 2127.0], [82.6, 2131.0], [82.7, 2135.0], [82.8, 2138.0], [82.9, 2141.0], [83.0, 2145.0], [83.1, 2148.0], [83.2, 2151.0], [83.3, 2154.0], [83.4, 2157.0], [83.5, 2160.0], [83.6, 2164.0], [83.7, 2167.0], [83.8, 2170.0], [83.9, 2174.0], [84.0, 2178.0], [84.1, 2181.0], [84.2, 2184.0], [84.3, 2187.0], [84.4, 2191.0], [84.5, 2194.0], [84.6, 2198.0], [84.7, 2202.0], [84.8, 2205.0], [84.9, 2209.0], [85.0, 2212.0], [85.1, 2215.0], [85.2, 2219.0], [85.3, 2223.0], [85.4, 2225.0], [85.5, 2229.0], [85.6, 2232.0], [85.7, 2236.0], [85.8, 2239.0], [85.9, 2243.0], [86.0, 2246.0], [86.1, 2250.0], [86.2, 2254.0], [86.3, 2258.0], [86.4, 2262.0], [86.5, 2266.0], [86.6, 2270.0], [86.7, 2274.0], [86.8, 2278.0], [86.9, 2282.0], [87.0, 2285.0], [87.1, 2289.0], [87.2, 2292.0], [87.3, 2296.0], [87.4, 2300.0], [87.5, 2304.0], [87.6, 2308.0], [87.7, 2312.0], [87.8, 2316.0], [87.9, 2320.0], [88.0, 2324.0], [88.1, 2327.0], [88.2, 2331.0], [88.3, 2336.0], [88.4, 2340.0], [88.5, 2343.0], [88.6, 2348.0], [88.7, 2351.0], [88.8, 2356.0], [88.9, 2360.0], [89.0, 2364.0], [89.1, 2368.0], [89.2, 2372.0], [89.3, 2376.0], [89.4, 2381.0], [89.5, 2385.0], [89.6, 2390.0], [89.7, 2395.0], [89.8, 2400.0], [89.9, 2404.0], [90.0, 2409.0], [90.1, 2413.0], [90.2, 2417.0], [90.3, 2421.0], [90.4, 2426.0], [90.5, 2430.0], [90.6, 2435.0], [90.7, 2440.0], [90.8, 2445.0], [90.9, 2450.0], [91.0, 2455.0], [91.1, 2460.0], [91.2, 2465.0], [91.3, 2470.0], [91.4, 2476.0], [91.5, 2481.0], [91.6, 2486.0], [91.7, 2491.0], [91.8, 2496.0], [91.9, 2501.0], [92.0, 2506.0], [92.1, 2512.0], [92.2, 2517.0], [92.3, 2523.0], [92.4, 2529.0], [92.5, 2535.0], [92.6, 2541.0], [92.7, 2547.0], [92.8, 2552.0], [92.9, 2559.0], [93.0, 2565.0], [93.1, 2572.0], [93.2, 2577.0], [93.3, 2583.0], [93.4, 2589.0], [93.5, 2596.0], [93.6, 2602.0], [93.7, 2609.0], [93.8, 2616.0], [93.9, 2622.0], [94.0, 2630.0], [94.1, 2636.0], [94.2, 2643.0], [94.3, 2650.0], [94.4, 2657.0], [94.5, 2664.0], [94.6, 2671.0], [94.7, 2678.0], [94.8, 2684.0], [94.9, 2692.0], [95.0, 2700.0], [95.1, 2708.0], [95.2, 2715.0], [95.3, 2725.0], [95.4, 2734.0], [95.5, 2742.0], [95.6, 2750.0], [95.7, 2759.0], [95.8, 2769.0], [95.9, 2779.0], [96.0, 2788.0], [96.1, 2798.0], [96.2, 2811.0], [96.3, 2823.0], [96.4, 2834.0], [96.5, 2846.0], [96.6, 2858.0], [96.7, 2870.0], [96.8, 2883.0], [96.9, 2897.0], [97.0, 2908.0], [97.1, 2921.0], [97.2, 2936.0], [97.3, 2948.0], [97.4, 2963.0], [97.5, 2981.0], [97.6, 2998.0], [97.7, 3013.0], [97.8, 3032.0], [97.9, 3051.0], [98.0, 3069.0], [98.1, 3086.0], [98.2, 3112.0], [98.3, 3133.0], [98.4, 3158.0], [98.5, 3184.0], [98.6, 3209.0], [98.7, 3239.0], [98.8, 3267.0], [98.9, 3299.0], [99.0, 3340.0], [99.1, 3383.0], [99.2, 3426.0], [99.3, 3476.0], [99.4, 3528.0], [99.5, 3583.0], [99.6, 3678.0], [99.7, 3780.0], [99.8, 3932.0], [99.9, 4227.0], [100.0, 6127.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 8774.0, "series": [{"data": [[0.0, 8774.0], [600.0, 4704.0], [700.0, 5161.0], [800.0, 5607.0], [900.0, 4719.0], [1000.0, 4521.0], [1100.0, 4807.0], [1200.0, 5178.0], [1300.0, 5516.0], [1400.0, 5573.0], [1500.0, 6161.0], [1600.0, 6316.0], [1700.0, 5991.0], [1800.0, 5871.0], [1900.0, 5734.0], [2000.0, 5076.0], [2100.0, 4579.0], [2300.0, 3662.0], [2200.0, 4145.0], [2400.0, 3150.0], [2500.0, 2565.0], [2600.0, 2186.0], [2800.0, 1230.0], [2700.0, 1692.0], [2900.0, 1040.0], [3000.0, 826.0], [3100.0, 623.0], [3300.0, 355.0], [3200.0, 512.0], [3400.0, 313.0], [3500.0, 271.0], [3700.0, 132.0], [3600.0, 156.0], [3800.0, 109.0], [3900.0, 64.0], [4000.0, 53.0], [4200.0, 35.0], [4300.0, 27.0], [4100.0, 51.0], [4400.0, 23.0], [4500.0, 15.0], [4600.0, 8.0], [4800.0, 10.0], [4700.0, 7.0], [5000.0, 6.0], [4900.0, 9.0], [5100.0, 5.0], [5200.0, 5.0], [5300.0, 2.0], [5600.0, 5.0], [5400.0, 1.0], [5800.0, 1.0], [6100.0, 1.0], [5900.0, 1.0], [100.0, 7336.0], [200.0, 5934.0], [300.0, 6466.0], [400.0, 8443.0], [500.0, 5938.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 6100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 3180.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 62891.0, "series": [{"data": [[1.0, 51261.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 3180.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 34369.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 62891.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 181.78605089538217, "minX": 1.54979004E12, "maxY": 1166.098071339698, "series": [{"data": [[1.54979004E12, 773.95311994827], [1.54979016E12, 181.78605089538217], [1.54979034E12, 827.8737408774342], [1.5497904E12, 1106.7524274237217], [1.5497901E12, 1166.098071339698]], "isOverall": false, "label": "jp@gc - Ultimate Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5497904E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 6.125, "minX": 1.0, "maxY": 1851.0, "series": [{"data": [[2.0, 6.2857142857142865], [3.0, 7.642857142857143], [4.0, 7.137931034482758], [5.0, 8.25], [6.0, 9.206896551724142], [7.0, 10.448275862068964], [8.0, 10.580645161290322], [9.0, 11.535714285714285], [10.0, 14.083333333333332], [11.0, 13.870967741935482], [12.0, 16.029411764705884], [13.0, 17.499999999999996], [14.0, 18.48275862068965], [15.0, 18.515151515151516], [16.0, 18.13888888888889], [17.0, 22.5952380952381], [18.0, 22.833333333333325], [19.0, 28.80952380952381], [20.0, 26.46666666666667], [21.0, 24.571428571428566], [22.0, 30.558823529411764], [23.0, 30.404255319148938], [24.0, 33.50000000000001], [25.0, 30.80645161290324], [26.0, 32.25714285714286], [27.0, 35.370370370370374], [28.0, 38.31428571428572], [29.0, 32.67567567567567], [30.0, 42.41666666666667], [31.0, 46.0232558139535], [33.0, 44.95833333333333], [32.0, 44.89743589743589], [35.0, 50.0], [34.0, 41.03571428571429], [37.0, 43.24999999999999], [36.0, 45.296296296296305], [39.0, 286.8405797101449], [38.0, 48.87096774193548], [40.0, 50.6578947368421], [41.0, 56.73333333333333], [42.0, 59.483870967741915], [43.0, 68.4047619047619], [44.0, 66.3030303030303], [45.0, 60.42424242424242], [46.0, 66.54054054054053], [47.0, 62.88095238095237], [48.0, 69.59459459459461], [49.0, 69.525], [50.0, 82.33928571428571], [51.0, 88.15909090909089], [52.0, 98.32608695652175], [53.0, 83.94871794871797], [54.0, 84.19444444444443], [55.0, 106.92727272727271], [56.0, 82.28301886792453], [57.0, 89.02777777777779], [58.0, 93.24999999999999], [59.0, 88.45833333333331], [60.0, 77.99999999999996], [61.0, 88.5777777777778], [62.0, 84.36507936507935], [63.0, 90.30555555555556], [64.0, 84.31578947368422], [65.0, 92.54761904761905], [66.0, 84.61702127659574], [67.0, 104.29545454545453], [68.0, 101.925], [69.0, 90.16981132075469], [70.0, 109.60975609756098], [71.0, 113.61904761904762], [72.0, 129.58974358974356], [73.0, 116.51162790697674], [74.0, 99.6923076923077], [75.0, 99.88095238095238], [76.0, 101.5454545454545], [77.0, 109.41509433962266], [78.0, 101.8974358974359], [79.0, 115.20754716981135], [80.0, 122.62790697674419], [81.0, 127.20930232558138], [82.0, 119.93333333333334], [83.0, 124.86956521739128], [84.0, 122.1707317073171], [85.0, 124.91489361702126], [86.0, 114.74285714285715], [87.0, 110.9148936170213], [88.0, 119.54385964912278], [89.0, 107.83050847457625], [90.0, 119.0625], [91.0, 140.59375], [92.0, 122.38961038961037], [93.0, 123.01960784313728], [94.0, 132.59090909090907], [95.0, 120.89130434782606], [96.0, 111.23809523809523], [97.0, 113.52830188679243], [98.0, 121.70833333333336], [99.0, 124.23809523809521], [100.0, 110.08433734939761], [101.0, 124.41463414634144], [102.0, 153.48648648648648], [103.0, 134.53061224489795], [104.0, 135.60526315789474], [105.0, 143.49999999999997], [106.0, 133.7678571428571], [107.0, 143.30555555555551], [108.0, 167.36842105263162], [109.0, 182.55555555555554], [110.0, 156.2075471698113], [111.0, 169.11842105263165], [112.0, 149.91025641025638], [113.0, 163.54285714285717], [114.0, 161.64285714285714], [115.0, 149.03389830508473], [116.0, 141.00000000000003], [117.0, 170.1818181818182], [118.0, 170.85454545454544], [119.0, 168.84444444444443], [120.0, 151.26086956521735], [121.0, 192.88888888888889], [122.0, 169.92063492063488], [123.0, 187.61363636363637], [124.0, 217.88372093023253], [125.0, 195.72], [126.0, 156.21621621621625], [127.0, 208.6595744680851], [128.0, 200.13157894736838], [129.0, 207.0277777777778], [130.0, 179.81818181818178], [131.0, 175.18965517241378], [132.0, 208.0408163265306], [133.0, 161.55769230769232], [134.0, 180.9534883720931], [135.0, 183.83333333333331], [136.0, 214.74999999999997], [137.0, 230.16000000000003], [138.0, 186.91176470588232], [139.0, 241.33333333333337], [140.0, 193.6393442622951], [141.0, 230.71698113207552], [142.0, 204.7837837837838], [143.0, 238.73170731707313], [144.0, 245.14000000000001], [145.0, 263.32692307692304], [146.0, 198.0], [147.0, 263.6274509803922], [148.0, 186.59999999999997], [149.0, 223.3125], [150.0, 209.12500000000003], [151.0, 220.73913043478254], [152.0, 263.55555555555554], [153.0, 226.1707317073171], [154.0, 278.1], [155.0, 209.23684210526318], [156.0, 199.23404255319147], [157.0, 276.20512820512835], [158.0, 277.48275862068965], [159.0, 239.86486486486484], [160.0, 252.97435897435892], [161.0, 235.25], [162.0, 237.89583333333334], [163.0, 245.61111111111103], [164.0, 248.05000000000004], [165.0, 182.22222222222229], [166.0, 194.9636363636364], [167.0, 220.08888888888885], [168.0, 286.3469387755102], [169.0, 303.10344827586215], [170.0, 268.94444444444446], [171.0, 274.77272727272737], [172.0, 314.79999999999995], [173.0, 291.41176470588226], [174.0, 285.17647058823525], [175.0, 286.0754716981131], [176.0, 334.0869565217391], [177.0, 282.46153846153845], [178.0, 373.6666666666667], [179.0, 281.18181818181813], [181.0, 393.0], [183.0, 455.2608695652174], [182.0, 304.2857142857143], [180.0, 279.7916666666667], [184.0, 416.50000000000006], [185.0, 321.14285714285717], [186.0, 396.2195121951219], [187.0, 342.5555555555556], [188.0, 343.96969696969705], [189.0, 339.85294117647055], [190.0, 370.77358490566024], [191.0, 371.686274509804], [192.0, 345.6538461538462], [193.0, 334.09523809523813], [194.0, 417.2676056338029], [195.0, 443.56521739130443], [196.0, 398.8125], [197.0, 329.25925925925924], [198.0, 335.53846153846155], [199.0, 364.8888888888889], [200.0, 333.44897959183686], [201.0, 338.41935483870975], [202.0, 308.13636363636357], [203.0, 343.02631578947364], [204.0, 327.4393939393939], [205.0, 263.66666666666663], [206.0, 288.2600000000001], [207.0, 269.24999999999983], [208.0, 243.48979591836738], [209.0, 188.1111111111111], [210.0, 298.87499999999994], [211.0, 283.8611111111111], [212.0, 237.77551020408177], [213.0, 323.43999999999994], [214.0, 270.9999999999999], [215.0, 344.90476190476204], [216.0, 285.04878048780483], [217.0, 273.1014492753622], [218.0, 292.73529411764713], [219.0, 310.14583333333326], [220.0, 300.55813953488376], [221.0, 404.97777777777776], [222.0, 367.4545454545455], [223.0, 378.01724137931035], [224.0, 322.06122448979596], [225.0, 371.3636363636365], [226.0, 321.90625], [227.0, 331.07812499999994], [228.0, 290.73770491803293], [229.0, 315.35], [230.0, 346.375], [231.0, 374.32608695652186], [232.0, 336.43243243243245], [233.0, 323.7333333333333], [234.0, 319.0869565217392], [235.0, 323.27586206896547], [236.0, 373.64516129032256], [237.0, 338.86206896551715], [238.0, 222.32000000000005], [239.0, 255.99999999999994], [240.0, 286.3452380952381], [241.0, 359.25714285714287], [242.0, 313.8607594936709], [243.0, 358.2075471698112], [244.0, 282.9375], [245.0, 273.2045454545454], [246.0, 333.19607843137254], [247.0, 286.65], [248.0, 280.1282051282051], [249.0, 300.13461538461536], [250.0, 331.59999999999997], [251.0, 318.68085106382983], [252.0, 332.85714285714283], [253.0, 365.44186046511635], [254.0, 318.0149253731343], [255.0, 299.1818181818182], [257.0, 386.0408163265307], [256.0, 411.7868852459017], [258.0, 281.8243243243243], [259.0, 365.3103448275863], [260.0, 355.5909090909092], [261.0, 298.8202247191011], [262.0, 370.734693877551], [263.0, 261.0392156862745], [264.0, 317.73214285714266], [265.0, 224.64], [267.0, 340.5], [266.0, 315.54285714285714], [271.0, 414.0810810810811], [270.0, 442.0], [269.0, 326.32500000000005], [268.0, 279.42424242424244], [285.0, 467.3833333333333], [278.0, 407.86274509803934], [277.0, 296.96774193548384], [276.0, 339.22580645161287], [279.0, 421.82051282051265], [280.0, 442.3023255813954], [283.0, 490.21951219512187], [284.0, 546.05], [275.0, 660.6], [274.0, 282.64285714285705], [273.0, 319.7307692307692], [272.0, 364.99999999999994], [286.0, 458.2931034482756], [287.0, 518.0317460317461], [282.0, 355.2352941176471], [281.0, 245.23529411764707], [289.0, 493.61702127659566], [288.0, 549.7358490566036], [290.0, 467.53571428571433], [291.0, 473.62500000000006], [292.0, 485.5000000000001], [293.0, 434.06896551724134], [294.0, 325.94444444444446], [295.0, 408.8421052631579], [296.0, 365.1000000000001], [302.0, 438.7540983606558], [303.0, 464.8541666666666], [300.0, 435.6363636363637], [301.0, 400.73809523809524], [297.0, 325.07692307692304], [298.0, 379.6507936507937], [299.0, 424.5945945945945], [305.0, 369.56060606060606], [304.0, 405.51282051282044], [306.0, 404.4651162790697], [307.0, 411.4776119402986], [308.0, 352.4761904761904], [309.0, 418.1363636363637], [310.0, 394.0], [311.0, 391.29268292682934], [312.0, 328.2045454545453], [318.0, 412.5666666666668], [319.0, 457.6060606060606], [316.0, 389.6585365853659], [317.0, 501.8936170212767], [313.0, 373.6216216216216], [314.0, 434.5499999999999], [315.0, 409.5405405405405], [321.0, 469.96296296296293], [320.0, 378.05882352941177], [322.0, 429.8181818181818], [323.0, 477.42105263157896], [324.0, 397.54716981132077], [325.0, 374.08771929824553], [326.0, 442.87499999999994], [327.0, 337.1860465116279], [328.0, 516.0967741935483], [334.0, 507.90740740740716], [335.0, 449.50000000000006], [332.0, 404.5238095238095], [333.0, 515.0750000000002], [329.0, 409.06060606060606], [330.0, 452.2500000000001], [331.0, 438.0681818181818], [337.0, 491.3921568627451], [336.0, 502.3809523809524], [338.0, 500.79999999999995], [339.0, 487.9464285714286], [340.0, 580.6833333333333], [341.0, 522.94], [342.0, 543.9027777777779], [343.0, 517.8541666666666], [344.0, 423.01785714285717], [350.0, 595.4], [351.0, 577.6976744186046], [348.0, 420.97727272727263], [349.0, 514.8749999999999], [345.0, 380.09259259259255], [346.0, 497.1636363636365], [347.0, 517.5416666666666], [353.0, 578.0], [352.0, 479.7755102040817], [354.0, 431.8305084745763], [355.0, 550.8461538461539], [356.0, 434.93617021276583], [357.0, 426.91071428571433], [358.0, 436.45238095238096], [359.0, 445.74509803921563], [360.0, 618.7837837837837], [366.0, 431.49019607843127], [367.0, 479.2272727272727], [364.0, 427.403846153846], [365.0, 535.9242424242424], [361.0, 470.33333333333337], [362.0, 555.8085106382977], [363.0, 559.7000000000002], [369.0, 515.5], [368.0, 422.63265306122446], [370.0, 467.09523809523813], [371.0, 519.4313725490194], [372.0, 584.512195121951], [373.0, 558.6874999999999], [374.0, 476.8461538461539], [375.0, 486.02777777777777], [376.0, 622.2857142857142], [382.0, 387.43589743589735], [383.0, 689.8484848484849], [380.0, 589.5762711864407], [381.0, 496.76000000000005], [377.0, 457.3478260869566], [378.0, 552.8604651162789], [379.0, 593.3829787234043], [385.0, 477.74], [384.0, 589.65], [386.0, 462.5084745762712], [387.0, 609.3076923076926], [388.0, 585.7659574468086], [389.0, 495.5116279069767], [390.0, 569.5999999999999], [391.0, 577.7941176470588], [392.0, 667.7446808510638], [398.0, 495.97368421052636], [399.0, 513.5581395348837], [396.0, 548.1304347826085], [397.0, 388.7], [393.0, 512.78], [394.0, 455.01754385964904], [395.0, 511.31147540983613], [401.0, 636.9999999999998], [400.0, 702.9375], [402.0, 557.5087719298243], [403.0, 527.8813559322035], [404.0, 553.1206896551724], [405.0, 556.7234042553191], [406.0, 524.25], [407.0, 573.7272727272727], [408.0, 643.6052631578946], [414.0, 569.372549019608], [415.0, 566.7073170731707], [412.0, 472.12121212121207], [413.0, 581.392857142857], [409.0, 521.5135135135134], [410.0, 529.5], [411.0, 559.56], [417.0, 485.48936170212767], [416.0, 528.9491525423724], [418.0, 438.2068965517241], [419.0, 504.56666666666666], [420.0, 485.9767441860465], [421.0, 521.5777777777777], [422.0, 521.968253968254], [423.0, 582.2222222222223], [424.0, 486.1521739130434], [430.0, 565.313725490196], [431.0, 468.64788732394373], [428.0, 548.2765957446809], [429.0, 519.3114754098358], [425.0, 503.1599999999999], [426.0, 588.4318181818181], [427.0, 630.4102564102566], [433.0, 513.695652173913], [432.0, 613.6190476190477], [434.0, 466.304347826087], [435.0, 625.9354838709678], [436.0, 518.3333333333333], [437.0, 538.3783783783783], [438.0, 444.2000000000001], [439.0, 532.4], [440.0, 617.5526315789475], [446.0, 550.360655737705], [447.0, 851.5555555555557], [444.0, 707.6153846153845], [445.0, 557.1666666666665], [441.0, 789.9615384615387], [442.0, 634.7250000000003], [443.0, 746.2916666666667], [448.0, 642.3773584905659], [449.0, 741.8064516129032], [453.0, 714.3857142857144], [454.0, 723.2222222222223], [455.0, 718.4769230769231], [451.0, 595.6206896551723], [460.0, 1085.1], [462.0, 988.8809523809526], [461.0, 1006.8055555555554], [463.0, 890.6666666666667], [452.0, 658.5909090909091], [450.0, 672.1818181818181], [456.0, 762.5714285714286], [457.0, 976.5128205128206], [458.0, 862.3703703703703], [459.0, 758.75], [465.0, 904.7012987012988], [464.0, 742.4374999999999], [466.0, 721.030303030303], [467.0, 816.5714285714287], [468.0, 688.9682539682541], [469.0, 764.7021276595746], [470.0, 807.2285714285713], [471.0, 698.1960784313725], [472.0, 668.5333333333333], [478.0, 486.18181818181813], [479.0, 525.0851063829787], [476.0, 566.6249999999999], [477.0, 635.3488372093021], [473.0, 643.9655172413792], [474.0, 585.5714285714288], [475.0, 655.5869565217391], [481.0, 444.7755102040816], [480.0, 622.1153846153849], [482.0, 489.70512820512823], [483.0, 579.9999999999999], [484.0, 640.5749999999999], [485.0, 697.1627906976746], [486.0, 656.5588235294116], [487.0, 926.8214285714286], [488.0, 542.04], [494.0, 731.0408163265308], [495.0, 574.2682926829267], [492.0, 595.2089552238808], [493.0, 461.68965517241367], [489.0, 686.7272727272727], [490.0, 704.22], [491.0, 555.3432835820896], [497.0, 714.4722222222222], [496.0, 538.8510638297871], [498.0, 625.6052631578947], [499.0, 741.1282051282052], [500.0, 642.7954545454544], [501.0, 641.1578947368421], [502.0, 656.3829787234041], [503.0, 628.7619047619046], [504.0, 675.0], [510.0, 801.2173913043478], [511.0, 736.4090909090908], [508.0, 662.357142857143], [509.0, 751.195652173913], [505.0, 684.4782608695652], [506.0, 707.5303030303032], [507.0, 760.9130434782609], [519.0, 597.25], [515.0, 673.5098039215687], [512.0, 753.2698412698414], [513.0, 622.634615384615], [514.0, 688.1249999999998], [516.0, 637.1999999999998], [517.0, 607.3170731707318], [518.0, 691.4250000000001], [537.0, 597.2432432432432], [536.0, 517.4857142857143], [538.0, 583.3636363636365], [539.0, 786.1147540983604], [540.0, 662.2499999999999], [541.0, 741.3921568627452], [542.0, 684.5641025641028], [543.0, 873.2500000000001], [529.0, 674.3461538461538], [528.0, 560.2558139534884], [531.0, 584.372549019608], [530.0, 547.7894736842103], [533.0, 732.2222222222222], [532.0, 800.3846153846155], [535.0, 637.7555555555555], [534.0, 696.1071428571428], [520.0, 696.0169491525425], [522.0, 590.0999999999999], [521.0, 647.7317073170732], [524.0, 595.7058823529411], [523.0, 640.1176470588235], [526.0, 626.8260869565216], [525.0, 868.0], [527.0, 544.3000000000001], [547.0, 889.4642857142859], [544.0, 754.549019607843], [558.0, 680.1627906976745], [559.0, 663.5833333333333], [556.0, 840.4897959183672], [557.0, 843.7], [554.0, 875.0923076923074], [555.0, 947.5476190476189], [545.0, 791.2083333333333], [546.0, 841.2432432432433], [548.0, 766.6363636363635], [549.0, 735.0250000000001], [550.0, 906.2142857142859], [551.0, 694.7142857142856], [560.0, 598.9666666666668], [574.0, 671.8793103448278], [575.0, 695.0222222222221], [572.0, 692.3333333333335], [573.0, 709.7118644067798], [570.0, 824.111111111111], [571.0, 638.1851851851852], [568.0, 1013.5294117647057], [569.0, 665.439024390244], [561.0, 909.1272727272727], [562.0, 1127.9218750000005], [563.0, 930.8636363636363], [564.0, 1158.0000000000002], [565.0, 1114.0487804878048], [566.0, 1302.2285714285715], [567.0, 1238.7368421052636], [552.0, 1044.0], [553.0, 726.5185185185185], [579.0, 778.1666666666666], [576.0, 723.8717948717945], [590.0, 797.7738095238094], [591.0, 834.5999999999999], [588.0, 1036.188679245283], [589.0, 755.4081632653061], [586.0, 763.309523809524], [587.0, 860.5526315789474], [577.0, 741.1960784313725], [578.0, 703.0526315789473], [580.0, 818.9130434782609], [581.0, 839.1250000000001], [582.0, 664.945945945946], [583.0, 909.3333333333333], [592.0, 639.3823529411765], [606.0, 705.4242424242424], [607.0, 830.2153846153847], [604.0, 815.0208333333335], [605.0, 801.9347826086956], [602.0, 815.7183098591549], [603.0, 641.2244897959182], [600.0, 975.310344827586], [601.0, 866.5272727272728], [593.0, 844.9482758620688], [594.0, 917.6944444444443], [595.0, 1042.0238095238096], [596.0, 776.2800000000001], [597.0, 903.3529411764705], [598.0, 1129.153846153846], [599.0, 844.346153846154], [584.0, 1033.7560975609756], [585.0, 762.9024390243903], [611.0, 802.1960784313725], [608.0, 852.9861111111112], [622.0, 704.5660377358491], [623.0, 742.9423076923077], [620.0, 611.48], [621.0, 759.5483870967741], [618.0, 929.9622641509434], [619.0, 903.4354838709678], [609.0, 790.5333333333336], [610.0, 881.3150684931506], [612.0, 800.0333333333332], [613.0, 937.1636363636364], [614.0, 732.0333333333332], [615.0, 951.3061224489794], [624.0, 478.7555555555555], [638.0, 862.7058823529411], [639.0, 795.3134328358212], [636.0, 848.0294117647059], [637.0, 718.0638297872339], [634.0, 803.8823529411766], [635.0, 699.9534883720929], [632.0, 866.9250000000002], [633.0, 641.848484848485], [625.0, 693.1052631578947], [626.0, 783.1406249999998], [627.0, 692.1707317073169], [628.0, 776.5454545454545], [629.0, 872.0869565217392], [630.0, 960.6666666666669], [631.0, 869.5217391304349], [616.0, 733.7916666666666], [617.0, 960.1923076923077], [643.0, 887.9799999999998], [640.0, 755.6904761904761], [654.0, 817.8837209302326], [655.0, 846.2549019607843], [652.0, 1103.2909090909093], [653.0, 834.6578947368421], [650.0, 871.5454545454545], [651.0, 900.0666666666667], [641.0, 673.7872340425532], [642.0, 748.3454545454545], [644.0, 840.6716417910449], [645.0, 762.0819672131148], [646.0, 870.3095238095237], [647.0, 882.8356164383564], [656.0, 1057.584905660378], [670.0, 716.8367346938772], [671.0, 632.3243243243243], [668.0, 902.3125], [669.0, 816.377358490566], [666.0, 684.8750000000002], [667.0, 1052.757575757576], [664.0, 1065.864864864865], [665.0, 914.1388888888888], [657.0, 870.2444444444445], [658.0, 821.8550724637681], [659.0, 1031.897435897436], [660.0, 876.0895522388062], [661.0, 828.0259740259739], [662.0, 876.1702127659574], [663.0, 970.3870967741935], [648.0, 935.25], [649.0, 725.4772727272725], [675.0, 832.8958333333331], [672.0, 899.1935483870968], [686.0, 791.3902439024391], [687.0, 961.6153846153845], [684.0, 873.0000000000001], [685.0, 802.7894736842106], [682.0, 856.2439024390244], [683.0, 898.4098360655737], [673.0, 906.5277777777778], [674.0, 842.5438596491231], [676.0, 1059.739130434782], [677.0, 908.2432432432432], [678.0, 894.1999999999998], [679.0, 818.5172413793106], [688.0, 867.2499999999999], [702.0, 816.9130434782609], [703.0, 1286.0], [700.0, 791.8846153846154], [701.0, 1057.9629629629628], [698.0, 964.2083333333333], [699.0, 920.4482758620691], [696.0, 1102.0481927710846], [697.0, 886.3829787234044], [689.0, 1038.6410256410256], [690.0, 893.9999999999999], [691.0, 896.076923076923], [692.0, 1031.8235294117649], [693.0, 966.4285714285713], [694.0, 987.058823529412], [695.0, 959.0731707317074], [680.0, 931.1777777777778], [681.0, 812.2105263157894], [707.0, 924.1666666666667], [704.0, 1851.0], [718.0, 850.4666666666667], [719.0, 1319.918918918919], [716.0, 1148.0416666666663], [717.0, 872.9791666666666], [714.0, 1036.5106382978724], [715.0, 1187.2857142857144], [705.0, 944.6382978723402], [706.0, 1056.2666666666667], [708.0, 1031.2916666666667], [709.0, 1145.6842105263158], [710.0, 988.3243243243244], [711.0, 1126.5238095238096], [720.0, 1142.2173913043473], [734.0, 982.4999999999999], [735.0, 1075.4390243902437], [732.0, 1103.0517241379307], [733.0, 1258.840909090909], [730.0, 1307.7727272727275], [731.0, 974.2708333333334], [728.0, 1207.4426229508194], [729.0, 1278.5777777777773], [721.0, 989.3666666666669], [722.0, 1106.295454545454], [723.0, 1178.0322580645166], [724.0, 1250.339285714285], [725.0, 1181.6964285714287], [726.0, 1054.717948717949], [727.0, 1207.5781250000005], [712.0, 1181.7213114754097], [713.0, 1047.685185185185], [739.0, 1255.5208333333335], [736.0, 1179.4225352112674], [750.0, 875.9253731343284], [751.0, 1045.3], [748.0, 1274.965517241379], [749.0, 931.314606741573], [746.0, 1251.7857142857142], [747.0, 1124.7857142857144], [737.0, 1129.6470588235293], [738.0, 1215.5000000000002], [740.0, 1158.7037037037037], [741.0, 1140.7941176470588], [742.0, 1050.0816326530612], [743.0, 1217.975], [752.0, 863.1333333333332], [766.0, 1046.5909090909092], [767.0, 1191.4705882352935], [764.0, 865.0833333333336], [765.0, 1121.6981132075473], [762.0, 834.8474576271187], [763.0, 838.1800000000001], [760.0, 1047.6944444444446], [761.0, 951.2203389830507], [753.0, 1000.6976744186045], [754.0, 1131.7804878048782], [755.0, 1055.478260869565], [756.0, 1020.9285714285713], [757.0, 1108.391304347826], [758.0, 1158.2448979591836], [759.0, 1089.082191780822], [744.0, 1202.1999999999998], [745.0, 1373.2307692307693], [775.0, 972.625], [771.0, 1313.7096774193549], [768.0, 1078.4901960784314], [783.0, 945.6111111111112], [781.0, 1198.586206896552], [782.0, 1287.1052631578948], [779.0, 1105.1666666666665], [780.0, 1040.2857142857142], [769.0, 1177.25], [770.0, 955.2608695652175], [772.0, 1036.6129032258066], [773.0, 1049.325581395349], [774.0, 979.9761904761905], [784.0, 1108.5918367346937], [798.0, 1070.1363636363637], [799.0, 1012.0465116279071], [796.0, 1342.423076923077], [797.0, 1044.6527777777776], [794.0, 1172.3999999999999], [795.0, 1093.4642857142856], [792.0, 1034.615384615385], [793.0, 849.8936170212766], [785.0, 1624.7058823529408], [786.0, 1152.7777777777778], [787.0, 1185.3142857142855], [788.0, 1245.3571428571424], [789.0, 1070.6666666666674], [790.0, 1118.704918032787], [791.0, 987.5090909090911], [777.0, 1002.7272727272727], [776.0, 1017.2758620689654], [778.0, 961.7560975609758], [824.0, 1314.30303030303], [801.0, 1120.5277777777778], [800.0, 1163.6052631578946], [815.0, 1391.7777777777778], [814.0, 1134.7727272727275], [813.0, 1402.8125], [812.0, 1151.666666666667], [811.0, 1175.6764705882356], [810.0, 1071.7931034482758], [809.0, 1420.9130434782603], [808.0, 1176.1851851851852], [802.0, 1149.880952380952], [803.0, 1326.0], [805.0, 1210.241379310345], [804.0, 1037.9375000000002], [807.0, 1018.5294117647059], [806.0, 1039.5714285714284], [820.0, 1451.9714285714285], [821.0, 1400.058139534883], [822.0, 1606.142857142857], [823.0, 1449.8181818181815], [825.0, 1507.6428571428573], [826.0, 1511.5636363636363], [827.0, 1252.162162162162], [828.0, 1234.7142857142853], [829.0, 1366.2769230769236], [830.0, 1515.811320754717], [831.0, 1274.2500000000002], [817.0, 1116.1578947368419], [816.0, 1381.0833333333333], [819.0, 1369.3225806451612], [818.0, 1267.7948717948716], [835.0, 1191.4358974358975], [832.0, 1536.5060240963858], [846.0, 1368.170731707317], [847.0, 1373.4000000000003], [844.0, 1244.1190476190475], [845.0, 1343.0465116279072], [842.0, 1243.4193548387095], [843.0, 1293.7999999999997], [833.0, 1502.3243243243244], [834.0, 1410.4565217391303], [836.0, 1369.3478260869567], [837.0, 1266.7222222222222], [838.0, 1190.6486486486488], [839.0, 1025.6896551724135], [848.0, 1555.095238095238], [862.0, 1330.6415094339625], [863.0, 1435.457627118644], [860.0, 1200.302325581395], [861.0, 1154.2105263157894], [858.0, 1346.88], [859.0, 1497.2745098039218], [856.0, 1315.2058823529412], [857.0, 1576.0833333333335], [849.0, 1200.2380952380952], [850.0, 1205.666666666667], [851.0, 1217.6410256410256], [852.0, 1382.6], [853.0, 1397.0681818181818], [854.0, 1545.804347826087], [855.0, 1393.6562499999998], [840.0, 1213.8837209302324], [841.0, 1220.818181818182], [867.0, 1441.9882352941177], [864.0, 1314.2413793103447], [878.0, 1134.156862745098], [879.0, 1163.4565217391305], [876.0, 1145.8333333333333], [877.0, 1246.4666666666665], [874.0, 1137.711111111111], [875.0, 928.846153846154], [865.0, 1374.014925373134], [866.0, 1316.4761904761904], [868.0, 1385.0000000000002], [869.0, 1320.8545454545456], [870.0, 1361.3220338983049], [871.0, 1312.0925925925922], [880.0, 1013.5581395348839], [894.0, 1166.7872340425527], [895.0, 897.5454545454546], [892.0, 963.8139534883721], [893.0, 1037.8727272727272], [890.0, 1134.153846153846], [891.0, 864.7352941176471], [888.0, 978.48], [889.0, 986.5362318840578], [881.0, 1147.4761904761908], [882.0, 1227.3934426229512], [883.0, 1201.4805194805197], [884.0, 1133.6749999999995], [885.0, 1018.2727272727274], [886.0, 977.6250000000005], [887.0, 1141.7179487179483], [872.0, 1231.6851851851852], [873.0, 1183.4285714285713], [899.0, 965.9206349206348], [896.0, 1242.9500000000003], [910.0, 1175.926829268293], [911.0, 1254.1428571428569], [908.0, 1254.851851851852], [909.0, 1132.675675675676], [906.0, 1213.0882352941178], [907.0, 1522.3823529411761], [897.0, 1156.9818181818184], [898.0, 1012.1842105263161], [900.0, 1037.7000000000005], [901.0, 862.4444444444443], [902.0, 947.9032258064517], [903.0, 1142.6865671641795], [912.0, 1070.3181818181822], [926.0, 1269.6744186046515], [927.0, 1208.450980392157], [924.0, 1434.4199999999996], [925.0, 1379.6825396825404], [922.0, 1311.9354838709678], [923.0, 1265.9999999999998], [920.0, 1028.7441860465115], [921.0, 1098.2499999999998], [913.0, 1174.5098039215686], [914.0, 1077.7666666666664], [915.0, 1117.2666666666664], [916.0, 1163.3750000000005], [917.0, 1149.857142857143], [918.0, 1069.3921568627452], [919.0, 1218.8867924528297], [904.0, 990.4444444444446], [905.0, 962.260869565217], [931.0, 1278.6315789473688], [928.0, 1279.4545454545453], [942.0, 1382.0370370370367], [943.0, 1209.5319148936169], [940.0, 1264.3947368421052], [941.0, 1450.0847457627117], [938.0, 1184.871794871795], [939.0, 1174.264705882353], [929.0, 1141.4193548387095], [930.0, 986.02], [932.0, 962.3333333333334], [933.0, 1213.9400000000003], [934.0, 1215.8541666666667], [935.0, 1173.804878048781], [944.0, 1370.1951219512196], [958.0, 1555.0689655172414], [959.0, 1332.4074074074072], [956.0, 1523.2580645161286], [957.0, 1319.0526315789475], [954.0, 1333.8518518518517], [955.0, 1396.0526315789473], [952.0, 1609.4444444444446], [953.0, 1180.62962962963], [945.0, 1276.1428571428576], [946.0, 1163.2343749999995], [947.0, 1267.3157894736846], [948.0, 1226.329113924051], [949.0, 1148.448979591837], [950.0, 1497.396551724138], [951.0, 1407.043478260869], [936.0, 1187.075], [937.0, 1220.0], [963.0, 1455.3846153846157], [960.0, 1521.7241379310342], [974.0, 1082.8750000000002], [975.0, 1290.9428571428573], [972.0, 1303.906976744186], [973.0, 1173.3404255319153], [970.0, 1499.268656716418], [971.0, 1243.5344827586202], [961.0, 1432.6875], [962.0, 1638.888888888889], [964.0, 915.0], [965.0, 1158.0652173913043], [966.0, 1404.6216216216212], [967.0, 1385.9242424242423], [976.0, 1557.5925925925928], [990.0, 1552.0952380952383], [991.0, 1361.1304347826087], [988.0, 1340.3243243243246], [989.0, 1494.278481012658], [986.0, 1380.4814814814818], [987.0, 1256.4342105263163], [984.0, 1510.9999999999995], [985.0, 1590.2878787878788], [977.0, 1185.04347826087], [978.0, 1398.3666666666668], [979.0, 1306.607142857143], [980.0, 1316.5833333333333], [981.0, 1387.9354838709676], [982.0, 1220.4705882352941], [983.0, 1470.4745762711862], [968.0, 1280.9756097560978], [969.0, 1580.5769230769229], [995.0, 1441.6341463414637], [992.0, 1566.6133333333332], [1006.0, 1332.263157894737], [1007.0, 1268.3720930232562], [1004.0, 1299.152173913043], [1005.0, 1344.8717948717947], [1002.0, 1208.4210526315792], [1003.0, 1381.202898550725], [993.0, 1576.4385964912278], [994.0, 1433.5769230769233], [996.0, 1537.4259259259259], [997.0, 1313.8], [998.0, 1291.968253968254], [999.0, 1451.2857142857142], [1008.0, 1366.2741935483873], [1022.0, 1111.0000000000002], [1023.0, 1206.1463414634145], [1020.0, 1045.5102040816328], [1021.0, 1345.1785714285713], [1018.0, 1145.790697674419], [1019.0, 1310.6081081081077], [1016.0, 1266.276595744681], [1017.0, 1109.1020408163263], [1009.0, 1112.622222222222], [1010.0, 1387.9374999999995], [1011.0, 1099.483333333333], [1012.0, 1226.2558139534883], [1013.0, 1270.464788732394], [1014.0, 1376.9999999999998], [1015.0, 1327.3437499999998], [1000.0, 1402.3589743589744], [1001.0, 1406.2368421052633], [1030.0, 979.6274509803924], [1024.0, 842.0697674418606], [1052.0, 1133.3770491803277], [1054.0, 1384.269662921348], [1048.0, 1076.828125], [1050.0, 1204.6470588235295], [1044.0, 1401.2682926829273], [1046.0, 1233.2941176470586], [1026.0, 1178.084507042253], [1028.0, 1220.2835820895516], [1032.0, 1173.0454545454545], [1034.0, 1047.0212765957444], [1036.0, 1214.1600000000003], [1038.0, 1075.8235294117649], [1056.0, 1235.0277777777776], [1086.0, 1260.292682926829], [1084.0, 1236.409090909091], [1082.0, 1071.9166666666667], [1080.0, 1286.5454545454545], [1078.0, 1295.375], [1076.0, 1367.4107142857142], [1074.0, 1452.5882352941176], [1072.0, 1266.9655172413793], [1058.0, 1415.08], [1060.0, 1294.2784810126582], [1062.0, 1228.2000000000007], [1064.0, 1243.8235294117653], [1066.0, 1431.5230769230766], [1068.0, 1306.2830188679243], [1070.0, 1410.7368421052633], [1040.0, 1150.0545454545454], [1042.0, 1207.4313725490197], [1100.0, 1689.9062499999998], [1090.0, 1612.3928571428573], [1088.0, 1366.6833333333334], [1116.0, 1402.9861111111115], [1118.0, 1221.646153846154], [1112.0, 1367.0000000000002], [1114.0, 1482.506329113924], [1108.0, 1307.3770491803277], [1110.0, 1798.9692307692305], [1092.0, 1443.0588235294115], [1094.0, 1495.2916666666667], [1096.0, 1445.9722222222222], [1098.0, 776.725], [1102.0, 1488.120370370371], [1136.0, 1185.2222222222217], [1138.0, 1146.3571428571427], [1140.0, 1333.1694915254236], [1142.0, 1293.0813953488375], [1144.0, 1135.8363636363633], [1146.0, 1480.3], [1148.0, 1171.2499999999998], [1150.0, 1256.9166666666667], [1120.0, 1584.3103448275865], [1122.0, 1081.303370786517], [1124.0, 1355.907894736842], [1126.0, 1399.657894736842], [1128.0, 1406.5882352941176], [1130.0, 1540.673469387755], [1132.0, 1269.1555555555556], [1134.0, 1387.4411764705883], [1104.0, 1459.0000000000005], [1106.0, 1345.25], [1158.0, 1064.6275862068956], [1152.0, 1219.2837837837833], [1180.0, 1378.2820512820515], [1182.0, 1271.0365853658536], [1176.0, 1185.6938775510203], [1178.0, 1230.363636363636], [1172.0, 1199.1492537313438], [1174.0, 1325.44776119403], [1154.0, 1214.5254237288136], [1156.0, 1148.0222222222221], [1160.0, 1080.8169014084508], [1162.0, 1054.0185185185185], [1164.0, 1092.5294117647065], [1166.0, 1049.8571428571427], [1184.0, 1131.8317757009345], [1208.0, 1386.4805194805192], [1210.0, 1564.5783208963237], [1204.0, 1087.8070175438597], [1206.0, 1140.6634615384621], [1200.0, 1326.9629629629635], [1202.0, 1466.0317460317465], [1186.0, 1437.0895522388064], [1188.0, 1029.8602150537633], [1190.0, 1187.333333333333], [1192.0, 922.3218390804595], [1194.0, 1341.2786885245905], [1196.0, 1023.7881355932209], [1198.0, 1185.4924242424242], [1168.0, 1226.5932203389832], [1170.0, 1252.1111111111109], [1031.0, 1162.3333333333335], [1025.0, 969.1707317073171], [1053.0, 1528.3243243243242], [1055.0, 1351.8089887640454], [1049.0, 1225.9487179487182], [1051.0, 1215.45], [1045.0, 1406.4677419354837], [1047.0, 1178.7083333333335], [1027.0, 1269.0303030303035], [1029.0, 1143.395833333333], [1033.0, 1097.4444444444441], [1035.0, 1060.7333333333333], [1037.0, 1314.7142857142856], [1039.0, 1204.888888888889], [1057.0, 1335.7234042553196], [1087.0, 1512.7702702702709], [1085.0, 1246.5185185185185], [1083.0, 1415.9411764705878], [1081.0, 1303.8378378378382], [1079.0, 1118.4838709677422], [1077.0, 1678.377049180328], [1075.0, 1371.5151515151515], [1073.0, 1337.0285714285715], [1059.0, 1315.925], [1061.0, 1199.320512820513], [1063.0, 1319.6666666666667], [1065.0, 1428.5555555555554], [1067.0, 1233.9487179487178], [1069.0, 1335.388888888889], [1071.0, 1247.9117647058824], [1041.0, 1167.957446808511], [1043.0, 1216.351851851852], [1091.0, 1581.7343749999998], [1111.0, 1497.044776119403], [1089.0, 1383.662337662338], [1117.0, 1499.3999999999996], [1119.0, 1147.7407407407406], [1113.0, 1509.6133333333328], [1115.0, 1501.245762711865], [1093.0, 1159.5749999999998], [1095.0, 1425.0434782608695], [1099.0, 1434.0], [1097.0, 1404.5714285714284], [1101.0, 1499.6375000000003], [1103.0, 1479.9714285714283], [1137.0, 1143.8124999999998], [1139.0, 1165.4831460674159], [1141.0, 1454.3461538461543], [1143.0, 1151.8550724637687], [1145.0, 995.0263157894736], [1147.0, 1093.1090909090906], [1149.0, 1140.9999999999995], [1151.0, 1345.635135135136], [1121.0, 1518.229166666667], [1123.0, 1342.666666666666], [1125.0, 1363.5185185185187], [1127.0, 1291.361111111111], [1129.0, 1278.686274509804], [1131.0, 1591.2749999999999], [1133.0, 1116.181818181818], [1135.0, 1308.1578947368423], [1105.0, 1356.785714285714], [1107.0, 1240.5466666666666], [1109.0, 1658.6181818181815], [1159.0, 1185.065573770492], [1153.0, 1174.9259259259259], [1181.0, 1262.3483146067413], [1183.0, 1053.9724770642201], [1177.0, 1203.730769230769], [1179.0, 1320.6883116883118], [1173.0, 1166.8823529411761], [1175.0, 1262.255813953488], [1155.0, 1101.4659090909092], [1157.0, 1292.7368421052633], [1161.0, 1204.03125], [1163.0, 1219.629213483146], [1165.0, 1161.8529411764703], [1167.0, 1279.2968750000005], [1185.0, 1226.4408602150543], [1209.0, 1297.56], [1205.0, 1255.1400000000008], [1207.0, 1121.8103448275865], [1201.0, 1622.166666666667], [1203.0, 1041.709677419355], [1187.0, 1417.8405797101448], [1189.0, 1374.4693877551017], [1191.0, 1180.9911504424783], [1193.0, 1142.031746031746], [1195.0, 1257.1644736842097], [1197.0, 1470.3673469387747], [1199.0, 1334.7954545454545], [1169.0, 1357.8627450980398], [1171.0, 1153.688888888889], [1.0, 6.125]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[992.1462679876853, 1284.7090460840623]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1210.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 5305.0, "minX": 1.54979004E12, "maxY": 451694.0, "series": [{"data": [[1.54979004E12, 201043.25], [1.54979016E12, 17257.533333333333], [1.54979034E12, 293210.43333333335], [1.5497904E12, 355492.3333333333], [1.5497901E12, 451694.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54979004E12, 61860.0], [1.54979016E12, 5305.0], [1.54979034E12, 90092.5], [1.5497904E12, 99105.0], [1.5497901E12, 114940.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5497904E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 297.42978322337444, "minX": 1.54979004E12, "maxY": 1477.6410203235178, "series": [{"data": [[1.54979004E12, 1030.5491432266365], [1.54979016E12, 297.42978322337444], [1.54979034E12, 1053.1832005993813], [1.5497904E12, 1467.6716447336007], [1.5497901E12, 1477.6410203235178]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5497904E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 297.427898209237, "minX": 1.54979004E12, "maxY": 1463.6868007294631, "series": [{"data": [[1.54979004E12, 1030.544091496929], [1.54979016E12, 297.427898209237], [1.54979034E12, 1053.181813136511], [1.5497904E12, 1463.6868007294631], [1.5497901E12, 1463.2994193280765]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5497904E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.027803958529688994, "minX": 1.54979004E12, "maxY": 34.04504355039394, "series": [{"data": [[1.54979004E12, 15.025501131587477], [1.54979016E12, 0.027803958529688994], [1.54979034E12, 3.7288065044260432], [1.5497904E12, 11.048671694021447], [1.5497901E12, 34.04504355039394]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5497904E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 5.0, "minX": 1.54979004E12, "maxY": 6127.0, "series": [{"data": [[1.54979004E12, 5210.0], [1.54979016E12, 1618.0], [1.54979034E12, 5683.0], [1.5497904E12, 6127.0], [1.5497901E12, 5899.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54979004E12, 9.0], [1.54979016E12, 5.0], [1.54979034E12, 5.0], [1.5497904E12, 6.0], [1.5497901E12, 8.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54979004E12, 2240.0], [1.54979016E12, 2406.0], [1.54979034E12, 2495.0], [1.5497904E12, 2564.0], [1.5497901E12, 2437.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54979004E12, 3167.980000000003], [1.54979016E12, 3198.0], [1.54979034E12, 3460.9900000000016], [1.5497904E12, 3513.9900000000016], [1.5497901E12, 3249.9900000000016]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54979004E12, 2532.0], [1.54979016E12, 2663.9500000000007], [1.54979034E12, 2796.9500000000007], [1.5497904E12, 2853.9500000000007], [1.5497901E12, 2696.9500000000007]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5497904E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 66.0, "minX": 35.0, "maxY": 1514.0, "series": [{"data": [[35.0, 209.0], [600.0, 1514.0], [676.0, 1448.0], [412.0, 1091.0], [803.0, 1473.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[676.0, 66.0], [803.0, 90.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 803.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 35.0, "maxY": 1514.0, "series": [{"data": [[35.0, 209.0], [600.0, 1514.0], [676.0, 1448.0], [412.0, 1091.0], [803.0, 1473.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[676.0, 0.0], [803.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 803.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 29.3, "minX": 1.54979004E12, "maxY": 789.5666666666667, "series": [{"data": [[1.54979004E12, 432.56666666666666], [1.54979016E12, 29.3], [1.54979034E12, 620.7666666666667], [1.5497904E12, 656.15], [1.5497901E12, 789.5666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5497904E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 15.6, "minX": 1.54979004E12, "maxY": 766.2666666666667, "series": [{"data": [[1.54979004E12, 412.4], [1.54979016E12, 35.36666666666667], [1.54979034E12, 600.6166666666667], [1.5497904E12, 660.7], [1.5497901E12, 766.2666666666667]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5497904E12, 15.6], [1.5497901E12, 37.4]], "isOverall": false, "label": "Non HTTP response code: java.net.NoRouteToHostException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5497904E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 15.6, "minX": 1.54979004E12, "maxY": 766.2666666666667, "series": [{"data": [[1.54979004E12, 412.4], [1.54979016E12, 35.36666666666667], [1.54979034E12, 600.6166666666667], [1.5497904E12, 660.7], [1.5497901E12, 766.2666666666667]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}, {"data": [[1.5497904E12, 15.6], [1.5497901E12, 37.4]], "isOverall": false, "label": "Petición HTTP-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5497904E12, "title": "Transactions Per Second"}},
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
