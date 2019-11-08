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
        data: {"result": {"minY": 46.0, "minX": 0.0, "maxY": 4621.0, "series": [{"data": [[0.0, 46.0], [0.1, 49.0], [0.2, 50.0], [0.3, 50.0], [0.4, 51.0], [0.5, 53.0], [0.6, 53.0], [0.7, 53.0], [0.8, 54.0], [0.9, 54.0], [1.0, 55.0], [1.1, 55.0], [1.2, 55.0], [1.3, 56.0], [1.4, 57.0], [1.5, 58.0], [1.6, 58.0], [1.7, 59.0], [1.8, 59.0], [1.9, 59.0], [2.0, 60.0], [2.1, 60.0], [2.2, 60.0], [2.3, 60.0], [2.4, 60.0], [2.5, 61.0], [2.6, 61.0], [2.7, 61.0], [2.8, 63.0], [2.9, 63.0], [3.0, 64.0], [3.1, 65.0], [3.2, 65.0], [3.3, 66.0], [3.4, 67.0], [3.5, 69.0], [3.6, 69.0], [3.7, 70.0], [3.8, 70.0], [3.9, 72.0], [4.0, 74.0], [4.1, 75.0], [4.2, 76.0], [4.3, 76.0], [4.4, 77.0], [4.5, 78.0], [4.6, 80.0], [4.7, 81.0], [4.8, 83.0], [4.9, 84.0], [5.0, 85.0], [5.1, 87.0], [5.2, 87.0], [5.3, 88.0], [5.4, 89.0], [5.5, 89.0], [5.6, 89.0], [5.7, 90.0], [5.8, 90.0], [5.9, 90.0], [6.0, 91.0], [6.1, 91.0], [6.2, 92.0], [6.3, 92.0], [6.4, 93.0], [6.5, 93.0], [6.6, 94.0], [6.7, 94.0], [6.8, 94.0], [6.9, 95.0], [7.0, 95.0], [7.1, 96.0], [7.2, 97.0], [7.3, 97.0], [7.4, 97.0], [7.5, 99.0], [7.6, 100.0], [7.7, 101.0], [7.8, 102.0], [7.9, 102.0], [8.0, 103.0], [8.1, 104.0], [8.2, 104.0], [8.3, 105.0], [8.4, 106.0], [8.5, 106.0], [8.6, 107.0], [8.7, 108.0], [8.8, 108.0], [8.9, 109.0], [9.0, 111.0], [9.1, 112.0], [9.2, 112.0], [9.3, 113.0], [9.4, 113.0], [9.5, 115.0], [9.6, 115.0], [9.7, 116.0], [9.8, 118.0], [9.9, 119.0], [10.0, 120.0], [10.1, 121.0], [10.2, 121.0], [10.3, 121.0], [10.4, 123.0], [10.5, 124.0], [10.6, 124.0], [10.7, 126.0], [10.8, 127.0], [10.9, 131.0], [11.0, 134.0], [11.1, 134.0], [11.2, 136.0], [11.3, 137.0], [11.4, 137.0], [11.5, 139.0], [11.6, 140.0], [11.7, 140.0], [11.8, 142.0], [11.9, 142.0], [12.0, 143.0], [12.1, 144.0], [12.2, 145.0], [12.3, 146.0], [12.4, 147.0], [12.5, 148.0], [12.6, 149.0], [12.7, 150.0], [12.8, 151.0], [12.9, 152.0], [13.0, 152.0], [13.1, 154.0], [13.2, 155.0], [13.3, 156.0], [13.4, 158.0], [13.5, 160.0], [13.6, 161.0], [13.7, 162.0], [13.8, 163.0], [13.9, 164.0], [14.0, 165.0], [14.1, 166.0], [14.2, 167.0], [14.3, 168.0], [14.4, 169.0], [14.5, 170.0], [14.6, 171.0], [14.7, 173.0], [14.8, 175.0], [14.9, 177.0], [15.0, 177.0], [15.1, 179.0], [15.2, 180.0], [15.3, 183.0], [15.4, 186.0], [15.5, 189.0], [15.6, 190.0], [15.7, 191.0], [15.8, 192.0], [15.9, 192.0], [16.0, 192.0], [16.1, 194.0], [16.2, 194.0], [16.3, 195.0], [16.4, 196.0], [16.5, 197.0], [16.6, 198.0], [16.7, 199.0], [16.8, 199.0], [16.9, 200.0], [17.0, 201.0], [17.1, 203.0], [17.2, 204.0], [17.3, 205.0], [17.4, 206.0], [17.5, 206.0], [17.6, 207.0], [17.7, 208.0], [17.8, 209.0], [17.9, 210.0], [18.0, 211.0], [18.1, 212.0], [18.2, 214.0], [18.3, 215.0], [18.4, 215.0], [18.5, 216.0], [18.6, 216.0], [18.7, 216.0], [18.8, 217.0], [18.9, 218.0], [19.0, 219.0], [19.1, 220.0], [19.2, 221.0], [19.3, 223.0], [19.4, 223.0], [19.5, 224.0], [19.6, 224.0], [19.7, 225.0], [19.8, 227.0], [19.9, 230.0], [20.0, 231.0], [20.1, 234.0], [20.2, 234.0], [20.3, 236.0], [20.4, 236.0], [20.5, 236.0], [20.6, 238.0], [20.7, 238.0], [20.8, 239.0], [20.9, 240.0], [21.0, 240.0], [21.1, 241.0], [21.2, 242.0], [21.3, 243.0], [21.4, 244.0], [21.5, 245.0], [21.6, 247.0], [21.7, 248.0], [21.8, 249.0], [21.9, 250.0], [22.0, 252.0], [22.1, 253.0], [22.2, 255.0], [22.3, 257.0], [22.4, 257.0], [22.5, 258.0], [22.6, 259.0], [22.7, 261.0], [22.8, 262.0], [22.9, 262.0], [23.0, 262.0], [23.1, 263.0], [23.2, 264.0], [23.3, 265.0], [23.4, 267.0], [23.5, 267.0], [23.6, 268.0], [23.7, 269.0], [23.8, 270.0], [23.9, 272.0], [24.0, 274.0], [24.1, 275.0], [24.2, 276.0], [24.3, 277.0], [24.4, 277.0], [24.5, 281.0], [24.6, 281.0], [24.7, 282.0], [24.8, 284.0], [24.9, 285.0], [25.0, 286.0], [25.1, 287.0], [25.2, 287.0], [25.3, 287.0], [25.4, 288.0], [25.5, 288.0], [25.6, 289.0], [25.7, 290.0], [25.8, 291.0], [25.9, 291.0], [26.0, 292.0], [26.1, 294.0], [26.2, 294.0], [26.3, 295.0], [26.4, 296.0], [26.5, 296.0], [26.6, 298.0], [26.7, 299.0], [26.8, 300.0], [26.9, 302.0], [27.0, 302.0], [27.1, 303.0], [27.2, 304.0], [27.3, 305.0], [27.4, 307.0], [27.5, 309.0], [27.6, 310.0], [27.7, 310.0], [27.8, 310.0], [27.9, 311.0], [28.0, 314.0], [28.1, 315.0], [28.2, 315.0], [28.3, 316.0], [28.4, 318.0], [28.5, 321.0], [28.6, 321.0], [28.7, 322.0], [28.8, 323.0], [28.9, 323.0], [29.0, 325.0], [29.1, 327.0], [29.2, 328.0], [29.3, 330.0], [29.4, 331.0], [29.5, 332.0], [29.6, 332.0], [29.7, 333.0], [29.8, 335.0], [29.9, 336.0], [30.0, 337.0], [30.1, 339.0], [30.2, 339.0], [30.3, 342.0], [30.4, 343.0], [30.5, 344.0], [30.6, 345.0], [30.7, 346.0], [30.8, 348.0], [30.9, 349.0], [31.0, 352.0], [31.1, 353.0], [31.2, 353.0], [31.3, 355.0], [31.4, 355.0], [31.5, 356.0], [31.6, 356.0], [31.7, 360.0], [31.8, 360.0], [31.9, 362.0], [32.0, 363.0], [32.1, 364.0], [32.2, 364.0], [32.3, 367.0], [32.4, 369.0], [32.5, 370.0], [32.6, 372.0], [32.7, 377.0], [32.8, 378.0], [32.9, 378.0], [33.0, 380.0], [33.1, 383.0], [33.2, 386.0], [33.3, 389.0], [33.4, 392.0], [33.5, 395.0], [33.6, 395.0], [33.7, 397.0], [33.8, 398.0], [33.9, 402.0], [34.0, 403.0], [34.1, 405.0], [34.2, 406.0], [34.3, 407.0], [34.4, 410.0], [34.5, 412.0], [34.6, 413.0], [34.7, 416.0], [34.8, 416.0], [34.9, 417.0], [35.0, 417.0], [35.1, 421.0], [35.2, 423.0], [35.3, 424.0], [35.4, 425.0], [35.5, 427.0], [35.6, 429.0], [35.7, 433.0], [35.8, 435.0], [35.9, 438.0], [36.0, 445.0], [36.1, 449.0], [36.2, 450.0], [36.3, 452.0], [36.4, 454.0], [36.5, 457.0], [36.6, 457.0], [36.7, 460.0], [36.8, 461.0], [36.9, 462.0], [37.0, 465.0], [37.1, 466.0], [37.2, 468.0], [37.3, 471.0], [37.4, 475.0], [37.5, 476.0], [37.6, 477.0], [37.7, 478.0], [37.8, 482.0], [37.9, 483.0], [38.0, 483.0], [38.1, 488.0], [38.2, 489.0], [38.3, 490.0], [38.4, 495.0], [38.5, 496.0], [38.6, 498.0], [38.7, 500.0], [38.8, 503.0], [38.9, 506.0], [39.0, 509.0], [39.1, 509.0], [39.2, 511.0], [39.3, 514.0], [39.4, 519.0], [39.5, 521.0], [39.6, 529.0], [39.7, 530.0], [39.8, 531.0], [39.9, 533.0], [40.0, 535.0], [40.1, 539.0], [40.2, 539.0], [40.3, 546.0], [40.4, 549.0], [40.5, 551.0], [40.6, 552.0], [40.7, 555.0], [40.8, 556.0], [40.9, 563.0], [41.0, 567.0], [41.1, 572.0], [41.2, 576.0], [41.3, 579.0], [41.4, 584.0], [41.5, 586.0], [41.6, 591.0], [41.7, 596.0], [41.8, 597.0], [41.9, 600.0], [42.0, 601.0], [42.1, 607.0], [42.2, 618.0], [42.3, 622.0], [42.4, 627.0], [42.5, 630.0], [42.6, 632.0], [42.7, 635.0], [42.8, 637.0], [42.9, 645.0], [43.0, 650.0], [43.1, 653.0], [43.2, 659.0], [43.3, 667.0], [43.4, 671.0], [43.5, 672.0], [43.6, 674.0], [43.7, 678.0], [43.8, 684.0], [43.9, 688.0], [44.0, 691.0], [44.1, 695.0], [44.2, 700.0], [44.3, 712.0], [44.4, 723.0], [44.5, 730.0], [44.6, 742.0], [44.7, 745.0], [44.8, 753.0], [44.9, 765.0], [45.0, 780.0], [45.1, 786.0], [45.2, 795.0], [45.3, 796.0], [45.4, 797.0], [45.5, 802.0], [45.6, 816.0], [45.7, 826.0], [45.8, 851.0], [45.9, 864.0], [46.0, 876.0], [46.1, 890.0], [46.2, 899.0], [46.3, 913.0], [46.4, 924.0], [46.5, 948.0], [46.6, 954.0], [46.7, 964.0], [46.8, 966.0], [46.9, 982.0], [47.0, 997.0], [47.1, 1023.0], [47.2, 1028.0], [47.3, 1034.0], [47.4, 1055.0], [47.5, 1067.0], [47.6, 1079.0], [47.7, 1088.0], [47.8, 1099.0], [47.9, 1116.0], [48.0, 1133.0], [48.1, 1143.0], [48.2, 1144.0], [48.3, 1150.0], [48.4, 1159.0], [48.5, 1161.0], [48.6, 1169.0], [48.7, 1172.0], [48.8, 1182.0], [48.9, 1183.0], [49.0, 1188.0], [49.1, 1194.0], [49.2, 1197.0], [49.3, 1201.0], [49.4, 1203.0], [49.5, 1208.0], [49.6, 1213.0], [49.7, 1214.0], [49.8, 1219.0], [49.9, 1227.0], [50.0, 1228.0], [50.1, 1232.0], [50.2, 1237.0], [50.3, 1240.0], [50.4, 1241.0], [50.5, 1244.0], [50.6, 1246.0], [50.7, 1251.0], [50.8, 1259.0], [50.9, 1266.0], [51.0, 1270.0], [51.1, 1276.0], [51.2, 1287.0], [51.3, 1293.0], [51.4, 1297.0], [51.5, 1299.0], [51.6, 1301.0], [51.7, 1306.0], [51.8, 1311.0], [51.9, 1314.0], [52.0, 1318.0], [52.1, 1323.0], [52.2, 1324.0], [52.3, 1327.0], [52.4, 1334.0], [52.5, 1338.0], [52.6, 1343.0], [52.7, 1347.0], [52.8, 1349.0], [52.9, 1351.0], [53.0, 1353.0], [53.1, 1356.0], [53.2, 1359.0], [53.3, 1362.0], [53.4, 1363.0], [53.5, 1369.0], [53.6, 1371.0], [53.7, 1373.0], [53.8, 1385.0], [53.9, 1391.0], [54.0, 1393.0], [54.1, 1399.0], [54.2, 1401.0], [54.3, 1404.0], [54.4, 1405.0], [54.5, 1412.0], [54.6, 1413.0], [54.7, 1416.0], [54.8, 1424.0], [54.9, 1426.0], [55.0, 1428.0], [55.1, 1432.0], [55.2, 1435.0], [55.3, 1439.0], [55.4, 1441.0], [55.5, 1445.0], [55.6, 1453.0], [55.7, 1461.0], [55.8, 1464.0], [55.9, 1468.0], [56.0, 1471.0], [56.1, 1473.0], [56.2, 1474.0], [56.3, 1475.0], [56.4, 1483.0], [56.5, 1486.0], [56.6, 1493.0], [56.7, 1495.0], [56.8, 1497.0], [56.9, 1500.0], [57.0, 1504.0], [57.1, 1511.0], [57.2, 1512.0], [57.3, 1514.0], [57.4, 1515.0], [57.5, 1518.0], [57.6, 1518.0], [57.7, 1522.0], [57.8, 1527.0], [57.9, 1530.0], [58.0, 1532.0], [58.1, 1532.0], [58.2, 1534.0], [58.3, 1539.0], [58.4, 1544.0], [58.5, 1546.0], [58.6, 1547.0], [58.7, 1559.0], [58.8, 1564.0], [58.9, 1567.0], [59.0, 1569.0], [59.1, 1576.0], [59.2, 1579.0], [59.3, 1582.0], [59.4, 1588.0], [59.5, 1594.0], [59.6, 1597.0], [59.7, 1599.0], [59.8, 1602.0], [59.9, 1606.0], [60.0, 1608.0], [60.1, 1612.0], [60.2, 1613.0], [60.3, 1614.0], [60.4, 1616.0], [60.5, 1618.0], [60.6, 1620.0], [60.7, 1625.0], [60.8, 1629.0], [60.9, 1633.0], [61.0, 1634.0], [61.1, 1635.0], [61.2, 1636.0], [61.3, 1642.0], [61.4, 1643.0], [61.5, 1648.0], [61.6, 1649.0], [61.7, 1652.0], [61.8, 1654.0], [61.9, 1662.0], [62.0, 1666.0], [62.1, 1667.0], [62.2, 1669.0], [62.3, 1669.0], [62.4, 1670.0], [62.5, 1671.0], [62.6, 1673.0], [62.7, 1675.0], [62.8, 1678.0], [62.9, 1679.0], [63.0, 1681.0], [63.1, 1683.0], [63.2, 1684.0], [63.3, 1689.0], [63.4, 1689.0], [63.5, 1690.0], [63.6, 1693.0], [63.7, 1698.0], [63.8, 1701.0], [63.9, 1704.0], [64.0, 1704.0], [64.1, 1709.0], [64.2, 1712.0], [64.3, 1714.0], [64.4, 1717.0], [64.5, 1721.0], [64.6, 1727.0], [64.7, 1731.0], [64.8, 1732.0], [64.9, 1735.0], [65.0, 1737.0], [65.1, 1738.0], [65.2, 1744.0], [65.3, 1748.0], [65.4, 1751.0], [65.5, 1755.0], [65.6, 1758.0], [65.7, 1761.0], [65.8, 1764.0], [65.9, 1771.0], [66.0, 1775.0], [66.1, 1775.0], [66.2, 1777.0], [66.3, 1777.0], [66.4, 1779.0], [66.5, 1780.0], [66.6, 1783.0], [66.7, 1786.0], [66.8, 1790.0], [66.9, 1791.0], [67.0, 1792.0], [67.1, 1794.0], [67.2, 1797.0], [67.3, 1799.0], [67.4, 1801.0], [67.5, 1802.0], [67.6, 1803.0], [67.7, 1806.0], [67.8, 1807.0], [67.9, 1809.0], [68.0, 1811.0], [68.1, 1813.0], [68.2, 1815.0], [68.3, 1819.0], [68.4, 1820.0], [68.5, 1823.0], [68.6, 1826.0], [68.7, 1828.0], [68.8, 1829.0], [68.9, 1830.0], [69.0, 1839.0], [69.1, 1843.0], [69.2, 1846.0], [69.3, 1849.0], [69.4, 1849.0], [69.5, 1856.0], [69.6, 1859.0], [69.7, 1861.0], [69.8, 1863.0], [69.9, 1864.0], [70.0, 1868.0], [70.1, 1869.0], [70.2, 1876.0], [70.3, 1878.0], [70.4, 1886.0], [70.5, 1887.0], [70.6, 1887.0], [70.7, 1893.0], [70.8, 1896.0], [70.9, 1897.0], [71.0, 1899.0], [71.1, 1901.0], [71.2, 1902.0], [71.3, 1903.0], [71.4, 1906.0], [71.5, 1909.0], [71.6, 1913.0], [71.7, 1918.0], [71.8, 1919.0], [71.9, 1921.0], [72.0, 1923.0], [72.1, 1927.0], [72.2, 1929.0], [72.3, 1930.0], [72.4, 1936.0], [72.5, 1937.0], [72.6, 1939.0], [72.7, 1943.0], [72.8, 1944.0], [72.9, 1945.0], [73.0, 1946.0], [73.1, 1950.0], [73.2, 1955.0], [73.3, 1960.0], [73.4, 1962.0], [73.5, 1962.0], [73.6, 1964.0], [73.7, 1964.0], [73.8, 1964.0], [73.9, 1967.0], [74.0, 1971.0], [74.1, 1973.0], [74.2, 1977.0], [74.3, 1978.0], [74.4, 1980.0], [74.5, 1984.0], [74.6, 1984.0], [74.7, 1986.0], [74.8, 1991.0], [74.9, 1995.0], [75.0, 1996.0], [75.1, 1999.0], [75.2, 2003.0], [75.3, 2006.0], [75.4, 2014.0], [75.5, 2015.0], [75.6, 2020.0], [75.7, 2026.0], [75.8, 2027.0], [75.9, 2031.0], [76.0, 2033.0], [76.1, 2036.0], [76.2, 2038.0], [76.3, 2048.0], [76.4, 2049.0], [76.5, 2050.0], [76.6, 2051.0], [76.7, 2052.0], [76.8, 2053.0], [76.9, 2055.0], [77.0, 2058.0], [77.1, 2058.0], [77.2, 2059.0], [77.3, 2060.0], [77.4, 2064.0], [77.5, 2069.0], [77.6, 2071.0], [77.7, 2075.0], [77.8, 2081.0], [77.9, 2083.0], [78.0, 2084.0], [78.1, 2088.0], [78.2, 2091.0], [78.3, 2093.0], [78.4, 2095.0], [78.5, 2098.0], [78.6, 2102.0], [78.7, 2102.0], [78.8, 2103.0], [78.9, 2104.0], [79.0, 2105.0], [79.1, 2113.0], [79.2, 2115.0], [79.3, 2116.0], [79.4, 2117.0], [79.5, 2128.0], [79.6, 2130.0], [79.7, 2137.0], [79.8, 2141.0], [79.9, 2148.0], [80.0, 2152.0], [80.1, 2156.0], [80.2, 2157.0], [80.3, 2159.0], [80.4, 2161.0], [80.5, 2162.0], [80.6, 2165.0], [80.7, 2166.0], [80.8, 2168.0], [80.9, 2172.0], [81.0, 2180.0], [81.1, 2183.0], [81.2, 2184.0], [81.3, 2191.0], [81.4, 2195.0], [81.5, 2197.0], [81.6, 2198.0], [81.7, 2205.0], [81.8, 2206.0], [81.9, 2212.0], [82.0, 2213.0], [82.1, 2215.0], [82.2, 2219.0], [82.3, 2222.0], [82.4, 2225.0], [82.5, 2228.0], [82.6, 2228.0], [82.7, 2233.0], [82.8, 2234.0], [82.9, 2236.0], [83.0, 2238.0], [83.1, 2239.0], [83.2, 2245.0], [83.3, 2249.0], [83.4, 2255.0], [83.5, 2264.0], [83.6, 2265.0], [83.7, 2270.0], [83.8, 2272.0], [83.9, 2276.0], [84.0, 2281.0], [84.1, 2285.0], [84.2, 2287.0], [84.3, 2292.0], [84.4, 2295.0], [84.5, 2306.0], [84.6, 2307.0], [84.7, 2310.0], [84.8, 2313.0], [84.9, 2314.0], [85.0, 2316.0], [85.1, 2321.0], [85.2, 2322.0], [85.3, 2325.0], [85.4, 2326.0], [85.5, 2340.0], [85.6, 2341.0], [85.7, 2343.0], [85.8, 2346.0], [85.9, 2347.0], [86.0, 2349.0], [86.1, 2355.0], [86.2, 2365.0], [86.3, 2366.0], [86.4, 2370.0], [86.5, 2371.0], [86.6, 2376.0], [86.7, 2379.0], [86.8, 2380.0], [86.9, 2382.0], [87.0, 2393.0], [87.1, 2395.0], [87.2, 2399.0], [87.3, 2404.0], [87.4, 2406.0], [87.5, 2413.0], [87.6, 2420.0], [87.7, 2424.0], [87.8, 2427.0], [87.9, 2432.0], [88.0, 2435.0], [88.1, 2440.0], [88.2, 2444.0], [88.3, 2445.0], [88.4, 2453.0], [88.5, 2461.0], [88.6, 2462.0], [88.7, 2467.0], [88.8, 2468.0], [88.9, 2471.0], [89.0, 2472.0], [89.1, 2472.0], [89.2, 2478.0], [89.3, 2482.0], [89.4, 2485.0], [89.5, 2501.0], [89.6, 2513.0], [89.7, 2527.0], [89.8, 2534.0], [89.9, 2538.0], [90.0, 2546.0], [90.1, 2549.0], [90.2, 2563.0], [90.3, 2576.0], [90.4, 2577.0], [90.5, 2592.0], [90.6, 2593.0], [90.7, 2597.0], [90.8, 2599.0], [90.9, 2607.0], [91.0, 2616.0], [91.1, 2621.0], [91.2, 2622.0], [91.3, 2625.0], [91.4, 2633.0], [91.5, 2636.0], [91.6, 2639.0], [91.7, 2642.0], [91.8, 2647.0], [91.9, 2650.0], [92.0, 2651.0], [92.1, 2653.0], [92.2, 2665.0], [92.3, 2668.0], [92.4, 2674.0], [92.5, 2678.0], [92.6, 2680.0], [92.7, 2690.0], [92.8, 2693.0], [92.9, 2706.0], [93.0, 2707.0], [93.1, 2718.0], [93.2, 2724.0], [93.3, 2734.0], [93.4, 2739.0], [93.5, 2744.0], [93.6, 2756.0], [93.7, 2763.0], [93.8, 2776.0], [93.9, 2800.0], [94.0, 2833.0], [94.1, 2844.0], [94.2, 2849.0], [94.3, 2856.0], [94.4, 2862.0], [94.5, 2866.0], [94.6, 2870.0], [94.7, 2875.0], [94.8, 2885.0], [94.9, 2909.0], [95.0, 2946.0], [95.1, 2950.0], [95.2, 2958.0], [95.3, 2970.0], [95.4, 2978.0], [95.5, 2982.0], [95.6, 2984.0], [95.7, 3005.0], [95.8, 3014.0], [95.9, 3028.0], [96.0, 3054.0], [96.1, 3061.0], [96.2, 3069.0], [96.3, 3086.0], [96.4, 3106.0], [96.5, 3121.0], [96.6, 3157.0], [96.7, 3163.0], [96.8, 3192.0], [96.9, 3197.0], [97.0, 3208.0], [97.1, 3246.0], [97.2, 3251.0], [97.3, 3269.0], [97.4, 3283.0], [97.5, 3336.0], [97.6, 3347.0], [97.7, 3366.0], [97.8, 3413.0], [97.9, 3423.0], [98.0, 3493.0], [98.1, 3507.0], [98.2, 3541.0], [98.3, 3553.0], [98.4, 3609.0], [98.5, 3644.0], [98.6, 3652.0], [98.7, 3670.0], [98.8, 3678.0], [98.9, 3698.0], [99.0, 3703.0], [99.1, 3712.0], [99.2, 3735.0], [99.3, 3851.0], [99.4, 3930.0], [99.5, 3966.0], [99.6, 4069.0], [99.7, 4203.0], [99.8, 4304.0], [99.9, 4427.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 199.0, "series": [{"data": [[0.0, 152.0], [600.0, 46.0], [700.0, 25.0], [800.0, 16.0], [900.0, 16.0], [1000.0, 16.0], [1100.0, 28.0], [1200.0, 46.0], [1300.0, 53.0], [1400.0, 54.0], [1500.0, 57.0], [100.0, 184.0], [1600.0, 80.0], [1700.0, 72.0], [1800.0, 74.0], [1900.0, 82.0], [2000.0, 68.0], [2100.0, 62.0], [2300.0, 55.0], [2200.0, 57.0], [2400.0, 45.0], [2500.0, 27.0], [2600.0, 41.0], [2700.0, 20.0], [2800.0, 20.0], [2900.0, 16.0], [3000.0, 14.0], [3100.0, 11.0], [200.0, 199.0], [3200.0, 10.0], [3300.0, 7.0], [3400.0, 5.0], [3500.0, 7.0], [3600.0, 11.0], [3700.0, 6.0], [3800.0, 2.0], [3900.0, 5.0], [4000.0, 1.0], [4200.0, 3.0], [4300.0, 1.0], [4400.0, 2.0], [4600.0, 1.0], [300.0, 141.0], [400.0, 98.0], [500.0, 64.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 364.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 861.0, "series": [{"data": [[1.0, 364.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 775.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 861.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 228.1995000000002, "minX": 1.54960806E12, "maxY": 228.1995000000002, "series": [{"data": [[1.54960806E12, 228.1995000000002]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 62.30769230769231, "minX": 1.0, "maxY": 4621.0, "series": [{"data": [[2.0, 1794.0], [3.0, 1670.0], [5.0, 1949.0], [6.0, 1674.0], [7.0, 1684.0], [8.0, 2279.0], [9.0, 570.0], [10.0, 191.33333333333334], [11.0, 274.375], [12.0, 63.681818181818194], [13.0, 321.6], [14.0, 62.30769230769231], [15.0, 213.8181818181818], [16.0, 456.2], [17.0, 119.16666666666667], [18.0, 789.5], [19.0, 393.55555555555554], [20.0, 118.18750000000001], [21.0, 265.0], [22.0, 190.39999999999998], [23.0, 173.64], [24.0, 254.9230769230769], [25.0, 473.125], [26.0, 317.0], [27.0, 381.1666666666667], [28.0, 454.7142857142858], [29.0, 607.75], [30.0, 142.0], [31.0, 463.0833333333333], [33.0, 490.66666666666663], [32.0, 453.2], [35.0, 396.8181818181818], [34.0, 703.5], [37.0, 283.0769230769231], [36.0, 327.3636363636364], [39.0, 345.33333333333337], [38.0, 362.16666666666663], [41.0, 411.33333333333337], [40.0, 411.83333333333337], [43.0, 820.3333333333334], [42.0, 231.0], [45.0, 422.0], [44.0, 323.73333333333335], [47.0, 462.00000000000006], [46.0, 202.88888888888889], [49.0, 398.94736842105266], [48.0, 223.47058823529412], [51.0, 731.125], [50.0, 241.0], [53.0, 432.72727272727275], [52.0, 571.25], [55.0, 240.21428571428572], [54.0, 422.0], [57.0, 659.3333333333333], [56.0, 359.21428571428567], [58.0, 455.44444444444446], [59.0, 703.4], [60.0, 530.1428571428571], [61.0, 523.7142857142857], [63.0, 833.3333333333334], [62.0, 501.66666666666674], [66.0, 1125.25], [65.0, 243.0], [64.0, 783.6666666666667], [67.0, 314.0], [69.0, 442.9], [71.0, 527.3846153846154], [70.0, 306.4166666666667], [68.0, 442.5789473684211], [73.0, 606.8], [72.0, 562.75], [75.0, 1031.3333333333335], [74.0, 821.6666666666666], [76.0, 655.0], [78.0, 335.25000000000006], [77.0, 592.0], [79.0, 1321.0], [81.0, 962.6666666666666], [80.0, 1106.5], [82.0, 775.4], [83.0, 412.0], [84.0, 489.36842105263156], [85.0, 492.1428571428571], [86.0, 477.2352941176471], [87.0, 591.0], [88.0, 597.5], [89.0, 604.5714285714286], [91.0, 1635.0], [90.0, 1534.0], [93.0, 687.0], [94.0, 606.75], [92.0, 620.5], [95.0, 1238.0], [99.0, 871.3333333333333], [98.0, 1037.6666666666665], [97.0, 646.0], [96.0, 1030.5], [103.0, 974.5], [102.0, 2023.5], [101.0, 2238.0], [105.0, 455.0], [104.0, 1247.5], [106.0, 1484.0], [107.0, 1829.0], [110.0, 725.8333333333334], [109.0, 555.0], [108.0, 712.5714285714286], [111.0, 1709.0], [112.0, 867.5], [115.0, 1897.0], [114.0, 1597.0], [113.0, 1732.0], [116.0, 1544.0], [118.0, 632.6666666666666], [119.0, 757.0], [117.0, 1703.0], [120.0, 527.8333333333333], [121.0, 740.6666666666666], [123.0, 675.7], [122.0, 688.8888888888889], [124.0, 583.8333333333334], [125.0, 760.75], [127.0, 874.75], [126.0, 1996.0], [130.0, 1084.5], [129.0, 1456.5], [135.0, 1554.5], [134.0, 697.0], [133.0, 991.0], [132.0, 791.6], [131.0, 962.5], [128.0, 1673.0], [136.0, 930.6666666666667], [143.0, 2240.0], [142.0, 2222.0], [141.0, 2576.0], [140.0, 1799.0], [139.0, 2103.0], [138.0, 1416.0], [137.0, 2833.0], [145.0, 844.8333333333333], [146.0, 729.8888888888889], [144.0, 1064.5], [147.0, 699.3076923076922], [149.0, 751.5454545454545], [150.0, 877.0], [148.0, 651.4], [151.0, 1629.0], [153.0, 604.2857142857142], [152.0, 1063.6666666666667], [154.0, 730.5], [156.0, 739.6], [159.0, 980.8333333333334], [158.0, 1084.75], [157.0, 932.0], [155.0, 2750.5], [161.0, 1061.0], [166.0, 1829.0], [165.0, 1859.0], [164.0, 2424.0], [163.0, 1775.0], [162.0, 2016.0], [160.0, 2186.0], [175.0, 2665.0], [174.0, 1819.0], [173.0, 2586.0], [172.0, 2129.0], [171.0, 1358.0], [170.0, 3117.0], [169.0, 2447.0], [168.0, 2418.0], [183.0, 2353.0], [182.0, 1984.0], [181.0, 2593.0], [180.0, 2058.0], [179.0, 2838.0], [178.0, 2985.0], [177.0, 2204.0], [176.0, 2104.0], [191.0, 2577.0], [190.0, 3270.0], [189.0, 1971.0], [188.0, 4621.0], [187.0, 1582.0], [186.0, 2098.0], [185.0, 2707.0], [184.0, 1878.0], [199.0, 1300.0], [198.0, 2156.0], [197.0, 1412.0], [196.0, 1937.0], [195.0, 1515.0], [194.0, 2088.0], [193.0, 2718.0], [192.0, 2573.0], [207.0, 2637.0], [206.0, 1918.0], [205.0, 2365.0], [204.0, 2540.5], [202.0, 1846.0], [201.0, 2345.0], [200.0, 1351.0], [215.0, 2948.0], [214.0, 1809.0], [213.0, 1484.0], [211.0, 2210.0], [210.0, 2225.0], [209.0, 2636.0], [208.0, 1777.0], [223.0, 1964.0], [222.0, 1639.0], [221.0, 1927.0], [220.0, 1692.0], [219.0, 2647.0], [218.0, 2398.0], [217.0, 1815.0], [216.0, 2939.0], [230.0, 2316.0], [229.0, 1978.0], [228.0, 1671.0], [227.0, 1811.0], [226.0, 1244.0], [225.0, 2355.0], [224.0, 2181.0], [239.0, 1802.0], [238.0, 2058.0], [237.0, 2393.0], [236.0, 1461.0], [235.0, 3014.0], [234.0, 1401.0], [233.0, 2316.0], [232.0, 2248.5], [247.0, 2048.0], [246.0, 2205.0], [245.0, 1712.0], [244.0, 1281.0], [243.0, 2862.0], [242.0, 2238.0], [241.0, 2049.0], [240.0, 1792.0], [255.0, 2043.0], [254.0, 3020.0], [253.0, 2083.0], [252.0, 2137.0], [251.0, 1930.0], [250.0, 1486.0], [249.0, 2607.0], [248.0, 1711.0], [270.0, 2106.0], [271.0, 2036.0], [269.0, 2909.0], [268.0, 3609.0], [267.0, 2468.0], [266.0, 2621.0], [265.0, 2096.0], [264.0, 2324.0], [263.0, 2110.5], [257.0, 2313.0], [256.0, 1425.0], [259.0, 1919.0], [258.0, 3036.0], [261.0, 1797.0], [260.0, 2166.0], [286.0, 2535.0], [287.0, 2958.0], [285.0, 2130.0], [284.0, 2376.0], [283.0, 2649.0], [282.0, 1586.0], [281.0, 2341.0], [280.0, 2800.0], [279.0, 3163.0], [273.0, 2467.0], [272.0, 2472.0], [275.0, 2482.0], [274.0, 1467.0], [278.0, 1980.0], [277.0, 1687.0], [276.0, 2213.0], [302.0, 1176.75], [303.0, 1475.0], [301.0, 1856.0], [300.0, 1340.6666666666667], [298.0, 1514.75], [299.0, 2546.0], [297.0, 1281.75], [296.0, 1521.3333333333333], [295.0, 1529.6666666666667], [288.0, 4407.0], [291.0, 2448.0], [289.0, 1806.0], [294.0, 2216.5], [293.0, 1490.0], [292.0, 1679.0], [305.0, 1370.6], [309.0, 1455.0], [308.0, 1541.4], [306.0, 1829.0], [316.0, 1901.0], [307.0, 2427.0], [317.0, 1619.25], [319.0, 2729.0], [318.0, 2875.0], [304.0, 1798.0], [310.0, 1351.5714285714287], [312.0, 1807.5], [311.0, 1716.0], [313.0, 1442.25], [314.0, 1571.0], [315.0, 1479.7142857142856], [332.0, 1900.5], [320.0, 1837.6666666666665], [327.0, 2152.0], [326.0, 1646.0], [325.0, 4427.0], [324.0, 2288.0], [322.0, 2486.6666666666665], [323.0, 2979.0], [321.0, 1551.0], [329.0, 1833.0], [331.0, 1443.0], [330.0, 2105.0], [328.0, 1164.6666666666667], [334.0, 1819.0], [333.0, 2735.0], [335.0, 2593.0], [336.0, 1477.5], [339.0, 1767.0], [338.0, 1634.0], [337.0, 2461.0], [348.0, 2184.0], [350.0, 2281.0], [351.0, 1645.0], [349.0, 2386.5], [340.0, 1739.0], [341.0, 1763.5], [342.0, 1750.5], [345.0, 1831.0], [344.0, 1469.4], [343.0, 1397.5], [347.0, 1728.5], [346.0, 1737.0], [364.0, 1492.3333333333335], [354.0, 1601.5], [355.0, 1405.0], [357.0, 2271.0], [356.0, 1518.0], [359.0, 1816.0], [353.0, 1248.0], [352.0, 2856.0], [360.0, 1668.2], [358.0, 1562.0], [362.0, 1597.3333333333333], [363.0, 2472.0], [361.0, 1532.3333333333333], [366.0, 1626.2], [365.0, 1283.5], [367.0, 1988.3333333333333], [381.0, 1862.5], [368.0, 1597.6666666666667], [371.0, 1607.0], [370.0, 2468.0], [369.0, 2972.0], [380.0, 2058.0], [372.0, 1844.5], [373.0, 1434.0], [374.0, 1551.0], [375.0, 2406.0], [378.0, 1887.75], [379.0, 2191.0], [382.0, 1799.5], [377.0, 3106.0], [376.0, 2059.0], [385.0, 1967.5], [384.0, 2668.5], [391.0, 2215.0], [387.0, 2480.0], [386.0, 2217.0], [390.0, 1254.3333333333333], [389.0, 1393.3333333333333], [388.0, 1797.3333333333333], [392.0, 2332.0], [393.0, 2075.0], [395.0, 2069.0], [394.0, 2229.0], [398.0, 1412.3333333333333], [399.0, 2102.0], [396.0, 2223.0], [397.0, 1830.2], [401.0, 1544.3333333333333], [400.0, 1922.5], [403.0, 1754.25], [402.0, 1893.0], [404.0, 1545.2], [405.0, 2069.666666666667], [408.0, 2915.0], [414.0, 2247.0], [415.0, 1697.1666666666665], [412.0, 1795.5], [413.0, 1643.75], [410.0, 1430.6666666666667], [411.0, 1938.0], [409.0, 1802.0], [407.0, 1244.5], [406.0, 1926.6666666666667], [430.0, 1944.0], [417.0, 2542.5], [416.0, 1500.375], [422.0, 1701.0], [418.0, 2180.5], [419.0, 2227.0], [429.0, 1936.0], [428.0, 2764.0], [421.0, 1879.25], [420.0, 1838.5], [427.0, 2046.6666666666665], [426.0, 1681.5], [431.0, 1978.75], [425.0, 2982.0], [424.0, 2283.5], [444.0, 2054.25], [433.0, 1520.0], [432.0, 2131.0], [435.0, 1188.0], [434.0, 2485.0], [436.0, 1650.75], [438.0, 1950.0], [437.0, 2625.0], [439.0, 2245.0], [441.0, 1806.0], [440.0, 2314.5], [443.0, 1973.0], [442.0, 2616.0], [446.0, 1703.7272727272727], [445.0, 2409.75], [447.0, 2163.25], [451.0, 1698.0], [449.0, 2518.0], [448.0, 2093.5], [450.0, 2919.0], [453.0, 1578.0], [452.0, 2462.0], [454.0, 3309.0], [455.0, 1534.75], [459.0, 1923.6666666666667], [458.0, 2113.0], [457.0, 1227.0], [456.0, 2102.0], [462.0, 1936.3333333333333], [463.0, 2236.0], [460.0, 1462.5], [461.0, 2283.5], [476.0, 2077.5], [464.0, 2001.0], [466.0, 1953.5], [465.0, 2478.0], [467.0, 3708.0], [469.0, 1733.0], [468.0, 2366.0], [470.0, 1644.8333333333333], [472.0, 2023.8], [471.0, 1439.857142857143], [473.0, 1866.8333333333335], [475.0, 2048.8], [474.0, 1826.0], [477.0, 2104.0], [479.0, 1734.5], [478.0, 1975.0], [493.0, 1841.6666666666667], [480.0, 2441.5], [483.0, 1983.5], [482.0, 1446.0], [481.0, 1528.0], [492.0, 1266.0], [487.0, 2251.0], [489.0, 1604.75], [488.0, 1852.0], [486.0, 1427.5], [485.0, 2341.0], [484.0, 3913.0], [491.0, 1876.5], [490.0, 2449.0], [494.0, 1899.3333333333333], [495.0, 3098.5], [497.0, 1476.5], [496.0, 2214.0], [499.0, 2161.6666666666665], [498.0, 2094.0], [501.0, 1808.4], [500.0, 2035.5], [502.0, 2356.0], [503.0, 2443.0], [506.0, 2227.75], [505.0, 2462.0], [504.0, 2080.0], [507.0, 2343.0], [511.0, 2406.0], [510.0, 3034.5], [509.0, 2046.5], [508.0, 2503.0], [518.0, 2118.6], [526.0, 2298.5714285714284], [516.0, 1630.6], [513.0, 2305.0], [515.0, 3644.0], [514.0, 1809.0], [527.0, 1785.4285714285716], [512.0, 3559.0], [517.0, 1774.1666666666665], [519.0, 2302.6666666666665], [537.0, 1828.0], [536.0, 2534.0], [538.0, 1885.5], [539.0, 2241.0], [540.0, 2280.2], [541.0, 2233.0], [542.0, 2018.4285714285716], [543.0, 2160.7142857142853], [528.0, 2016.6666666666665], [530.0, 2502.0], [529.0, 2644.0], [531.0, 2427.0], [532.0, 2559.5], [533.0, 2414.6], [534.0, 2117.833333333333], [535.0, 1669.0], [524.0, 2734.3333333333335], [523.0, 2205.0], [522.0, 2428.25], [521.0, 1959.0], [520.0, 1666.0], [525.0, 2520.5], [557.0, 2295.4444444444443], [544.0, 2547.0000000000005], [545.0, 2352.090909090909], [546.0, 2606.125], [548.0, 2183.0], [547.0, 3652.0], [550.0, 1547.0], [549.0, 1955.0], [552.0, 2178.75], [553.0, 2144.25], [551.0, 2651.0], [560.0, 2370.6153846153843], [561.0, 2567.0], [562.0, 2638.0], [554.0, 2320.3333333333335], [556.0, 2601.6875000000005], [555.0, 1976.25], [558.0, 2420.0], [559.0, 2628.6666666666665], [1.0, 1713.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[228.1995000000002, 1234.403999999998]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 562.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8400.0, "minX": 1.54960806E12, "maxY": 14032.483333333334, "series": [{"data": [[1.54960806E12, 14032.483333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960806E12, 8400.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1234.403999999998, "minX": 1.54960806E12, "maxY": 1234.403999999998, "series": [{"data": [[1.54960806E12, 1234.403999999998]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960806E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1234.3980000000004, "minX": 1.54960806E12, "maxY": 1234.3980000000004, "series": [{"data": [[1.54960806E12, 1234.3980000000004]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960806E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 47.440499999999986, "minX": 1.54960806E12, "maxY": 47.440499999999986, "series": [{"data": [[1.54960806E12, 47.440499999999986]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960806E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 46.0, "minX": 1.54960806E12, "maxY": 4621.0, "series": [{"data": [[1.54960806E12, 4621.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960806E12, 46.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960806E12, 2545.3000000000006]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960806E12, 3702.98]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960806E12, 2945.6499999999987]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1227.5, "minX": 33.0, "maxY": 1227.5, "series": [{"data": [[33.0, 1227.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1227.5, "minX": 33.0, "maxY": 1227.5, "series": [{"data": [[33.0, 1227.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960806E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960806E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960806E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960806E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960806E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960806E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960806E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960806E12, "title": "Transactions Per Second"}},
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
