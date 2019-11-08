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
        data: {"result": {"minY": 35.0, "minX": 0.0, "maxY": 4828.0, "series": [{"data": [[0.0, 35.0], [0.1, 38.0], [0.2, 40.0], [0.3, 42.0], [0.4, 43.0], [0.5, 45.0], [0.6, 46.0], [0.7, 46.0], [0.8, 47.0], [0.9, 48.0], [1.0, 49.0], [1.1, 49.0], [1.2, 50.0], [1.3, 51.0], [1.4, 51.0], [1.5, 52.0], [1.6, 52.0], [1.7, 53.0], [1.8, 53.0], [1.9, 54.0], [2.0, 54.0], [2.1, 55.0], [2.2, 56.0], [2.3, 56.0], [2.4, 57.0], [2.5, 57.0], [2.6, 57.0], [2.7, 57.0], [2.8, 58.0], [2.9, 58.0], [3.0, 58.0], [3.1, 58.0], [3.2, 58.0], [3.3, 59.0], [3.4, 59.0], [3.5, 60.0], [3.6, 60.0], [3.7, 61.0], [3.8, 61.0], [3.9, 61.0], [4.0, 62.0], [4.1, 62.0], [4.2, 62.0], [4.3, 62.0], [4.4, 62.0], [4.5, 63.0], [4.6, 63.0], [4.7, 63.0], [4.8, 63.0], [4.9, 63.0], [5.0, 64.0], [5.1, 64.0], [5.2, 65.0], [5.3, 65.0], [5.4, 65.0], [5.5, 65.0], [5.6, 66.0], [5.7, 66.0], [5.8, 66.0], [5.9, 67.0], [6.0, 67.0], [6.1, 67.0], [6.2, 67.0], [6.3, 67.0], [6.4, 68.0], [6.5, 68.0], [6.6, 69.0], [6.7, 69.0], [6.8, 69.0], [6.9, 69.0], [7.0, 70.0], [7.1, 70.0], [7.2, 70.0], [7.3, 70.0], [7.4, 71.0], [7.5, 71.0], [7.6, 71.0], [7.7, 71.0], [7.8, 72.0], [7.9, 72.0], [8.0, 72.0], [8.1, 72.0], [8.2, 72.0], [8.3, 72.0], [8.4, 73.0], [8.5, 73.0], [8.6, 74.0], [8.7, 74.0], [8.8, 74.0], [8.9, 75.0], [9.0, 75.0], [9.1, 75.0], [9.2, 75.0], [9.3, 76.0], [9.4, 76.0], [9.5, 76.0], [9.6, 77.0], [9.7, 77.0], [9.8, 78.0], [9.9, 78.0], [10.0, 79.0], [10.1, 80.0], [10.2, 80.0], [10.3, 81.0], [10.4, 81.0], [10.5, 82.0], [10.6, 82.0], [10.7, 83.0], [10.8, 84.0], [10.9, 85.0], [11.0, 85.0], [11.1, 86.0], [11.2, 86.0], [11.3, 86.0], [11.4, 87.0], [11.5, 88.0], [11.6, 88.0], [11.7, 89.0], [11.8, 92.0], [11.9, 93.0], [12.0, 93.0], [12.1, 95.0], [12.2, 95.0], [12.3, 96.0], [12.4, 97.0], [12.5, 97.0], [12.6, 100.0], [12.7, 100.0], [12.8, 101.0], [12.9, 101.0], [13.0, 102.0], [13.1, 103.0], [13.2, 105.0], [13.3, 106.0], [13.4, 106.0], [13.5, 107.0], [13.6, 109.0], [13.7, 110.0], [13.8, 113.0], [13.9, 113.0], [14.0, 115.0], [14.1, 115.0], [14.2, 116.0], [14.3, 116.0], [14.4, 118.0], [14.5, 119.0], [14.6, 119.0], [14.7, 120.0], [14.8, 120.0], [14.9, 121.0], [15.0, 122.0], [15.1, 123.0], [15.2, 125.0], [15.3, 126.0], [15.4, 127.0], [15.5, 128.0], [15.6, 128.0], [15.7, 129.0], [15.8, 129.0], [15.9, 130.0], [16.0, 131.0], [16.1, 132.0], [16.2, 133.0], [16.3, 133.0], [16.4, 135.0], [16.5, 135.0], [16.6, 136.0], [16.7, 138.0], [16.8, 138.0], [16.9, 141.0], [17.0, 142.0], [17.1, 143.0], [17.2, 144.0], [17.3, 145.0], [17.4, 146.0], [17.5, 146.0], [17.6, 146.0], [17.7, 147.0], [17.8, 147.0], [17.9, 148.0], [18.0, 149.0], [18.1, 150.0], [18.2, 151.0], [18.3, 151.0], [18.4, 152.0], [18.5, 153.0], [18.6, 153.0], [18.7, 153.0], [18.8, 154.0], [18.9, 154.0], [19.0, 155.0], [19.1, 156.0], [19.2, 156.0], [19.3, 156.0], [19.4, 157.0], [19.5, 157.0], [19.6, 160.0], [19.7, 160.0], [19.8, 160.0], [19.9, 161.0], [20.0, 161.0], [20.1, 162.0], [20.2, 163.0], [20.3, 164.0], [20.4, 165.0], [20.5, 166.0], [20.6, 166.0], [20.7, 167.0], [20.8, 168.0], [20.9, 168.0], [21.0, 169.0], [21.1, 170.0], [21.2, 171.0], [21.3, 172.0], [21.4, 172.0], [21.5, 173.0], [21.6, 174.0], [21.7, 174.0], [21.8, 175.0], [21.9, 175.0], [22.0, 176.0], [22.1, 176.0], [22.2, 176.0], [22.3, 176.0], [22.4, 177.0], [22.5, 177.0], [22.6, 178.0], [22.7, 179.0], [22.8, 181.0], [22.9, 182.0], [23.0, 183.0], [23.1, 183.0], [23.2, 184.0], [23.3, 185.0], [23.4, 186.0], [23.5, 188.0], [23.6, 190.0], [23.7, 190.0], [23.8, 192.0], [23.9, 193.0], [24.0, 193.0], [24.1, 193.0], [24.2, 194.0], [24.3, 195.0], [24.4, 197.0], [24.5, 198.0], [24.6, 198.0], [24.7, 198.0], [24.8, 199.0], [24.9, 200.0], [25.0, 201.0], [25.1, 201.0], [25.2, 202.0], [25.3, 202.0], [25.4, 202.0], [25.5, 204.0], [25.6, 204.0], [25.7, 207.0], [25.8, 208.0], [25.9, 208.0], [26.0, 209.0], [26.1, 209.0], [26.2, 211.0], [26.3, 213.0], [26.4, 213.0], [26.5, 214.0], [26.6, 215.0], [26.7, 216.0], [26.8, 218.0], [26.9, 218.0], [27.0, 219.0], [27.1, 221.0], [27.2, 221.0], [27.3, 222.0], [27.4, 223.0], [27.5, 223.0], [27.6, 225.0], [27.7, 227.0], [27.8, 229.0], [27.9, 229.0], [28.0, 231.0], [28.1, 234.0], [28.2, 236.0], [28.3, 236.0], [28.4, 237.0], [28.5, 238.0], [28.6, 239.0], [28.7, 240.0], [28.8, 242.0], [28.9, 242.0], [29.0, 243.0], [29.1, 244.0], [29.2, 246.0], [29.3, 247.0], [29.4, 247.0], [29.5, 247.0], [29.6, 250.0], [29.7, 252.0], [29.8, 254.0], [29.9, 255.0], [30.0, 256.0], [30.1, 258.0], [30.2, 261.0], [30.3, 263.0], [30.4, 264.0], [30.5, 266.0], [30.6, 266.0], [30.7, 267.0], [30.8, 269.0], [30.9, 271.0], [31.0, 273.0], [31.1, 274.0], [31.2, 276.0], [31.3, 278.0], [31.4, 279.0], [31.5, 281.0], [31.6, 283.0], [31.7, 284.0], [31.8, 285.0], [31.9, 287.0], [32.0, 288.0], [32.1, 290.0], [32.2, 291.0], [32.3, 293.0], [32.4, 295.0], [32.5, 297.0], [32.6, 300.0], [32.7, 301.0], [32.8, 302.0], [32.9, 303.0], [33.0, 303.0], [33.1, 306.0], [33.2, 309.0], [33.3, 311.0], [33.4, 312.0], [33.5, 314.0], [33.6, 318.0], [33.7, 318.0], [33.8, 321.0], [33.9, 323.0], [34.0, 323.0], [34.1, 324.0], [34.2, 324.0], [34.3, 325.0], [34.4, 332.0], [34.5, 334.0], [34.6, 335.0], [34.7, 340.0], [34.8, 343.0], [34.9, 346.0], [35.0, 349.0], [35.1, 353.0], [35.2, 353.0], [35.3, 353.0], [35.4, 354.0], [35.5, 355.0], [35.6, 357.0], [35.7, 358.0], [35.8, 359.0], [35.9, 360.0], [36.0, 361.0], [36.1, 362.0], [36.2, 365.0], [36.3, 369.0], [36.4, 372.0], [36.5, 376.0], [36.6, 386.0], [36.7, 386.0], [36.8, 388.0], [36.9, 388.0], [37.0, 389.0], [37.1, 390.0], [37.2, 393.0], [37.3, 394.0], [37.4, 394.0], [37.5, 397.0], [37.6, 407.0], [37.7, 408.0], [37.8, 413.0], [37.9, 417.0], [38.0, 417.0], [38.1, 420.0], [38.2, 421.0], [38.3, 423.0], [38.4, 424.0], [38.5, 425.0], [38.6, 426.0], [38.7, 427.0], [38.8, 427.0], [38.9, 430.0], [39.0, 430.0], [39.1, 438.0], [39.2, 440.0], [39.3, 444.0], [39.4, 448.0], [39.5, 454.0], [39.6, 462.0], [39.7, 464.0], [39.8, 466.0], [39.9, 468.0], [40.0, 472.0], [40.1, 473.0], [40.2, 475.0], [40.3, 478.0], [40.4, 479.0], [40.5, 483.0], [40.6, 486.0], [40.7, 489.0], [40.8, 492.0], [40.9, 498.0], [41.0, 501.0], [41.1, 503.0], [41.2, 507.0], [41.3, 510.0], [41.4, 511.0], [41.5, 516.0], [41.6, 519.0], [41.7, 519.0], [41.8, 523.0], [41.9, 524.0], [42.0, 526.0], [42.1, 527.0], [42.2, 532.0], [42.3, 534.0], [42.4, 545.0], [42.5, 548.0], [42.6, 550.0], [42.7, 553.0], [42.8, 556.0], [42.9, 572.0], [43.0, 581.0], [43.1, 588.0], [43.2, 598.0], [43.3, 613.0], [43.4, 616.0], [43.5, 622.0], [43.6, 637.0], [43.7, 664.0], [43.8, 668.0], [43.9, 685.0], [44.0, 703.0], [44.1, 709.0], [44.2, 719.0], [44.3, 752.0], [44.4, 767.0], [44.5, 793.0], [44.6, 817.0], [44.7, 829.0], [44.8, 855.0], [44.9, 868.0], [45.0, 875.0], [45.1, 898.0], [45.2, 933.0], [45.3, 940.0], [45.4, 942.0], [45.5, 952.0], [45.6, 954.0], [45.7, 961.0], [45.8, 972.0], [45.9, 987.0], [46.0, 997.0], [46.1, 1004.0], [46.2, 1009.0], [46.3, 1012.0], [46.4, 1030.0], [46.5, 1047.0], [46.6, 1058.0], [46.7, 1064.0], [46.8, 1065.0], [46.9, 1075.0], [47.0, 1085.0], [47.1, 1086.0], [47.2, 1086.0], [47.3, 1089.0], [47.4, 1103.0], [47.5, 1108.0], [47.6, 1109.0], [47.7, 1115.0], [47.8, 1133.0], [47.9, 1148.0], [48.0, 1160.0], [48.1, 1162.0], [48.2, 1166.0], [48.3, 1173.0], [48.4, 1176.0], [48.5, 1189.0], [48.6, 1201.0], [48.7, 1205.0], [48.8, 1211.0], [48.9, 1218.0], [49.0, 1223.0], [49.1, 1227.0], [49.2, 1239.0], [49.3, 1240.0], [49.4, 1244.0], [49.5, 1245.0], [49.6, 1247.0], [49.7, 1250.0], [49.8, 1252.0], [49.9, 1254.0], [50.0, 1255.0], [50.1, 1259.0], [50.2, 1266.0], [50.3, 1267.0], [50.4, 1271.0], [50.5, 1271.0], [50.6, 1275.0], [50.7, 1276.0], [50.8, 1279.0], [50.9, 1283.0], [51.0, 1293.0], [51.1, 1298.0], [51.2, 1301.0], [51.3, 1323.0], [51.4, 1330.0], [51.5, 1332.0], [51.6, 1335.0], [51.7, 1338.0], [51.8, 1340.0], [51.9, 1344.0], [52.0, 1354.0], [52.1, 1355.0], [52.2, 1359.0], [52.3, 1363.0], [52.4, 1368.0], [52.5, 1373.0], [52.6, 1376.0], [52.7, 1379.0], [52.8, 1382.0], [52.9, 1385.0], [53.0, 1386.0], [53.1, 1387.0], [53.2, 1390.0], [53.3, 1391.0], [53.4, 1394.0], [53.5, 1404.0], [53.6, 1405.0], [53.7, 1408.0], [53.8, 1410.0], [53.9, 1411.0], [54.0, 1415.0], [54.1, 1416.0], [54.2, 1419.0], [54.3, 1423.0], [54.4, 1424.0], [54.5, 1427.0], [54.6, 1430.0], [54.7, 1432.0], [54.8, 1433.0], [54.9, 1434.0], [55.0, 1437.0], [55.1, 1437.0], [55.2, 1438.0], [55.3, 1443.0], [55.4, 1447.0], [55.5, 1450.0], [55.6, 1456.0], [55.7, 1458.0], [55.8, 1459.0], [55.9, 1459.0], [56.0, 1463.0], [56.1, 1467.0], [56.2, 1469.0], [56.3, 1473.0], [56.4, 1477.0], [56.5, 1482.0], [56.6, 1485.0], [56.7, 1493.0], [56.8, 1497.0], [56.9, 1499.0], [57.0, 1499.0], [57.1, 1501.0], [57.2, 1505.0], [57.3, 1508.0], [57.4, 1508.0], [57.5, 1510.0], [57.6, 1512.0], [57.7, 1516.0], [57.8, 1523.0], [57.9, 1525.0], [58.0, 1528.0], [58.1, 1529.0], [58.2, 1531.0], [58.3, 1540.0], [58.4, 1545.0], [58.5, 1550.0], [58.6, 1552.0], [58.7, 1558.0], [58.8, 1561.0], [58.9, 1563.0], [59.0, 1564.0], [59.1, 1567.0], [59.2, 1570.0], [59.3, 1571.0], [59.4, 1573.0], [59.5, 1576.0], [59.6, 1579.0], [59.7, 1582.0], [59.8, 1583.0], [59.9, 1588.0], [60.0, 1591.0], [60.1, 1592.0], [60.2, 1596.0], [60.3, 1599.0], [60.4, 1601.0], [60.5, 1603.0], [60.6, 1607.0], [60.7, 1608.0], [60.8, 1611.0], [60.9, 1617.0], [61.0, 1619.0], [61.1, 1620.0], [61.2, 1625.0], [61.3, 1626.0], [61.4, 1628.0], [61.5, 1629.0], [61.6, 1633.0], [61.7, 1636.0], [61.8, 1637.0], [61.9, 1639.0], [62.0, 1641.0], [62.1, 1643.0], [62.2, 1647.0], [62.3, 1651.0], [62.4, 1656.0], [62.5, 1661.0], [62.6, 1668.0], [62.7, 1672.0], [62.8, 1675.0], [62.9, 1676.0], [63.0, 1678.0], [63.1, 1680.0], [63.2, 1683.0], [63.3, 1685.0], [63.4, 1687.0], [63.5, 1690.0], [63.6, 1692.0], [63.7, 1693.0], [63.8, 1694.0], [63.9, 1697.0], [64.0, 1697.0], [64.1, 1699.0], [64.2, 1700.0], [64.3, 1701.0], [64.4, 1703.0], [64.5, 1704.0], [64.6, 1705.0], [64.7, 1707.0], [64.8, 1709.0], [64.9, 1714.0], [65.0, 1715.0], [65.1, 1723.0], [65.2, 1724.0], [65.3, 1725.0], [65.4, 1729.0], [65.5, 1735.0], [65.6, 1736.0], [65.7, 1737.0], [65.8, 1740.0], [65.9, 1741.0], [66.0, 1745.0], [66.1, 1745.0], [66.2, 1753.0], [66.3, 1756.0], [66.4, 1759.0], [66.5, 1765.0], [66.6, 1769.0], [66.7, 1773.0], [66.8, 1774.0], [66.9, 1777.0], [67.0, 1779.0], [67.1, 1780.0], [67.2, 1782.0], [67.3, 1782.0], [67.4, 1787.0], [67.5, 1792.0], [67.6, 1793.0], [67.7, 1794.0], [67.8, 1810.0], [67.9, 1812.0], [68.0, 1814.0], [68.1, 1816.0], [68.2, 1825.0], [68.3, 1828.0], [68.4, 1831.0], [68.5, 1834.0], [68.6, 1835.0], [68.7, 1836.0], [68.8, 1837.0], [68.9, 1840.0], [69.0, 1841.0], [69.1, 1843.0], [69.2, 1844.0], [69.3, 1846.0], [69.4, 1848.0], [69.5, 1850.0], [69.6, 1854.0], [69.7, 1854.0], [69.8, 1855.0], [69.9, 1855.0], [70.0, 1856.0], [70.1, 1860.0], [70.2, 1864.0], [70.3, 1867.0], [70.4, 1869.0], [70.5, 1870.0], [70.6, 1871.0], [70.7, 1874.0], [70.8, 1876.0], [70.9, 1877.0], [71.0, 1882.0], [71.1, 1884.0], [71.2, 1888.0], [71.3, 1895.0], [71.4, 1899.0], [71.5, 1903.0], [71.6, 1909.0], [71.7, 1912.0], [71.8, 1913.0], [71.9, 1916.0], [72.0, 1919.0], [72.1, 1920.0], [72.2, 1923.0], [72.3, 1925.0], [72.4, 1928.0], [72.5, 1929.0], [72.6, 1931.0], [72.7, 1932.0], [72.8, 1934.0], [72.9, 1935.0], [73.0, 1936.0], [73.1, 1937.0], [73.2, 1940.0], [73.3, 1941.0], [73.4, 1942.0], [73.5, 1944.0], [73.6, 1952.0], [73.7, 1955.0], [73.8, 1959.0], [73.9, 1961.0], [74.0, 1967.0], [74.1, 1970.0], [74.2, 1973.0], [74.3, 1975.0], [74.4, 1977.0], [74.5, 1979.0], [74.6, 1981.0], [74.7, 1981.0], [74.8, 1984.0], [74.9, 1988.0], [75.0, 1991.0], [75.1, 1997.0], [75.2, 2002.0], [75.3, 2008.0], [75.4, 2010.0], [75.5, 2016.0], [75.6, 2020.0], [75.7, 2021.0], [75.8, 2022.0], [75.9, 2023.0], [76.0, 2027.0], [76.1, 2028.0], [76.2, 2036.0], [76.3, 2038.0], [76.4, 2044.0], [76.5, 2048.0], [76.6, 2048.0], [76.7, 2058.0], [76.8, 2064.0], [76.9, 2064.0], [77.0, 2068.0], [77.1, 2070.0], [77.2, 2072.0], [77.3, 2080.0], [77.4, 2086.0], [77.5, 2088.0], [77.6, 2090.0], [77.7, 2094.0], [77.8, 2098.0], [77.9, 2105.0], [78.0, 2108.0], [78.1, 2110.0], [78.2, 2112.0], [78.3, 2115.0], [78.4, 2118.0], [78.5, 2119.0], [78.6, 2122.0], [78.7, 2124.0], [78.8, 2125.0], [78.9, 2126.0], [79.0, 2128.0], [79.1, 2129.0], [79.2, 2130.0], [79.3, 2132.0], [79.4, 2133.0], [79.5, 2134.0], [79.6, 2139.0], [79.7, 2140.0], [79.8, 2141.0], [79.9, 2142.0], [80.0, 2146.0], [80.1, 2148.0], [80.2, 2151.0], [80.3, 2153.0], [80.4, 2156.0], [80.5, 2158.0], [80.6, 2161.0], [80.7, 2169.0], [80.8, 2172.0], [80.9, 2183.0], [81.0, 2183.0], [81.1, 2184.0], [81.2, 2191.0], [81.3, 2191.0], [81.4, 2194.0], [81.5, 2197.0], [81.6, 2201.0], [81.7, 2208.0], [81.8, 2211.0], [81.9, 2215.0], [82.0, 2219.0], [82.1, 2221.0], [82.2, 2222.0], [82.3, 2229.0], [82.4, 2239.0], [82.5, 2241.0], [82.6, 2244.0], [82.7, 2246.0], [82.8, 2251.0], [82.9, 2254.0], [83.0, 2257.0], [83.1, 2258.0], [83.2, 2262.0], [83.3, 2265.0], [83.4, 2269.0], [83.5, 2271.0], [83.6, 2272.0], [83.7, 2274.0], [83.8, 2277.0], [83.9, 2278.0], [84.0, 2284.0], [84.1, 2291.0], [84.2, 2293.0], [84.3, 2297.0], [84.4, 2298.0], [84.5, 2299.0], [84.6, 2310.0], [84.7, 2315.0], [84.8, 2319.0], [84.9, 2323.0], [85.0, 2332.0], [85.1, 2333.0], [85.2, 2340.0], [85.3, 2345.0], [85.4, 2348.0], [85.5, 2352.0], [85.6, 2353.0], [85.7, 2360.0], [85.8, 2364.0], [85.9, 2368.0], [86.0, 2369.0], [86.1, 2371.0], [86.2, 2374.0], [86.3, 2385.0], [86.4, 2386.0], [86.5, 2390.0], [86.6, 2399.0], [86.7, 2402.0], [86.8, 2407.0], [86.9, 2411.0], [87.0, 2416.0], [87.1, 2422.0], [87.2, 2428.0], [87.3, 2436.0], [87.4, 2440.0], [87.5, 2443.0], [87.6, 2461.0], [87.7, 2464.0], [87.8, 2467.0], [87.9, 2473.0], [88.0, 2479.0], [88.1, 2481.0], [88.2, 2484.0], [88.3, 2500.0], [88.4, 2504.0], [88.5, 2505.0], [88.6, 2512.0], [88.7, 2516.0], [88.8, 2520.0], [88.9, 2524.0], [89.0, 2529.0], [89.1, 2530.0], [89.2, 2533.0], [89.3, 2536.0], [89.4, 2539.0], [89.5, 2544.0], [89.6, 2546.0], [89.7, 2550.0], [89.8, 2566.0], [89.9, 2572.0], [90.0, 2573.0], [90.1, 2578.0], [90.2, 2583.0], [90.3, 2593.0], [90.4, 2599.0], [90.5, 2606.0], [90.6, 2607.0], [90.7, 2618.0], [90.8, 2621.0], [90.9, 2635.0], [91.0, 2643.0], [91.1, 2645.0], [91.2, 2646.0], [91.3, 2646.0], [91.4, 2647.0], [91.5, 2648.0], [91.6, 2649.0], [91.7, 2650.0], [91.8, 2652.0], [91.9, 2652.0], [92.0, 2656.0], [92.1, 2667.0], [92.2, 2673.0], [92.3, 2675.0], [92.4, 2679.0], [92.5, 2680.0], [92.6, 2685.0], [92.7, 2700.0], [92.8, 2703.0], [92.9, 2709.0], [93.0, 2721.0], [93.1, 2724.0], [93.2, 2728.0], [93.3, 2730.0], [93.4, 2734.0], [93.5, 2759.0], [93.6, 2762.0], [93.7, 2771.0], [93.8, 2774.0], [93.9, 2786.0], [94.0, 2791.0], [94.1, 2796.0], [94.2, 2802.0], [94.3, 2816.0], [94.4, 2833.0], [94.5, 2860.0], [94.6, 2863.0], [94.7, 2867.0], [94.8, 2874.0], [94.9, 2883.0], [95.0, 2891.0], [95.1, 2892.0], [95.2, 2896.0], [95.3, 2899.0], [95.4, 2909.0], [95.5, 2917.0], [95.6, 2928.0], [95.7, 2932.0], [95.8, 2938.0], [95.9, 2963.0], [96.0, 2980.0], [96.1, 2982.0], [96.2, 3003.0], [96.3, 3019.0], [96.4, 3025.0], [96.5, 3030.0], [96.6, 3047.0], [96.7, 3074.0], [96.8, 3085.0], [96.9, 3104.0], [97.0, 3135.0], [97.1, 3137.0], [97.2, 3147.0], [97.3, 3160.0], [97.4, 3180.0], [97.5, 3199.0], [97.6, 3208.0], [97.7, 3214.0], [97.8, 3223.0], [97.9, 3239.0], [98.0, 3284.0], [98.1, 3330.0], [98.2, 3345.0], [98.3, 3360.0], [98.4, 3412.0], [98.5, 3447.0], [98.6, 3466.0], [98.7, 3534.0], [98.8, 3551.0], [98.9, 3574.0], [99.0, 3642.0], [99.1, 3671.0], [99.2, 3714.0], [99.3, 3788.0], [99.4, 3847.0], [99.5, 3885.0], [99.6, 3941.0], [99.7, 3995.0], [99.8, 4095.0], [99.9, 4765.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 252.0, "series": [{"data": [[0.0, 252.0], [600.0, 14.0], [700.0, 12.0], [800.0, 12.0], [900.0, 19.0], [1000.0, 25.0], [1100.0, 25.0], [1200.0, 51.0], [1300.0, 46.0], [1400.0, 72.0], [1500.0, 66.0], [100.0, 244.0], [1600.0, 77.0], [1700.0, 71.0], [1800.0, 74.0], [1900.0, 75.0], [2000.0, 53.0], [2100.0, 75.0], [2200.0, 59.0], [2300.0, 43.0], [2400.0, 32.0], [2500.0, 43.0], [2600.0, 45.0], [2800.0, 23.0], [2700.0, 30.0], [2900.0, 16.0], [3000.0, 14.0], [3100.0, 14.0], [200.0, 155.0], [3200.0, 11.0], [3300.0, 6.0], [3400.0, 6.0], [3500.0, 6.0], [3700.0, 3.0], [3600.0, 4.0], [3800.0, 4.0], [3900.0, 4.0], [4000.0, 3.0], [300.0, 100.0], [4700.0, 1.0], [4800.0, 1.0], [400.0, 68.0], [500.0, 46.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 321.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 859.0, "series": [{"data": [[1.0, 321.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 820.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 859.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 222.62499999999997, "minX": 1.54960818E12, "maxY": 222.62499999999997, "series": [{"data": [[1.54960818E12, 222.62499999999997]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 60.0, "minX": 1.0, "maxY": 4828.0, "series": [{"data": [[3.0, 1831.0], [4.0, 1754.0], [5.0, 639.0], [6.0, 436.5], [7.0, 595.6666666666666], [8.0, 60.0], [9.0, 312.2307692307692], [10.0, 238.07692307692307], [11.0, 134.6315789473684], [12.0, 123.2], [13.0, 151.59090909090912], [14.0, 131.8846153846154], [15.0, 131.43243243243242], [16.0, 122.60606060606062], [17.0, 156.58620689655174], [18.0, 87.99999999999999], [19.0, 373.2307692307693], [20.0, 86.625], [21.0, 954.0], [22.0, 446.66666666666663], [23.0, 347.5], [24.0, 433.57142857142856], [25.0, 288.20000000000005], [26.0, 270.5], [27.0, 423.6666666666667], [28.0, 416.5], [29.0, 313.0], [30.0, 312.57142857142856], [31.0, 233.7391304347826], [33.0, 265.88235294117646], [32.0, 245.94444444444446], [35.0, 425.0], [34.0, 156.24999999999997], [37.0, 552.4], [36.0, 634.0], [39.0, 293.38461538461536], [38.0, 333.72727272727275], [41.0, 350.54545454545456], [40.0, 276.6875], [43.0, 358.66666666666663], [42.0, 698.8], [45.0, 408.3636363636364], [44.0, 500.2], [46.0, 222.75], [47.0, 827.0], [48.0, 382.8], [49.0, 217.15], [50.0, 420.4117647058823], [51.0, 428.42857142857144], [53.0, 583.5], [52.0, 483.83333333333337], [55.0, 476.66666666666663], [54.0, 482.1666666666667], [56.0, 488.5], [57.0, 258.0], [58.0, 721.0], [59.0, 1685.0], [61.0, 553.4285714285714], [60.0, 743.0], [62.0, 510.8], [63.0, 434.5], [64.0, 225.33333333333334], [66.0, 810.0], [65.0, 977.5], [67.0, 430.0], [71.0, 259.5], [69.0, 317.75], [68.0, 432.33333333333337], [70.0, 2050.0], [74.0, 605.5], [75.0, 506.33333333333337], [73.0, 782.3333333333333], [72.0, 2555.0], [76.0, 514.8333333333334], [78.0, 743.5], [77.0, 1008.5], [79.0, 338.5], [80.0, 1094.0], [83.0, 1068.5], [82.0, 1919.0], [81.0, 1895.0], [87.0, 586.1428571428572], [86.0, 307.0], [85.0, 1482.0], [84.0, 431.5], [89.0, 576.9090909090909], [88.0, 586.8333333333333], [91.0, 374.33333333333337], [90.0, 526.8888888888889], [94.0, 656.7142857142858], [93.0, 358.0], [92.0, 1019.0], [95.0, 1169.0], [97.0, 1102.0], [96.0, 430.0], [98.0, 664.7142857142858], [99.0, 1079.6666666666665], [100.0, 599.4285714285714], [102.0, 973.0], [101.0, 1563.0], [103.0, 1132.5], [105.0, 686.3333333333334], [104.0, 736.3333333333333], [106.0, 1146.0], [107.0, 800.75], [111.0, 663.0], [110.0, 786.75], [109.0, 1266.5], [108.0, 2265.0], [112.0, 945.5], [113.0, 556.1666666666667], [115.0, 1606.5], [114.0, 832.3333333333333], [116.0, 1179.3333333333335], [117.0, 664.3333333333333], [119.0, 588.5294117647059], [118.0, 562.2307692307693], [121.0, 684.5], [120.0, 687.3333333333334], [123.0, 617.5], [122.0, 2211.0], [127.0, 601.0], [126.0, 789.2], [125.0, 873.25], [124.0, 1700.5], [128.0, 1034.6666666666665], [130.0, 964.0], [129.0, 1093.6666666666665], [132.0, 1543.0], [131.0, 1329.5], [133.0, 1093.0], [135.0, 686.8333333333333], [134.0, 1676.0], [136.0, 849.6], [143.0, 1497.0], [142.0, 2635.0], [141.0, 1745.0], [140.0, 2762.0], [139.0, 2068.0], [138.0, 1794.0], [137.0, 1856.0], [151.0, 1945.0], [150.0, 1937.0], [149.0, 1523.0], [148.0, 1628.0], [147.0, 2396.0], [146.0, 1684.5], [144.0, 2504.0], [159.0, 1603.0], [158.0, 2505.0], [157.0, 1855.0], [156.0, 1432.0], [155.0, 1840.0], [154.0, 2139.0], [153.0, 1787.0], [152.0, 1373.0], [167.0, 1561.0], [166.0, 2148.0], [165.0, 1870.0], [164.0, 1938.0], [163.0, 2428.0], [162.0, 2541.0], [161.0, 1416.0], [160.0, 1620.0], [175.0, 2088.0], [174.0, 2021.0], [173.0, 1694.0], [172.0, 1760.0], [170.0, 2289.5], [168.0, 2573.0], [183.0, 1833.0], [182.0, 2021.0], [181.0, 2728.0], [180.0, 3160.0], [179.0, 2070.0], [178.0, 2440.0], [177.0, 2067.0], [176.0, 2340.0], [191.0, 2333.0], [190.0, 1869.0], [189.0, 3024.0], [188.0, 2439.0], [187.0, 1493.0], [186.0, 3014.0], [185.0, 2864.0], [184.0, 2132.0], [199.0, 1690.0], [198.0, 1502.0], [197.0, 1646.0], [196.0, 3195.0], [195.0, 2295.0], [194.0, 2928.0], [193.0, 1382.0], [192.0, 1779.0], [206.0, 2523.0], [205.0, 2523.5], [203.0, 2245.0], [202.0, 2353.0], [201.0, 2158.0], [200.0, 2650.0], [215.0, 2667.0], [214.0, 1639.0], [213.0, 1337.0], [212.0, 3208.0], [211.0, 2025.5], [209.0, 2802.0], [208.0, 1956.0], [223.0, 2968.0], [222.0, 1940.0], [221.0, 2674.0], [220.0, 2216.0], [219.0, 1661.0], [218.0, 2080.0], [216.0, 1870.0], [231.0, 2726.0], [230.0, 1854.0], [229.0, 2088.0], [228.0, 2044.0], [227.0, 2141.0], [226.0, 1597.0], [225.0, 2281.0], [239.0, 2191.0], [238.0, 2721.0], [237.0, 1932.0], [236.0, 1597.5], [234.0, 2097.0], [233.0, 1680.0], [232.0, 4828.0], [247.0, 2115.0], [246.0, 2479.0], [245.0, 2299.0], [244.0, 2898.0], [243.0, 1725.0], [242.0, 2038.0], [241.0, 1789.0], [255.0, 2751.0], [254.0, 2197.0], [253.0, 2646.0], [252.0, 2473.0], [251.0, 3284.0], [250.0, 2191.0], [249.0, 1788.0], [248.0, 2090.0], [270.0, 3208.0], [271.0, 4765.0], [269.0, 1935.0], [268.0, 2002.0], [267.0, 2475.0], [265.0, 3199.0], [264.0, 2048.0], [263.0, 1901.0], [257.0, 2477.0], [256.0, 2676.0], [259.0, 2352.0], [258.0, 1432.0], [262.0, 1913.0], [261.0, 1556.0], [260.0, 2530.0], [287.0, 1412.0], [279.0, 1664.0], [280.0, 2004.5], [281.0, 1580.0], [278.0, 1407.6], [277.0, 1368.8], [285.0, 1685.5], [286.0, 2142.0], [284.0, 1912.0], [275.0, 2735.5], [273.0, 1768.0], [272.0, 2019.0], [283.0, 1763.0], [282.0, 2129.0], [291.0, 1804.0], [292.0, 1501.0], [293.0, 1879.0], [295.0, 1192.6], [290.0, 2721.0], [289.0, 2673.5], [294.0, 1805.0], [296.0, 2611.0], [298.0, 1934.5], [297.0, 1769.0], [299.0, 1582.0], [302.0, 1304.8823529411764], [303.0, 1309.7333333333333], [301.0, 1475.0], [300.0, 1745.0], [305.0, 1515.5714285714284], [306.0, 1434.8], [307.0, 2141.0], [317.0, 1551.0], [318.0, 1927.0], [319.0, 2371.5], [316.0, 1427.1666666666665], [304.0, 1304.4166666666667], [308.0, 1616.0], [309.0, 2139.0], [310.0, 2184.5], [311.0, 1580.5], [313.0, 1492.3333333333333], [312.0, 2003.5], [314.0, 1476.0], [315.0, 1742.0], [321.0, 1550.3333333333333], [320.0, 1728.5], [322.0, 1359.5], [323.0, 1691.3333333333335], [324.0, 1717.3333333333333], [326.0, 1686.0], [325.0, 1424.0], [327.0, 1332.75], [330.0, 1753.6666666666667], [331.0, 1781.0], [335.0, 1660.0], [329.0, 3574.0], [328.0, 1651.0], [332.0, 2067.5], [333.0, 2197.0], [334.0, 1966.0], [339.0, 1582.5], [336.0, 1553.3333333333333], [340.0, 1516.7142857142858], [338.0, 2076.5], [337.0, 2201.0], [341.0, 1775.5], [342.0, 1436.0], [343.0, 1617.0], [344.0, 1365.0], [347.0, 1819.3333333333333], [346.0, 2360.0], [345.0, 2352.5], [350.0, 1651.0], [349.0, 2355.0], [348.0, 1825.0], [351.0, 1614.6666666666667], [365.0, 1524.75], [354.0, 1500.0], [352.0, 1567.0], [353.0, 3135.0], [355.0, 1372.8333333333333], [364.0, 2199.0], [366.0, 1814.3333333333333], [367.0, 1878.6666666666667], [358.0, 2287.0], [357.0, 1810.0], [356.0, 2222.0], [360.0, 1598.0], [359.0, 1468.5], [361.0, 1715.3333333333333], [362.0, 1583.0], [363.0, 1875.0], [380.0, 2404.5], [373.0, 1611.6666666666667], [372.0, 1697.5], [375.0, 1459.0], [371.0, 2372.0], [370.0, 1812.0], [369.0, 1844.0], [368.0, 2087.0], [374.0, 2645.0], [376.0, 1559.5], [377.0, 1879.5], [378.0, 1479.5], [379.0, 2478.5], [383.0, 1481.2], [382.0, 1406.857142857143], [381.0, 2533.0], [397.0, 2536.0], [384.0, 1606.0], [385.0, 1450.0], [388.0, 1601.5], [391.0, 1612.875], [392.0, 1962.6666666666667], [390.0, 1966.4], [389.0, 2917.0], [395.0, 2225.5], [394.0, 2782.0], [393.0, 1961.0], [399.0, 2113.0], [396.0, 2258.0], [387.0, 2781.5], [403.0, 2042.0], [400.0, 1432.0], [402.0, 1883.0], [401.0, 2656.0], [404.0, 1336.5], [405.0, 1744.0], [406.0, 1959.6666666666665], [407.0, 1849.0], [413.0, 2149.8], [412.0, 2124.0], [414.0, 1574.0], [415.0, 1592.0], [409.0, 1687.0], [408.0, 2411.0], [411.0, 3027.0], [410.0, 2532.0], [416.0, 1907.5], [421.0, 1482.0], [420.0, 2370.3333333333335], [424.0, 1836.75], [423.0, 1734.5], [422.0, 2524.0], [426.0, 1679.0], [425.0, 2251.5], [428.0, 1889.3333333333333], [418.0, 1842.0], [417.0, 3120.0], [430.0, 2416.0], [429.0, 4098.0], [431.0, 1840.0], [427.0, 1701.0], [444.0, 1876.888888888889], [440.0, 1762.0], [439.0, 1800.1666666666665], [433.0, 1341.0], [432.0, 4095.0], [435.0, 2407.0], [434.0, 3001.0], [438.0, 1835.0], [437.0, 2412.0], [436.0, 2290.0], [441.0, 1392.6], [442.0, 1514.5], [443.0, 1925.5], [445.0, 1903.6666666666667], [446.0, 2426.0], [447.0, 2071.0], [462.0, 1997.0], [449.0, 1507.6666666666667], [450.0, 1799.3333333333333], [461.0, 3357.5], [451.0, 2271.0], [463.0, 2652.0], [454.0, 1735.3333333333333], [453.0, 1871.0], [452.0, 2646.0], [456.0, 1690.0], [455.0, 2323.6666666666665], [448.0, 2539.0], [457.0, 1837.2], [459.0, 2088.3333333333335], [458.0, 1918.4], [477.0, 2339.0], [466.0, 1696.0], [467.0, 2259.75], [476.0, 2948.0], [469.0, 1752.5], [471.0, 1855.0], [465.0, 3968.0], [464.0, 2645.0], [470.0, 1836.0], [468.0, 1795.6666666666667], [473.0, 1885.0], [474.0, 1936.857142857143], [472.0, 2206.0], [478.0, 1232.6666666666667], [475.0, 1753.0], [480.0, 1616.3333333333333], [482.0, 2678.6666666666665], [481.0, 2129.0], [483.0, 2257.0], [484.0, 1568.75], [485.0, 1987.5], [486.0, 1852.6666666666667], [487.0, 1558.0], [491.0, 1971.25], [492.0, 2116.5], [490.0, 1828.8], [494.0, 1975.3333333333333], [493.0, 2291.25], [495.0, 2103.2], [489.0, 1852.5], [488.0, 2724.0], [497.0, 2094.0], [496.0, 2638.0], [498.0, 2139.0], [502.0, 2908.3333333333335], [501.0, 1838.3333333333335], [503.0, 1822.75], [500.0, 2065.5], [499.0, 2163.3333333333335], [504.0, 2815.6666666666665], [505.0, 2133.0], [511.0, 2288.2], [510.0, 2233.625], [509.0, 2081.5], [508.0, 1986.0], [506.0, 3029.5], [507.0, 2339.1666666666665], [518.0, 2448.0], [513.0, 1965.5263157894738], [512.0, 2120.166666666667], [527.0, 3211.0], [526.0, 1886.0], [523.0, 2826.5], [522.0, 3885.0], [524.0, 2386.25], [525.0, 2519.5], [514.0, 2272.9090909090905], [516.0, 1995.642857142857], [517.0, 1864.375], [515.0, 1842.142857142857], [520.0, 2447.0], [521.0, 1998.3333333333333], [519.0, 2175.0], [536.0, 1277.0], [538.0, 2719.5], [539.0, 2364.0], [540.0, 2585.0], [543.0, 2139.6666666666665], [542.0, 2489.909090909091], [541.0, 2239.1538461538457], [537.0, 2544.3333333333335], [528.0, 3007.5], [530.0, 2151.5], [531.0, 2880.0], [532.0, 2343.0], [534.0, 2997.0], [535.0, 3674.0], [533.0, 2603.0], [529.0, 2205.0], [545.0, 2300.6111111111113], [546.0, 2112.5454545454545], [547.0, 2363.0], [544.0, 2767.1666666666665], [548.0, 1949.5], [1.0, 1724.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[222.62499999999997, 1209.5515000000016]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 548.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8400.0, "minX": 1.54960818E12, "maxY": 14031.083333333334, "series": [{"data": [[1.54960818E12, 14031.083333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960818E12, 8400.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1209.5515000000016, "minX": 1.54960818E12, "maxY": 1209.5515000000016, "series": [{"data": [[1.54960818E12, 1209.5515000000016]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960818E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1209.5375000000004, "minX": 1.54960818E12, "maxY": 1209.5375000000004, "series": [{"data": [[1.54960818E12, 1209.5375000000004]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960818E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 45.36950000000004, "minX": 1.54960818E12, "maxY": 45.36950000000004, "series": [{"data": [[1.54960818E12, 45.36950000000004]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960818E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 35.0, "minX": 1.54960818E12, "maxY": 4828.0, "series": [{"data": [[1.54960818E12, 4828.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960818E12, 35.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960818E12, 2573.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960818E12, 3641.4000000000005]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960818E12, 2890.6499999999987]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1255.0, "minX": 33.0, "maxY": 1255.0, "series": [{"data": [[33.0, 1255.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1255.0, "minX": 33.0, "maxY": 1255.0, "series": [{"data": [[33.0, 1255.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960818E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960818E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960818E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960818E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960818E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960818E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960818E12, "title": "Transactions Per Second"}},
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
