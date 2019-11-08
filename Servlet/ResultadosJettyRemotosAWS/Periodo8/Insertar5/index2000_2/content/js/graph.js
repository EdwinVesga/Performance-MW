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
        data: {"result": {"minY": 90.0, "minX": 0.0, "maxY": 4625.0, "series": [{"data": [[0.0, 90.0], [0.1, 117.0], [0.2, 122.0], [0.3, 122.0], [0.4, 124.0], [0.5, 125.0], [0.6, 125.0], [0.7, 128.0], [0.8, 128.0], [0.9, 133.0], [1.0, 133.0], [1.1, 137.0], [1.2, 138.0], [1.3, 139.0], [1.4, 140.0], [1.5, 142.0], [1.6, 144.0], [1.7, 145.0], [1.8, 146.0], [1.9, 147.0], [2.0, 147.0], [2.1, 148.0], [2.2, 149.0], [2.3, 150.0], [2.4, 151.0], [2.5, 151.0], [2.6, 152.0], [2.7, 152.0], [2.8, 153.0], [2.9, 154.0], [3.0, 155.0], [3.1, 156.0], [3.2, 157.0], [3.3, 158.0], [3.4, 160.0], [3.5, 161.0], [3.6, 162.0], [3.7, 162.0], [3.8, 163.0], [3.9, 164.0], [4.0, 165.0], [4.1, 167.0], [4.2, 169.0], [4.3, 169.0], [4.4, 169.0], [4.5, 171.0], [4.6, 172.0], [4.7, 172.0], [4.8, 173.0], [4.9, 174.0], [5.0, 174.0], [5.1, 175.0], [5.2, 175.0], [5.3, 176.0], [5.4, 176.0], [5.5, 177.0], [5.6, 178.0], [5.7, 179.0], [5.8, 180.0], [5.9, 180.0], [6.0, 181.0], [6.1, 181.0], [6.2, 184.0], [6.3, 184.0], [6.4, 185.0], [6.5, 185.0], [6.6, 186.0], [6.7, 187.0], [6.8, 187.0], [6.9, 188.0], [7.0, 188.0], [7.1, 188.0], [7.2, 189.0], [7.3, 189.0], [7.4, 190.0], [7.5, 190.0], [7.6, 190.0], [7.7, 191.0], [7.8, 191.0], [7.9, 193.0], [8.0, 196.0], [8.1, 196.0], [8.2, 196.0], [8.3, 197.0], [8.4, 198.0], [8.5, 199.0], [8.6, 201.0], [8.7, 201.0], [8.8, 202.0], [8.9, 202.0], [9.0, 203.0], [9.1, 203.0], [9.2, 204.0], [9.3, 205.0], [9.4, 205.0], [9.5, 205.0], [9.6, 206.0], [9.7, 206.0], [9.8, 208.0], [9.9, 209.0], [10.0, 209.0], [10.1, 209.0], [10.2, 209.0], [10.3, 211.0], [10.4, 211.0], [10.5, 212.0], [10.6, 212.0], [10.7, 213.0], [10.8, 213.0], [10.9, 214.0], [11.0, 215.0], [11.1, 215.0], [11.2, 216.0], [11.3, 218.0], [11.4, 218.0], [11.5, 219.0], [11.6, 219.0], [11.7, 220.0], [11.8, 221.0], [11.9, 221.0], [12.0, 222.0], [12.1, 224.0], [12.2, 224.0], [12.3, 224.0], [12.4, 225.0], [12.5, 225.0], [12.6, 225.0], [12.7, 225.0], [12.8, 226.0], [12.9, 226.0], [13.0, 227.0], [13.1, 227.0], [13.2, 228.0], [13.3, 229.0], [13.4, 231.0], [13.5, 231.0], [13.6, 231.0], [13.7, 233.0], [13.8, 234.0], [13.9, 234.0], [14.0, 235.0], [14.1, 235.0], [14.2, 236.0], [14.3, 237.0], [14.4, 238.0], [14.5, 238.0], [14.6, 239.0], [14.7, 240.0], [14.8, 240.0], [14.9, 240.0], [15.0, 242.0], [15.1, 243.0], [15.2, 243.0], [15.3, 243.0], [15.4, 243.0], [15.5, 245.0], [15.6, 247.0], [15.7, 247.0], [15.8, 247.0], [15.9, 248.0], [16.0, 249.0], [16.1, 249.0], [16.2, 249.0], [16.3, 250.0], [16.4, 252.0], [16.5, 253.0], [16.6, 253.0], [16.7, 254.0], [16.8, 255.0], [16.9, 256.0], [17.0, 256.0], [17.1, 257.0], [17.2, 258.0], [17.3, 259.0], [17.4, 260.0], [17.5, 260.0], [17.6, 261.0], [17.7, 261.0], [17.8, 262.0], [17.9, 262.0], [18.0, 265.0], [18.1, 266.0], [18.2, 266.0], [18.3, 268.0], [18.4, 269.0], [18.5, 269.0], [18.6, 270.0], [18.7, 270.0], [18.8, 271.0], [18.9, 272.0], [19.0, 274.0], [19.1, 275.0], [19.2, 276.0], [19.3, 277.0], [19.4, 278.0], [19.5, 280.0], [19.6, 281.0], [19.7, 282.0], [19.8, 282.0], [19.9, 283.0], [20.0, 285.0], [20.1, 285.0], [20.2, 285.0], [20.3, 287.0], [20.4, 288.0], [20.5, 289.0], [20.6, 289.0], [20.7, 290.0], [20.8, 292.0], [20.9, 296.0], [21.0, 298.0], [21.1, 299.0], [21.2, 300.0], [21.3, 302.0], [21.4, 303.0], [21.5, 305.0], [21.6, 306.0], [21.7, 306.0], [21.8, 307.0], [21.9, 308.0], [22.0, 309.0], [22.1, 310.0], [22.2, 315.0], [22.3, 316.0], [22.4, 316.0], [22.5, 316.0], [22.6, 317.0], [22.7, 319.0], [22.8, 320.0], [22.9, 323.0], [23.0, 324.0], [23.1, 324.0], [23.2, 325.0], [23.3, 329.0], [23.4, 331.0], [23.5, 332.0], [23.6, 332.0], [23.7, 333.0], [23.8, 334.0], [23.9, 334.0], [24.0, 337.0], [24.1, 340.0], [24.2, 341.0], [24.3, 342.0], [24.4, 343.0], [24.5, 346.0], [24.6, 347.0], [24.7, 349.0], [24.8, 352.0], [24.9, 354.0], [25.0, 356.0], [25.1, 358.0], [25.2, 360.0], [25.3, 363.0], [25.4, 365.0], [25.5, 368.0], [25.6, 369.0], [25.7, 373.0], [25.8, 374.0], [25.9, 378.0], [26.0, 378.0], [26.1, 380.0], [26.2, 381.0], [26.3, 383.0], [26.4, 387.0], [26.5, 389.0], [26.6, 389.0], [26.7, 390.0], [26.8, 390.0], [26.9, 394.0], [27.0, 396.0], [27.1, 397.0], [27.2, 398.0], [27.3, 400.0], [27.4, 402.0], [27.5, 404.0], [27.6, 405.0], [27.7, 407.0], [27.8, 410.0], [27.9, 414.0], [28.0, 415.0], [28.1, 418.0], [28.2, 422.0], [28.3, 422.0], [28.4, 423.0], [28.5, 425.0], [28.6, 427.0], [28.7, 428.0], [28.8, 428.0], [28.9, 430.0], [29.0, 432.0], [29.1, 432.0], [29.2, 435.0], [29.3, 438.0], [29.4, 440.0], [29.5, 442.0], [29.6, 444.0], [29.7, 446.0], [29.8, 447.0], [29.9, 449.0], [30.0, 450.0], [30.1, 451.0], [30.2, 452.0], [30.3, 455.0], [30.4, 456.0], [30.5, 457.0], [30.6, 460.0], [30.7, 462.0], [30.8, 464.0], [30.9, 465.0], [31.0, 466.0], [31.1, 467.0], [31.2, 467.0], [31.3, 469.0], [31.4, 470.0], [31.5, 472.0], [31.6, 473.0], [31.7, 479.0], [31.8, 480.0], [31.9, 482.0], [32.0, 482.0], [32.1, 484.0], [32.2, 484.0], [32.3, 485.0], [32.4, 487.0], [32.5, 488.0], [32.6, 490.0], [32.7, 492.0], [32.8, 493.0], [32.9, 495.0], [33.0, 496.0], [33.1, 503.0], [33.2, 506.0], [33.3, 507.0], [33.4, 508.0], [33.5, 511.0], [33.6, 512.0], [33.7, 517.0], [33.8, 521.0], [33.9, 523.0], [34.0, 525.0], [34.1, 528.0], [34.2, 529.0], [34.3, 529.0], [34.4, 532.0], [34.5, 535.0], [34.6, 536.0], [34.7, 540.0], [34.8, 541.0], [34.9, 542.0], [35.0, 544.0], [35.1, 544.0], [35.2, 551.0], [35.3, 552.0], [35.4, 553.0], [35.5, 555.0], [35.6, 557.0], [35.7, 560.0], [35.8, 560.0], [35.9, 561.0], [36.0, 562.0], [36.1, 563.0], [36.2, 565.0], [36.3, 565.0], [36.4, 567.0], [36.5, 567.0], [36.6, 569.0], [36.7, 571.0], [36.8, 571.0], [36.9, 576.0], [37.0, 579.0], [37.1, 581.0], [37.2, 589.0], [37.3, 590.0], [37.4, 593.0], [37.5, 594.0], [37.6, 597.0], [37.7, 600.0], [37.8, 604.0], [37.9, 606.0], [38.0, 607.0], [38.1, 608.0], [38.2, 610.0], [38.3, 613.0], [38.4, 614.0], [38.5, 617.0], [38.6, 618.0], [38.7, 621.0], [38.8, 622.0], [38.9, 623.0], [39.0, 624.0], [39.1, 626.0], [39.2, 627.0], [39.3, 630.0], [39.4, 631.0], [39.5, 633.0], [39.6, 635.0], [39.7, 636.0], [39.8, 638.0], [39.9, 643.0], [40.0, 650.0], [40.1, 653.0], [40.2, 654.0], [40.3, 656.0], [40.4, 658.0], [40.5, 659.0], [40.6, 659.0], [40.7, 661.0], [40.8, 663.0], [40.9, 667.0], [41.0, 669.0], [41.1, 670.0], [41.2, 675.0], [41.3, 678.0], [41.4, 681.0], [41.5, 685.0], [41.6, 686.0], [41.7, 688.0], [41.8, 689.0], [41.9, 693.0], [42.0, 697.0], [42.1, 699.0], [42.2, 701.0], [42.3, 702.0], [42.4, 704.0], [42.5, 709.0], [42.6, 713.0], [42.7, 713.0], [42.8, 716.0], [42.9, 718.0], [43.0, 719.0], [43.1, 722.0], [43.2, 726.0], [43.3, 728.0], [43.4, 733.0], [43.5, 736.0], [43.6, 738.0], [43.7, 744.0], [43.8, 748.0], [43.9, 756.0], [44.0, 758.0], [44.1, 767.0], [44.2, 770.0], [44.3, 774.0], [44.4, 777.0], [44.5, 780.0], [44.6, 781.0], [44.7, 792.0], [44.8, 795.0], [44.9, 803.0], [45.0, 805.0], [45.1, 809.0], [45.2, 817.0], [45.3, 823.0], [45.4, 832.0], [45.5, 834.0], [45.6, 837.0], [45.7, 838.0], [45.8, 839.0], [45.9, 845.0], [46.0, 852.0], [46.1, 861.0], [46.2, 863.0], [46.3, 874.0], [46.4, 881.0], [46.5, 887.0], [46.6, 889.0], [46.7, 893.0], [46.8, 899.0], [46.9, 903.0], [47.0, 903.0], [47.1, 916.0], [47.2, 919.0], [47.3, 922.0], [47.4, 926.0], [47.5, 932.0], [47.6, 959.0], [47.7, 967.0], [47.8, 984.0], [47.9, 997.0], [48.0, 1014.0], [48.1, 1020.0], [48.2, 1027.0], [48.3, 1051.0], [48.4, 1054.0], [48.5, 1067.0], [48.6, 1068.0], [48.7, 1087.0], [48.8, 1096.0], [48.9, 1104.0], [49.0, 1118.0], [49.1, 1124.0], [49.2, 1148.0], [49.3, 1161.0], [49.4, 1165.0], [49.5, 1169.0], [49.6, 1173.0], [49.7, 1179.0], [49.8, 1192.0], [49.9, 1201.0], [50.0, 1214.0], [50.1, 1217.0], [50.2, 1224.0], [50.3, 1228.0], [50.4, 1253.0], [50.5, 1255.0], [50.6, 1261.0], [50.7, 1268.0], [50.8, 1277.0], [50.9, 1283.0], [51.0, 1292.0], [51.1, 1301.0], [51.2, 1309.0], [51.3, 1313.0], [51.4, 1321.0], [51.5, 1322.0], [51.6, 1326.0], [51.7, 1334.0], [51.8, 1341.0], [51.9, 1344.0], [52.0, 1348.0], [52.1, 1351.0], [52.2, 1356.0], [52.3, 1362.0], [52.4, 1369.0], [52.5, 1372.0], [52.6, 1374.0], [52.7, 1378.0], [52.8, 1381.0], [52.9, 1382.0], [53.0, 1385.0], [53.1, 1391.0], [53.2, 1394.0], [53.3, 1402.0], [53.4, 1406.0], [53.5, 1412.0], [53.6, 1412.0], [53.7, 1419.0], [53.8, 1420.0], [53.9, 1425.0], [54.0, 1439.0], [54.1, 1446.0], [54.2, 1451.0], [54.3, 1455.0], [54.4, 1459.0], [54.5, 1462.0], [54.6, 1463.0], [54.7, 1470.0], [54.8, 1474.0], [54.9, 1476.0], [55.0, 1481.0], [55.1, 1487.0], [55.2, 1491.0], [55.3, 1493.0], [55.4, 1497.0], [55.5, 1499.0], [55.6, 1500.0], [55.7, 1505.0], [55.8, 1507.0], [55.9, 1509.0], [56.0, 1515.0], [56.1, 1515.0], [56.2, 1519.0], [56.3, 1519.0], [56.4, 1525.0], [56.5, 1526.0], [56.6, 1527.0], [56.7, 1529.0], [56.8, 1535.0], [56.9, 1537.0], [57.0, 1539.0], [57.1, 1539.0], [57.2, 1545.0], [57.3, 1548.0], [57.4, 1552.0], [57.5, 1552.0], [57.6, 1554.0], [57.7, 1555.0], [57.8, 1558.0], [57.9, 1560.0], [58.0, 1565.0], [58.1, 1567.0], [58.2, 1572.0], [58.3, 1574.0], [58.4, 1577.0], [58.5, 1580.0], [58.6, 1582.0], [58.7, 1585.0], [58.8, 1587.0], [58.9, 1591.0], [59.0, 1596.0], [59.1, 1597.0], [59.2, 1599.0], [59.3, 1601.0], [59.4, 1605.0], [59.5, 1606.0], [59.6, 1608.0], [59.7, 1610.0], [59.8, 1613.0], [59.9, 1619.0], [60.0, 1623.0], [60.1, 1627.0], [60.2, 1628.0], [60.3, 1630.0], [60.4, 1632.0], [60.5, 1634.0], [60.6, 1637.0], [60.7, 1638.0], [60.8, 1640.0], [60.9, 1642.0], [61.0, 1645.0], [61.1, 1647.0], [61.2, 1651.0], [61.3, 1652.0], [61.4, 1655.0], [61.5, 1660.0], [61.6, 1664.0], [61.7, 1667.0], [61.8, 1668.0], [61.9, 1669.0], [62.0, 1672.0], [62.1, 1673.0], [62.2, 1674.0], [62.3, 1675.0], [62.4, 1678.0], [62.5, 1685.0], [62.6, 1686.0], [62.7, 1689.0], [62.8, 1692.0], [62.9, 1694.0], [63.0, 1695.0], [63.1, 1695.0], [63.2, 1699.0], [63.3, 1700.0], [63.4, 1701.0], [63.5, 1704.0], [63.6, 1707.0], [63.7, 1711.0], [63.8, 1711.0], [63.9, 1712.0], [64.0, 1715.0], [64.1, 1717.0], [64.2, 1718.0], [64.3, 1720.0], [64.4, 1721.0], [64.5, 1727.0], [64.6, 1729.0], [64.7, 1729.0], [64.8, 1733.0], [64.9, 1736.0], [65.0, 1737.0], [65.1, 1739.0], [65.2, 1739.0], [65.3, 1741.0], [65.4, 1744.0], [65.5, 1748.0], [65.6, 1749.0], [65.7, 1755.0], [65.8, 1757.0], [65.9, 1758.0], [66.0, 1762.0], [66.1, 1765.0], [66.2, 1767.0], [66.3, 1769.0], [66.4, 1772.0], [66.5, 1774.0], [66.6, 1780.0], [66.7, 1784.0], [66.8, 1784.0], [66.9, 1789.0], [67.0, 1790.0], [67.1, 1791.0], [67.2, 1795.0], [67.3, 1797.0], [67.4, 1799.0], [67.5, 1800.0], [67.6, 1801.0], [67.7, 1803.0], [67.8, 1804.0], [67.9, 1805.0], [68.0, 1806.0], [68.1, 1809.0], [68.2, 1810.0], [68.3, 1817.0], [68.4, 1818.0], [68.5, 1821.0], [68.6, 1827.0], [68.7, 1828.0], [68.8, 1831.0], [68.9, 1832.0], [69.0, 1833.0], [69.1, 1835.0], [69.2, 1837.0], [69.3, 1839.0], [69.4, 1843.0], [69.5, 1847.0], [69.6, 1849.0], [69.7, 1851.0], [69.8, 1852.0], [69.9, 1854.0], [70.0, 1863.0], [70.1, 1863.0], [70.2, 1867.0], [70.3, 1869.0], [70.4, 1873.0], [70.5, 1875.0], [70.6, 1875.0], [70.7, 1880.0], [70.8, 1882.0], [70.9, 1884.0], [71.0, 1888.0], [71.1, 1896.0], [71.2, 1903.0], [71.3, 1905.0], [71.4, 1915.0], [71.5, 1922.0], [71.6, 1922.0], [71.7, 1926.0], [71.8, 1929.0], [71.9, 1935.0], [72.0, 1937.0], [72.1, 1938.0], [72.2, 1941.0], [72.3, 1946.0], [72.4, 1954.0], [72.5, 1957.0], [72.6, 1959.0], [72.7, 1960.0], [72.8, 1963.0], [72.9, 1964.0], [73.0, 1966.0], [73.1, 1966.0], [73.2, 1972.0], [73.3, 1973.0], [73.4, 1973.0], [73.5, 1974.0], [73.6, 1976.0], [73.7, 1976.0], [73.8, 1980.0], [73.9, 1983.0], [74.0, 1984.0], [74.1, 1985.0], [74.2, 1985.0], [74.3, 1988.0], [74.4, 1989.0], [74.5, 1994.0], [74.6, 1996.0], [74.7, 2000.0], [74.8, 2002.0], [74.9, 2004.0], [75.0, 2008.0], [75.1, 2011.0], [75.2, 2015.0], [75.3, 2019.0], [75.4, 2027.0], [75.5, 2031.0], [75.6, 2036.0], [75.7, 2039.0], [75.8, 2041.0], [75.9, 2044.0], [76.0, 2048.0], [76.1, 2049.0], [76.2, 2054.0], [76.3, 2054.0], [76.4, 2058.0], [76.5, 2065.0], [76.6, 2067.0], [76.7, 2070.0], [76.8, 2071.0], [76.9, 2075.0], [77.0, 2079.0], [77.1, 2081.0], [77.2, 2085.0], [77.3, 2088.0], [77.4, 2090.0], [77.5, 2092.0], [77.6, 2094.0], [77.7, 2095.0], [77.8, 2095.0], [77.9, 2097.0], [78.0, 2097.0], [78.1, 2103.0], [78.2, 2109.0], [78.3, 2111.0], [78.4, 2113.0], [78.5, 2117.0], [78.6, 2120.0], [78.7, 2124.0], [78.8, 2127.0], [78.9, 2128.0], [79.0, 2133.0], [79.1, 2136.0], [79.2, 2137.0], [79.3, 2139.0], [79.4, 2141.0], [79.5, 2144.0], [79.6, 2147.0], [79.7, 2153.0], [79.8, 2157.0], [79.9, 2163.0], [80.0, 2169.0], [80.1, 2170.0], [80.2, 2174.0], [80.3, 2185.0], [80.4, 2188.0], [80.5, 2193.0], [80.6, 2196.0], [80.7, 2203.0], [80.8, 2208.0], [80.9, 2211.0], [81.0, 2213.0], [81.1, 2218.0], [81.2, 2219.0], [81.3, 2225.0], [81.4, 2226.0], [81.5, 2229.0], [81.6, 2230.0], [81.7, 2240.0], [81.8, 2241.0], [81.9, 2244.0], [82.0, 2246.0], [82.1, 2247.0], [82.2, 2250.0], [82.3, 2252.0], [82.4, 2254.0], [82.5, 2265.0], [82.6, 2267.0], [82.7, 2269.0], [82.8, 2272.0], [82.9, 2272.0], [83.0, 2279.0], [83.1, 2282.0], [83.2, 2287.0], [83.3, 2291.0], [83.4, 2292.0], [83.5, 2295.0], [83.6, 2298.0], [83.7, 2298.0], [83.8, 2302.0], [83.9, 2303.0], [84.0, 2305.0], [84.1, 2306.0], [84.2, 2309.0], [84.3, 2316.0], [84.4, 2323.0], [84.5, 2325.0], [84.6, 2327.0], [84.7, 2331.0], [84.8, 2332.0], [84.9, 2333.0], [85.0, 2340.0], [85.1, 2346.0], [85.2, 2347.0], [85.3, 2348.0], [85.4, 2352.0], [85.5, 2356.0], [85.6, 2365.0], [85.7, 2369.0], [85.8, 2373.0], [85.9, 2381.0], [86.0, 2384.0], [86.1, 2387.0], [86.2, 2391.0], [86.3, 2392.0], [86.4, 2393.0], [86.5, 2396.0], [86.6, 2397.0], [86.7, 2401.0], [86.8, 2404.0], [86.9, 2407.0], [87.0, 2409.0], [87.1, 2413.0], [87.2, 2421.0], [87.3, 2433.0], [87.4, 2442.0], [87.5, 2444.0], [87.6, 2451.0], [87.7, 2453.0], [87.8, 2454.0], [87.9, 2461.0], [88.0, 2465.0], [88.1, 2466.0], [88.2, 2468.0], [88.3, 2477.0], [88.4, 2480.0], [88.5, 2484.0], [88.6, 2503.0], [88.7, 2505.0], [88.8, 2513.0], [88.9, 2514.0], [89.0, 2514.0], [89.1, 2517.0], [89.2, 2518.0], [89.3, 2519.0], [89.4, 2522.0], [89.5, 2526.0], [89.6, 2532.0], [89.7, 2534.0], [89.8, 2539.0], [89.9, 2544.0], [90.0, 2549.0], [90.1, 2551.0], [90.2, 2552.0], [90.3, 2557.0], [90.4, 2559.0], [90.5, 2564.0], [90.6, 2574.0], [90.7, 2579.0], [90.8, 2589.0], [90.9, 2598.0], [91.0, 2603.0], [91.1, 2604.0], [91.2, 2605.0], [91.3, 2607.0], [91.4, 2611.0], [91.5, 2616.0], [91.6, 2623.0], [91.7, 2626.0], [91.8, 2633.0], [91.9, 2636.0], [92.0, 2639.0], [92.1, 2650.0], [92.2, 2653.0], [92.3, 2657.0], [92.4, 2660.0], [92.5, 2668.0], [92.6, 2671.0], [92.7, 2675.0], [92.8, 2678.0], [92.9, 2684.0], [93.0, 2694.0], [93.1, 2708.0], [93.2, 2717.0], [93.3, 2722.0], [93.4, 2728.0], [93.5, 2741.0], [93.6, 2746.0], [93.7, 2754.0], [93.8, 2763.0], [93.9, 2768.0], [94.0, 2783.0], [94.1, 2786.0], [94.2, 2795.0], [94.3, 2820.0], [94.4, 2837.0], [94.5, 2851.0], [94.6, 2858.0], [94.7, 2862.0], [94.8, 2870.0], [94.9, 2873.0], [95.0, 2881.0], [95.1, 2893.0], [95.2, 2897.0], [95.3, 2936.0], [95.4, 2945.0], [95.5, 2954.0], [95.6, 2972.0], [95.7, 2987.0], [95.8, 3004.0], [95.9, 3019.0], [96.0, 3029.0], [96.1, 3044.0], [96.2, 3057.0], [96.3, 3073.0], [96.4, 3089.0], [96.5, 3101.0], [96.6, 3123.0], [96.7, 3138.0], [96.8, 3153.0], [96.9, 3179.0], [97.0, 3190.0], [97.1, 3201.0], [97.2, 3226.0], [97.3, 3281.0], [97.4, 3301.0], [97.5, 3308.0], [97.6, 3329.0], [97.7, 3335.0], [97.8, 3411.0], [97.9, 3441.0], [98.0, 3487.0], [98.1, 3492.0], [98.2, 3601.0], [98.3, 3612.0], [98.4, 3616.0], [98.5, 3637.0], [98.6, 3671.0], [98.7, 3713.0], [98.8, 3733.0], [98.9, 3809.0], [99.0, 3880.0], [99.1, 3973.0], [99.2, 3979.0], [99.3, 4023.0], [99.4, 4050.0], [99.5, 4084.0], [99.6, 4120.0], [99.7, 4277.0], [99.8, 4381.0], [99.9, 4481.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 252.0, "series": [{"data": [[0.0, 1.0], [600.0, 89.0], [700.0, 54.0], [800.0, 40.0], [900.0, 22.0], [1000.0, 18.0], [1100.0, 21.0], [1200.0, 24.0], [1300.0, 44.0], [1400.0, 46.0], [1500.0, 74.0], [100.0, 169.0], [1600.0, 79.0], [1700.0, 85.0], [1800.0, 74.0], [1900.0, 70.0], [2000.0, 68.0], [2100.0, 52.0], [2200.0, 62.0], [2300.0, 58.0], [2400.0, 38.0], [2500.0, 47.0], [2600.0, 42.0], [2700.0, 24.0], [2800.0, 21.0], [2900.0, 9.0], [3000.0, 14.0], [3100.0, 13.0], [200.0, 252.0], [3200.0, 6.0], [3300.0, 8.0], [3400.0, 7.0], [3500.0, 1.0], [3600.0, 10.0], [3700.0, 4.0], [3800.0, 3.0], [3900.0, 5.0], [4000.0, 6.0], [4100.0, 2.0], [4200.0, 2.0], [4300.0, 1.0], [4400.0, 2.0], [4600.0, 1.0], [300.0, 122.0], [400.0, 116.0], [500.0, 94.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 452.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 887.0, "series": [{"data": [[1.0, 452.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 661.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 887.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 233.75200000000007, "minX": 1.54960836E12, "maxY": 233.75200000000007, "series": [{"data": [[1.54960836E12, 233.75200000000007]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 185.54545454545456, "minX": 1.0, "maxY": 4381.0, "series": [{"data": [[2.0, 1689.0], [4.0, 2007.0], [5.0, 1673.0], [6.0, 2463.0], [7.0, 1767.0], [8.0, 1762.0], [9.0, 2453.0], [10.0, 1748.0], [11.0, 2038.0], [13.0, 2123.5], [15.0, 2385.0], [16.0, 2564.0], [17.0, 1905.0], [18.0, 2019.0], [19.0, 1821.0], [20.0, 2008.0], [22.0, 2100.0], [23.0, 2186.0], [24.0, 2684.0], [26.0, 2090.5], [27.0, 1685.0], [28.0, 2808.0], [29.0, 241.33333333333334], [30.0, 970.6], [31.0, 509.4], [33.0, 378.33333333333337], [32.0, 299.81818181818187], [35.0, 347.1], [34.0, 588.8], [37.0, 328.9375], [36.0, 298.71428571428567], [39.0, 301.0714285714286], [38.0, 260.1111111111111], [41.0, 281.15151515151507], [40.0, 185.54545454545456], [43.0, 221.77777777777774], [42.0, 315.0], [45.0, 436.75], [44.0, 437.8333333333333], [47.0, 280.57894736842104], [46.0, 337.6470588235294], [49.0, 243.8], [48.0, 503.5], [51.0, 298.55555555555554], [50.0, 470.9444444444445], [52.0, 297.0434782608695], [53.0, 349.3125], [55.0, 358.75], [54.0, 441.0909090909091], [56.0, 445.3333333333333], [57.0, 506.1428571428571], [58.0, 438.0], [59.0, 362.63157894736844], [60.0, 347.38461538461536], [61.0, 560.8], [63.0, 3179.0], [62.0, 2162.0], [66.0, 1132.5], [67.0, 600.8], [65.0, 2213.0], [64.0, 1597.0], [69.0, 540.5], [70.0, 362.7368421052632], [71.0, 551.5555555555557], [68.0, 545.5], [72.0, 861.25], [73.0, 297.3333333333333], [74.0, 961.0], [75.0, 1217.5], [78.0, 618.1666666666666], [77.0, 1412.0], [79.0, 2097.0], [80.0, 722.6666666666667], [83.0, 2228.5], [81.0, 2316.0], [87.0, 533.1111111111111], [86.0, 1232.0], [85.0, 1835.0], [84.0, 1756.0], [88.0, 532.5555555555555], [89.0, 527.0], [90.0, 669.1428571428571], [91.0, 1183.5], [95.0, 921.75], [94.0, 693.0], [93.0, 535.2727272727273], [92.0, 1013.3333333333334], [96.0, 718.25], [97.0, 542.0833333333334], [99.0, 838.5], [98.0, 590.8571428571429], [102.0, 1070.5], [101.0, 1094.5], [103.0, 410.25], [100.0, 2340.0], [106.0, 574.8], [107.0, 530.5], [105.0, 687.3333333333333], [104.0, 1035.0], [108.0, 1087.6], [110.0, 335.0], [109.0, 955.0], [111.0, 944.7142857142858], [112.0, 1393.0], [114.0, 551.0], [115.0, 904.1111111111111], [113.0, 2111.0], [118.0, 624.4000000000001], [116.0, 582.6470588235294], [117.0, 602.4], [119.0, 620.4000000000001], [120.0, 607.1666666666667], [122.0, 697.75], [121.0, 802.0], [123.0, 1142.3333333333335], [125.0, 839.75], [124.0, 1229.0], [127.0, 1114.0], [126.0, 2265.0], [128.0, 842.6666666666667], [129.0, 764.3333333333334], [131.0, 1090.142857142857], [132.0, 754.1818181818181], [130.0, 642.3333333333334], [133.0, 836.125], [135.0, 743.7142857142858], [134.0, 708.8461538461538], [139.0, 671.3076923076923], [138.0, 742.0909090909091], [137.0, 846.4615384615386], [136.0, 684.8888888888889], [140.0, 976.3333333333333], [142.0, 733.3076923076923], [141.0, 1014.2], [143.0, 932.1666666666667], [144.0, 848.6], [145.0, 1046.75], [148.0, 841.0], [147.0, 794.0], [146.0, 824.125], [150.0, 944.0], [151.0, 1090.6666666666667], [149.0, 1126.6666666666665], [152.0, 1430.5], [153.0, 959.6], [155.0, 1337.0], [154.0, 1285.25], [157.0, 822.0], [158.0, 1066.8333333333333], [156.0, 1447.5], [159.0, 1130.75], [160.0, 986.2857142857142], [161.0, 816.8181818181819], [163.0, 898.5333333333333], [162.0, 631.9], [164.0, 903.125], [165.0, 962.0], [167.0, 905.8333333333334], [166.0, 816.0714285714284], [169.0, 1336.5], [168.0, 1310.3333333333333], [171.0, 1113.25], [172.0, 1554.3333333333335], [174.0, 1165.6666666666667], [175.0, 935.0], [173.0, 1643.0], [170.0, 1791.0], [177.0, 943.5], [178.0, 1287.6666666666667], [176.0, 1431.0], [179.0, 1189.0], [180.0, 1260.6], [181.0, 914.0], [182.0, 1071.3333333333333], [183.0, 1769.0], [191.0, 1474.0], [190.0, 2015.0], [189.0, 2036.0], [188.0, 2267.0], [187.0, 2636.0], [186.0, 2505.0], [185.0, 3411.0], [184.0, 2365.0], [199.0, 2517.0], [198.0, 1462.0], [197.0, 2513.0], [196.0, 2292.0], [195.0, 1675.0], [194.0, 1631.0], [193.0, 2244.0], [192.0, 1796.0], [207.0, 2865.3333333333335], [204.0, 3073.0], [203.0, 2286.5], [201.0, 1863.0], [200.0, 1869.0], [215.0, 1519.0], [214.0, 2075.0], [213.0, 1608.0], [212.0, 3138.0], [210.0, 2185.0], [209.0, 2820.0], [208.0, 1790.0], [223.0, 2268.0], [221.0, 2346.0], [220.0, 1539.0], [219.0, 2396.0], [218.0, 2338.0], [217.0, 2451.0], [216.0, 1499.0], [231.0, 2403.0], [229.0, 2348.0], [227.0, 3126.0], [226.0, 1471.0], [225.0, 2351.0], [224.0, 2410.0], [239.0, 1758.0], [238.0, 2611.0], [237.0, 1277.0], [236.0, 1922.0], [235.0, 1554.0], [234.0, 1406.0], [233.0, 2461.0], [232.0, 2436.0], [247.0, 1481.0], [246.0, 2251.0], [245.0, 2478.5], [243.0, 2612.0], [242.0, 1974.0], [241.0, 2004.0], [240.0, 1599.0], [255.0, 2660.0], [254.0, 1552.0], [253.0, 1683.0], [252.0, 2048.0], [251.0, 2519.0], [250.0, 2786.0], [249.0, 2347.0], [248.0, 2302.0], [270.0, 2225.0], [271.0, 2141.0], [269.0, 2271.0], [268.0, 2170.0], [267.0, 2421.0], [266.0, 2069.5], [264.0, 1784.0], [263.0, 1837.0], [257.0, 2513.0], [256.0, 2120.0], [259.0, 1964.0], [258.0, 2409.0], [262.0, 3057.0], [261.0, 3227.0], [286.0, 2305.0], [287.0, 2558.0], [285.0, 1738.0], [284.0, 3487.0], [283.0, 1935.0], [282.0, 2144.0], [281.0, 1831.0], [280.0, 1596.0], [279.0, 2837.0], [273.0, 1954.0], [272.0, 1784.0], [275.0, 1461.0], [274.0, 2555.0], [278.0, 4295.0], [277.0, 1989.0], [276.0, 2212.0], [302.0, 2728.0], [303.0, 2468.0], [301.0, 2858.0], [300.0, 2601.0], [299.0, 2040.0], [298.0, 4381.0], [297.0, 3004.0], [296.0, 2450.0], [295.0, 1885.0], [289.0, 1832.0], [288.0, 2298.0], [291.0, 2305.0], [290.0, 2456.0], [294.0, 1879.5], [292.0, 2717.0], [318.0, 2604.0], [319.0, 1818.0], [317.0, 1468.0], [316.0, 2309.0], [315.0, 2314.0], [314.0, 3540.0], [313.0, 2392.5], [311.0, 2331.0], [304.0, 2867.0], [306.0, 4120.0], [305.0, 2598.0], [310.0, 2858.0], [309.0, 2165.0], [308.0, 2212.5], [328.0, 1616.2], [331.0, 1980.0], [330.0, 1709.8], [329.0, 1362.0], [327.0, 1939.3333333333333], [321.0, 2113.5], [320.0, 1922.5], [326.0, 1641.2222222222222], [324.0, 1684.5], [325.0, 1754.25], [323.0, 1622.0], [332.0, 3277.0], [333.0, 1693.6666666666667], [334.0, 2283.5], [335.0, 1467.6], [322.0, 1331.0], [337.0, 1608.25], [336.0, 2333.0], [338.0, 1781.5], [340.0, 1758.0], [339.0, 1765.0], [341.0, 2484.6666666666665], [344.0, 1497.3749999999998], [345.0, 1475.0], [351.0, 2182.0], [350.0, 1718.5], [348.0, 1300.2], [349.0, 1796.5], [343.0, 1565.0], [342.0, 2381.0], [346.0, 2150.0], [347.0, 1613.5], [364.0, 1663.2], [352.0, 2257.6666666666665], [353.0, 1971.5], [355.0, 3441.0], [354.0, 1965.0], [356.0, 1807.5], [357.0, 4086.0], [359.0, 2633.0], [358.0, 1937.0], [360.0, 1879.3333333333333], [361.0, 1494.5], [363.0, 1592.1666666666667], [362.0, 1513.2], [365.0, 1804.6666666666667], [367.0, 2124.0], [366.0, 2649.0], [371.0, 1721.0], [369.0, 1640.25], [370.0, 1885.5], [372.0, 1658.5], [375.0, 2889.0], [368.0, 1567.0], [374.0, 3122.6666666666665], [377.0, 1768.0], [379.0, 1855.3333333333333], [378.0, 2027.5], [380.0, 1679.5], [381.0, 1982.0], [383.0, 2137.75], [376.0, 2987.0], [382.0, 1849.75], [398.0, 2226.0], [386.0, 2223.5], [384.0, 1522.5], [385.0, 2859.0], [391.0, 1976.0], [390.0, 2535.0], [387.0, 2113.0], [397.0, 3138.0], [396.0, 2768.0], [388.0, 1637.0], [389.0, 2286.0], [395.0, 2054.5], [394.0, 1649.5], [399.0, 1528.75], [393.0, 1979.0], [392.0, 2544.0], [403.0, 1740.6666666666667], [401.0, 1671.6], [400.0, 1979.375], [407.0, 1972.0], [406.0, 2127.0], [402.0, 1845.875], [404.0, 1724.0], [405.0, 2097.5], [409.0, 2374.5], [411.0, 2077.0], [410.0, 1711.0], [413.0, 1975.0], [412.0, 2656.0], [415.0, 1591.0], [408.0, 2955.0], [414.0, 1054.0], [430.0, 2534.0], [418.0, 1761.0], [423.0, 1470.0], [417.0, 3038.0], [416.0, 2125.0], [422.0, 3335.0], [421.0, 2404.0], [420.0, 1985.0], [424.0, 2192.0], [425.0, 1847.0], [431.0, 2772.0], [429.0, 2144.0], [428.0, 2150.0], [419.0, 3671.0], [427.0, 2269.0], [426.0, 2139.0], [444.0, 1440.5], [434.0, 1611.0], [436.0, 1832.0], [438.0, 1851.0], [437.0, 2467.5], [435.0, 1794.0], [433.0, 1950.0], [432.0, 1863.0], [439.0, 3637.0], [440.0, 1843.0], [441.0, 2515.5], [442.0, 2066.3333333333335], [443.0, 2504.6666666666665], [446.0, 2283.5], [445.0, 3612.0], [447.0, 1996.0], [461.0, 1635.4], [449.0, 2581.0], [452.0, 920.0], [453.0, 3157.0], [455.0, 2117.0], [448.0, 2387.0], [454.0, 2255.0], [459.0, 1856.6], [458.0, 1087.0], [457.0, 2911.0], [456.0, 2503.0], [460.0, 1970.0], [451.0, 3608.0], [450.0, 2616.0], [463.0, 2173.5], [462.0, 2135.0], [476.0, 1880.3333333333333], [465.0, 2458.0], [464.0, 2064.0], [466.0, 1621.6666666666667], [467.0, 2128.0], [468.0, 1860.3333333333333], [470.0, 2369.0], [469.0, 1835.0], [471.0, 1947.0], [473.0, 2353.0], [475.0, 2201.8], [474.0, 2132.0], [477.0, 1747.6], [478.0, 1783.0], [479.0, 1893.5], [472.0, 1996.0], [493.0, 1443.3333333333333], [480.0, 1952.25], [482.0, 1810.0], [481.0, 3488.0], [492.0, 2444.0], [483.0, 2675.0], [484.0, 1766.5], [485.0, 1833.0], [487.0, 1904.3333333333333], [486.0, 1566.0], [488.0, 2641.3333333333335], [490.0, 2312.5], [489.0, 2016.5], [491.0, 1579.5], [494.0, 1956.0], [495.0, 1785.75], [496.0, 1978.0], [499.0, 1914.0], [498.0, 2099.0], [497.0, 2348.0], [508.0, 3615.0], [500.0, 1715.5], [503.0, 2562.0], [502.0, 2513.0], [501.0, 1903.3333333333333], [504.0, 1925.5], [507.0, 2646.0], [506.0, 2604.0], [505.0, 2323.0], [510.0, 1670.3333333333333], [511.0, 2241.6666666666665], [509.0, 2052.0], [519.0, 2266.0], [513.0, 1538.5], [514.0, 2383.3333333333335], [512.0, 2151.5], [526.0, 1882.6666666666667], [527.0, 2302.6666666666665], [515.0, 1958.6666666666667], [517.0, 2175.5], [516.0, 1863.0], [518.0, 1686.0], [520.0, 2052.75], [529.0, 2130.6666666666665], [531.0, 1955.0], [530.0, 3168.5], [533.0, 2178.0], [532.0, 3397.0], [535.0, 3286.0], [534.0, 2208.0], [528.0, 2317.25], [537.0, 1848.6666666666667], [539.0, 2062.5], [538.0, 2288.0], [540.0, 2393.0], [542.0, 2413.25], [543.0, 2195.6666666666665], [541.0, 2237.0], [536.0, 1619.75], [521.0, 1566.5], [522.0, 2088.75], [524.0, 2501.0], [523.0, 2678.0], [525.0, 2233.6666666666665], [547.0, 2245.3333333333335], [544.0, 1703.75], [558.0, 2307.8571428571427], [559.0, 2083.222222222222], [556.0, 2299.470588235294], [557.0, 2056.7000000000003], [555.0, 1941.6666666666667], [554.0, 2353.6666666666665], [545.0, 1981.857142857143], [546.0, 2461.2], [550.0, 2262.333333333333], [549.0, 2279.0], [548.0, 2199.5555555555557], [552.0, 1985.888888888889], [553.0, 2107.1], [551.0, 2419.5], [561.0, 2666.8], [562.0, 3123.0], [560.0, 2367.8], [1.0, 1656.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[233.75200000000007, 1278.270000000001]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 562.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8400.0, "minX": 1.54960836E12, "maxY": 14031.283333333333, "series": [{"data": [[1.54960836E12, 14031.283333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960836E12, 8400.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1278.270000000001, "minX": 1.54960836E12, "maxY": 1278.270000000001, "series": [{"data": [[1.54960836E12, 1278.270000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960836E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1278.260500000001, "minX": 1.54960836E12, "maxY": 1278.260500000001, "series": [{"data": [[1.54960836E12, 1278.260500000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960836E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 49.447500000000055, "minX": 1.54960836E12, "maxY": 49.447500000000055, "series": [{"data": [[1.54960836E12, 49.447500000000055]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960836E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 90.0, "minX": 1.54960836E12, "maxY": 4625.0, "series": [{"data": [[1.54960836E12, 4625.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960836E12, 90.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960836E12, 2548.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960836E12, 3879.9300000000003]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960836E12, 2880.7999999999993]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1210.5, "minX": 33.0, "maxY": 1210.5, "series": [{"data": [[33.0, 1210.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1210.5, "minX": 33.0, "maxY": 1210.5, "series": [{"data": [[33.0, 1210.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960836E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960836E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960836E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960836E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960836E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960836E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960836E12, "title": "Transactions Per Second"}},
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
