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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 120382.0, "series": [{"data": [[0.0, 2.0], [0.1, 3.0], [0.2, 4.0], [0.3, 4.0], [0.4, 8.0], [0.5, 11.0], [0.6, 13.0], [0.7, 15.0], [0.8, 18.0], [0.9, 19.0], [1.0, 21.0], [1.1, 23.0], [1.2, 25.0], [1.3, 27.0], [1.4, 29.0], [1.5, 30.0], [1.6, 32.0], [1.7, 34.0], [1.8, 35.0], [1.9, 37.0], [2.0, 39.0], [2.1, 41.0], [2.2, 42.0], [2.3, 44.0], [2.4, 46.0], [2.5, 47.0], [2.6, 49.0], [2.7, 51.0], [2.8, 52.0], [2.9, 54.0], [3.0, 56.0], [3.1, 57.0], [3.2, 59.0], [3.3, 61.0], [3.4, 62.0], [3.5, 64.0], [3.6, 66.0], [3.7, 67.0], [3.8, 69.0], [3.9, 70.0], [4.0, 72.0], [4.1, 74.0], [4.2, 75.0], [4.3, 77.0], [4.4, 79.0], [4.5, 80.0], [4.6, 82.0], [4.7, 83.0], [4.8, 85.0], [4.9, 86.0], [5.0, 88.0], [5.1, 89.0], [5.2, 91.0], [5.3, 92.0], [5.4, 94.0], [5.5, 95.0], [5.6, 96.0], [5.7, 98.0], [5.8, 99.0], [5.9, 101.0], [6.0, 102.0], [6.1, 103.0], [6.2, 105.0], [6.3, 106.0], [6.4, 107.0], [6.5, 109.0], [6.6, 110.0], [6.7, 111.0], [6.8, 113.0], [6.9, 114.0], [7.0, 116.0], [7.1, 117.0], [7.2, 118.0], [7.3, 120.0], [7.4, 121.0], [7.5, 122.0], [7.6, 123.0], [7.7, 125.0], [7.8, 126.0], [7.9, 127.0], [8.0, 129.0], [8.1, 130.0], [8.2, 131.0], [8.3, 133.0], [8.4, 134.0], [8.5, 135.0], [8.6, 136.0], [8.7, 137.0], [8.8, 138.0], [8.9, 140.0], [9.0, 141.0], [9.1, 142.0], [9.2, 143.0], [9.3, 145.0], [9.4, 146.0], [9.5, 147.0], [9.6, 148.0], [9.7, 149.0], [9.8, 150.0], [9.9, 152.0], [10.0, 153.0], [10.1, 154.0], [10.2, 155.0], [10.3, 156.0], [10.4, 158.0], [10.5, 159.0], [10.6, 160.0], [10.7, 161.0], [10.8, 162.0], [10.9, 164.0], [11.0, 165.0], [11.1, 166.0], [11.2, 167.0], [11.3, 169.0], [11.4, 170.0], [11.5, 171.0], [11.6, 172.0], [11.7, 173.0], [11.8, 174.0], [11.9, 175.0], [12.0, 176.0], [12.1, 177.0], [12.2, 179.0], [12.3, 180.0], [12.4, 181.0], [12.5, 182.0], [12.6, 183.0], [12.7, 185.0], [12.8, 186.0], [12.9, 187.0], [13.0, 188.0], [13.1, 190.0], [13.2, 191.0], [13.3, 192.0], [13.4, 193.0], [13.5, 194.0], [13.6, 195.0], [13.7, 196.0], [13.8, 198.0], [13.9, 199.0], [14.0, 200.0], [14.1, 201.0], [14.2, 202.0], [14.3, 203.0], [14.4, 205.0], [14.5, 206.0], [14.6, 207.0], [14.7, 208.0], [14.8, 209.0], [14.9, 210.0], [15.0, 212.0], [15.1, 213.0], [15.2, 214.0], [15.3, 215.0], [15.4, 216.0], [15.5, 217.0], [15.6, 219.0], [15.7, 220.0], [15.8, 221.0], [15.9, 222.0], [16.0, 224.0], [16.1, 225.0], [16.2, 226.0], [16.3, 227.0], [16.4, 228.0], [16.5, 230.0], [16.6, 231.0], [16.7, 232.0], [16.8, 233.0], [16.9, 234.0], [17.0, 236.0], [17.1, 237.0], [17.2, 238.0], [17.3, 239.0], [17.4, 240.0], [17.5, 241.0], [17.6, 243.0], [17.7, 244.0], [17.8, 245.0], [17.9, 246.0], [18.0, 247.0], [18.1, 249.0], [18.2, 250.0], [18.3, 251.0], [18.4, 252.0], [18.5, 254.0], [18.6, 255.0], [18.7, 256.0], [18.8, 257.0], [18.9, 259.0], [19.0, 260.0], [19.1, 261.0], [19.2, 262.0], [19.3, 263.0], [19.4, 264.0], [19.5, 266.0], [19.6, 267.0], [19.7, 268.0], [19.8, 269.0], [19.9, 271.0], [20.0, 272.0], [20.1, 273.0], [20.2, 274.0], [20.3, 276.0], [20.4, 277.0], [20.5, 278.0], [20.6, 280.0], [20.7, 281.0], [20.8, 282.0], [20.9, 283.0], [21.0, 284.0], [21.1, 286.0], [21.2, 287.0], [21.3, 288.0], [21.4, 289.0], [21.5, 291.0], [21.6, 292.0], [21.7, 293.0], [21.8, 294.0], [21.9, 295.0], [22.0, 297.0], [22.1, 298.0], [22.2, 299.0], [22.3, 300.0], [22.4, 302.0], [22.5, 303.0], [22.6, 304.0], [22.7, 306.0], [22.8, 307.0], [22.9, 308.0], [23.0, 309.0], [23.1, 311.0], [23.2, 312.0], [23.3, 313.0], [23.4, 314.0], [23.5, 316.0], [23.6, 317.0], [23.7, 318.0], [23.8, 319.0], [23.9, 320.0], [24.0, 322.0], [24.1, 323.0], [24.2, 324.0], [24.3, 326.0], [24.4, 327.0], [24.5, 328.0], [24.6, 330.0], [24.7, 331.0], [24.8, 332.0], [24.9, 333.0], [25.0, 335.0], [25.1, 336.0], [25.2, 337.0], [25.3, 338.0], [25.4, 340.0], [25.5, 341.0], [25.6, 342.0], [25.7, 343.0], [25.8, 345.0], [25.9, 346.0], [26.0, 348.0], [26.1, 349.0], [26.2, 350.0], [26.3, 352.0], [26.4, 353.0], [26.5, 355.0], [26.6, 356.0], [26.7, 357.0], [26.8, 359.0], [26.9, 360.0], [27.0, 361.0], [27.1, 363.0], [27.2, 364.0], [27.3, 365.0], [27.4, 367.0], [27.5, 368.0], [27.6, 370.0], [27.7, 371.0], [27.8, 372.0], [27.9, 374.0], [28.0, 375.0], [28.1, 377.0], [28.2, 378.0], [28.3, 379.0], [28.4, 381.0], [28.5, 382.0], [28.6, 384.0], [28.7, 385.0], [28.8, 387.0], [28.9, 388.0], [29.0, 390.0], [29.1, 391.0], [29.2, 393.0], [29.3, 395.0], [29.4, 396.0], [29.5, 398.0], [29.6, 399.0], [29.7, 400.0], [29.8, 402.0], [29.9, 403.0], [30.0, 405.0], [30.1, 406.0], [30.2, 408.0], [30.3, 410.0], [30.4, 411.0], [30.5, 412.0], [30.6, 414.0], [30.7, 416.0], [30.8, 417.0], [30.9, 419.0], [31.0, 420.0], [31.1, 422.0], [31.2, 423.0], [31.3, 425.0], [31.4, 426.0], [31.5, 428.0], [31.6, 429.0], [31.7, 431.0], [31.8, 432.0], [31.9, 434.0], [32.0, 436.0], [32.1, 437.0], [32.2, 439.0], [32.3, 440.0], [32.4, 442.0], [32.5, 444.0], [32.6, 446.0], [32.7, 447.0], [32.8, 449.0], [32.9, 451.0], [33.0, 453.0], [33.1, 454.0], [33.2, 456.0], [33.3, 457.0], [33.4, 459.0], [33.5, 461.0], [33.6, 462.0], [33.7, 464.0], [33.8, 465.0], [33.9, 467.0], [34.0, 469.0], [34.1, 471.0], [34.2, 473.0], [34.3, 475.0], [34.4, 476.0], [34.5, 478.0], [34.6, 480.0], [34.7, 482.0], [34.8, 484.0], [34.9, 486.0], [35.0, 488.0], [35.1, 490.0], [35.2, 492.0], [35.3, 494.0], [35.4, 495.0], [35.5, 497.0], [35.6, 499.0], [35.7, 502.0], [35.8, 503.0], [35.9, 505.0], [36.0, 507.0], [36.1, 510.0], [36.2, 511.0], [36.3, 514.0], [36.4, 516.0], [36.5, 518.0], [36.6, 520.0], [36.7, 522.0], [36.8, 524.0], [36.9, 526.0], [37.0, 528.0], [37.1, 531.0], [37.2, 533.0], [37.3, 535.0], [37.4, 537.0], [37.5, 539.0], [37.6, 541.0], [37.7, 543.0], [37.8, 545.0], [37.9, 547.0], [38.0, 549.0], [38.1, 552.0], [38.2, 554.0], [38.3, 556.0], [38.4, 558.0], [38.5, 560.0], [38.6, 562.0], [38.7, 564.0], [38.8, 566.0], [38.9, 569.0], [39.0, 571.0], [39.1, 573.0], [39.2, 576.0], [39.3, 578.0], [39.4, 580.0], [39.5, 583.0], [39.6, 585.0], [39.7, 588.0], [39.8, 590.0], [39.9, 592.0], [40.0, 595.0], [40.1, 597.0], [40.2, 599.0], [40.3, 602.0], [40.4, 604.0], [40.5, 606.0], [40.6, 609.0], [40.7, 611.0], [40.8, 615.0], [40.9, 617.0], [41.0, 620.0], [41.1, 623.0], [41.2, 625.0], [41.3, 628.0], [41.4, 631.0], [41.5, 634.0], [41.6, 637.0], [41.7, 640.0], [41.8, 643.0], [41.9, 645.0], [42.0, 648.0], [42.1, 651.0], [42.2, 653.0], [42.3, 656.0], [42.4, 658.0], [42.5, 661.0], [42.6, 664.0], [42.7, 667.0], [42.8, 669.0], [42.9, 673.0], [43.0, 676.0], [43.1, 679.0], [43.2, 682.0], [43.3, 686.0], [43.4, 689.0], [43.5, 692.0], [43.6, 695.0], [43.7, 698.0], [43.8, 701.0], [43.9, 705.0], [44.0, 708.0], [44.1, 711.0], [44.2, 715.0], [44.3, 718.0], [44.4, 722.0], [44.5, 725.0], [44.6, 728.0], [44.7, 731.0], [44.8, 734.0], [44.9, 738.0], [45.0, 741.0], [45.1, 744.0], [45.2, 748.0], [45.3, 752.0], [45.4, 755.0], [45.5, 759.0], [45.6, 763.0], [45.7, 767.0], [45.8, 770.0], [45.9, 774.0], [46.0, 778.0], [46.1, 782.0], [46.2, 786.0], [46.3, 789.0], [46.4, 793.0], [46.5, 798.0], [46.6, 802.0], [46.7, 806.0], [46.8, 810.0], [46.9, 814.0], [47.0, 818.0], [47.1, 822.0], [47.2, 826.0], [47.3, 831.0], [47.4, 835.0], [47.5, 839.0], [47.6, 843.0], [47.7, 847.0], [47.8, 851.0], [47.9, 854.0], [48.0, 859.0], [48.1, 863.0], [48.2, 868.0], [48.3, 872.0], [48.4, 876.0], [48.5, 881.0], [48.6, 886.0], [48.7, 891.0], [48.8, 895.0], [48.9, 899.0], [49.0, 903.0], [49.1, 908.0], [49.2, 912.0], [49.3, 917.0], [49.4, 922.0], [49.5, 926.0], [49.6, 932.0], [49.7, 936.0], [49.8, 941.0], [49.9, 945.0], [50.0, 950.0], [50.1, 955.0], [50.2, 959.0], [50.3, 964.0], [50.4, 968.0], [50.5, 973.0], [50.6, 978.0], [50.7, 983.0], [50.8, 989.0], [50.9, 994.0], [51.0, 999.0], [51.1, 1004.0], [51.2, 1009.0], [51.3, 1014.0], [51.4, 1019.0], [51.5, 1024.0], [51.6, 1029.0], [51.7, 1035.0], [51.8, 1040.0], [51.9, 1045.0], [52.0, 1050.0], [52.1, 1056.0], [52.2, 1061.0], [52.3, 1066.0], [52.4, 1071.0], [52.5, 1076.0], [52.6, 1082.0], [52.7, 1087.0], [52.8, 1092.0], [52.9, 1097.0], [53.0, 1103.0], [53.1, 1108.0], [53.2, 1113.0], [53.3, 1118.0], [53.4, 1124.0], [53.5, 1129.0], [53.6, 1135.0], [53.7, 1140.0], [53.8, 1146.0], [53.9, 1151.0], [54.0, 1156.0], [54.1, 1161.0], [54.2, 1168.0], [54.3, 1172.0], [54.4, 1177.0], [54.5, 1182.0], [54.6, 1187.0], [54.7, 1193.0], [54.8, 1198.0], [54.9, 1204.0], [55.0, 1209.0], [55.1, 1215.0], [55.2, 1220.0], [55.3, 1226.0], [55.4, 1232.0], [55.5, 1237.0], [55.6, 1243.0], [55.7, 1248.0], [55.8, 1253.0], [55.9, 1258.0], [56.0, 1264.0], [56.1, 1269.0], [56.2, 1274.0], [56.3, 1279.0], [56.4, 1284.0], [56.5, 1289.0], [56.6, 1295.0], [56.7, 1301.0], [56.8, 1307.0], [56.9, 1313.0], [57.0, 1320.0], [57.1, 1325.0], [57.2, 1331.0], [57.3, 1336.0], [57.4, 1342.0], [57.5, 1349.0], [57.6, 1354.0], [57.7, 1360.0], [57.8, 1365.0], [57.9, 1371.0], [58.0, 1377.0], [58.1, 1382.0], [58.2, 1388.0], [58.3, 1393.0], [58.4, 1398.0], [58.5, 1403.0], [58.6, 1409.0], [58.7, 1414.0], [58.8, 1419.0], [58.9, 1425.0], [59.0, 1430.0], [59.1, 1435.0], [59.2, 1440.0], [59.3, 1445.0], [59.4, 1450.0], [59.5, 1456.0], [59.6, 1461.0], [59.7, 1466.0], [59.8, 1470.0], [59.9, 1475.0], [60.0, 1480.0], [60.1, 1485.0], [60.2, 1489.0], [60.3, 1494.0], [60.4, 1499.0], [60.5, 1505.0], [60.6, 1510.0], [60.7, 1515.0], [60.8, 1519.0], [60.9, 1524.0], [61.0, 1529.0], [61.1, 1534.0], [61.2, 1539.0], [61.3, 1543.0], [61.4, 1548.0], [61.5, 1553.0], [61.6, 1558.0], [61.7, 1563.0], [61.8, 1568.0], [61.9, 1573.0], [62.0, 1577.0], [62.1, 1582.0], [62.2, 1587.0], [62.3, 1591.0], [62.4, 1596.0], [62.5, 1600.0], [62.6, 1605.0], [62.7, 1609.0], [62.8, 1613.0], [62.9, 1617.0], [63.0, 1622.0], [63.1, 1627.0], [63.2, 1631.0], [63.3, 1635.0], [63.4, 1639.0], [63.5, 1643.0], [63.6, 1647.0], [63.7, 1651.0], [63.8, 1655.0], [63.9, 1660.0], [64.0, 1664.0], [64.1, 1668.0], [64.2, 1671.0], [64.3, 1675.0], [64.4, 1680.0], [64.5, 1683.0], [64.6, 1688.0], [64.7, 1692.0], [64.8, 1696.0], [64.9, 1700.0], [65.0, 1704.0], [65.1, 1708.0], [65.2, 1712.0], [65.3, 1716.0], [65.4, 1719.0], [65.5, 1723.0], [65.6, 1727.0], [65.7, 1731.0], [65.8, 1734.0], [65.9, 1738.0], [66.0, 1741.0], [66.1, 1746.0], [66.2, 1750.0], [66.3, 1754.0], [66.4, 1758.0], [66.5, 1761.0], [66.6, 1765.0], [66.7, 1769.0], [66.8, 1772.0], [66.9, 1777.0], [67.0, 1780.0], [67.1, 1784.0], [67.2, 1787.0], [67.3, 1791.0], [67.4, 1795.0], [67.5, 1798.0], [67.6, 1802.0], [67.7, 1805.0], [67.8, 1809.0], [67.9, 1813.0], [68.0, 1817.0], [68.1, 1821.0], [68.2, 1825.0], [68.3, 1829.0], [68.4, 1833.0], [68.5, 1837.0], [68.6, 1841.0], [68.7, 1844.0], [68.8, 1848.0], [68.9, 1852.0], [69.0, 1856.0], [69.1, 1860.0], [69.2, 1864.0], [69.3, 1868.0], [69.4, 1872.0], [69.5, 1875.0], [69.6, 1878.0], [69.7, 1881.0], [69.8, 1885.0], [69.9, 1888.0], [70.0, 1891.0], [70.1, 1895.0], [70.2, 1897.0], [70.3, 1901.0], [70.4, 1905.0], [70.5, 1909.0], [70.6, 1912.0], [70.7, 1916.0], [70.8, 1919.0], [70.9, 1922.0], [71.0, 1925.0], [71.1, 1928.0], [71.2, 1932.0], [71.3, 1935.0], [71.4, 1939.0], [71.5, 1942.0], [71.6, 1945.0], [71.7, 1948.0], [71.8, 1952.0], [71.9, 1955.0], [72.0, 1958.0], [72.1, 1962.0], [72.2, 1965.0], [72.3, 1968.0], [72.4, 1971.0], [72.5, 1974.0], [72.6, 1977.0], [72.7, 1980.0], [72.8, 1983.0], [72.9, 1987.0], [73.0, 1990.0], [73.1, 1994.0], [73.2, 1997.0], [73.3, 2000.0], [73.4, 2003.0], [73.5, 2006.0], [73.6, 2010.0], [73.7, 2013.0], [73.8, 2016.0], [73.9, 2020.0], [74.0, 2023.0], [74.1, 2026.0], [74.2, 2029.0], [74.3, 2032.0], [74.4, 2036.0], [74.5, 2040.0], [74.6, 2042.0], [74.7, 2045.0], [74.8, 2048.0], [74.9, 2051.0], [75.0, 2054.0], [75.1, 2058.0], [75.2, 2061.0], [75.3, 2064.0], [75.4, 2067.0], [75.5, 2070.0], [75.6, 2073.0], [75.7, 2076.0], [75.8, 2079.0], [75.9, 2082.0], [76.0, 2085.0], [76.1, 2088.0], [76.2, 2091.0], [76.3, 2094.0], [76.4, 2097.0], [76.5, 2100.0], [76.6, 2103.0], [76.7, 2106.0], [76.8, 2109.0], [76.9, 2112.0], [77.0, 2115.0], [77.1, 2119.0], [77.2, 2122.0], [77.3, 2125.0], [77.4, 2128.0], [77.5, 2131.0], [77.6, 2134.0], [77.7, 2137.0], [77.8, 2140.0], [77.9, 2144.0], [78.0, 2147.0], [78.1, 2150.0], [78.2, 2152.0], [78.3, 2156.0], [78.4, 2158.0], [78.5, 2161.0], [78.6, 2164.0], [78.7, 2167.0], [78.8, 2170.0], [78.9, 2173.0], [79.0, 2176.0], [79.1, 2178.0], [79.2, 2181.0], [79.3, 2184.0], [79.4, 2187.0], [79.5, 2189.0], [79.6, 2192.0], [79.7, 2194.0], [79.8, 2198.0], [79.9, 2201.0], [80.0, 2204.0], [80.1, 2207.0], [80.2, 2210.0], [80.3, 2212.0], [80.4, 2216.0], [80.5, 2219.0], [80.6, 2222.0], [80.7, 2226.0], [80.8, 2228.0], [80.9, 2231.0], [81.0, 2234.0], [81.1, 2237.0], [81.2, 2240.0], [81.3, 2243.0], [81.4, 2246.0], [81.5, 2249.0], [81.6, 2252.0], [81.7, 2256.0], [81.8, 2259.0], [81.9, 2262.0], [82.0, 2265.0], [82.1, 2268.0], [82.2, 2271.0], [82.3, 2274.0], [82.4, 2277.0], [82.5, 2280.0], [82.6, 2284.0], [82.7, 2287.0], [82.8, 2290.0], [82.9, 2294.0], [83.0, 2298.0], [83.1, 2301.0], [83.2, 2304.0], [83.3, 2308.0], [83.4, 2312.0], [83.5, 2316.0], [83.6, 2320.0], [83.7, 2323.0], [83.8, 2327.0], [83.9, 2331.0], [84.0, 2335.0], [84.1, 2339.0], [84.2, 2343.0], [84.3, 2347.0], [84.4, 2351.0], [84.5, 2355.0], [84.6, 2358.0], [84.7, 2362.0], [84.8, 2367.0], [84.9, 2371.0], [85.0, 2375.0], [85.1, 2379.0], [85.2, 2384.0], [85.3, 2388.0], [85.4, 2392.0], [85.5, 2396.0], [85.6, 2400.0], [85.7, 2405.0], [85.8, 2410.0], [85.9, 2415.0], [86.0, 2419.0], [86.1, 2424.0], [86.2, 2428.0], [86.3, 2432.0], [86.4, 2438.0], [86.5, 2442.0], [86.6, 2448.0], [86.7, 2453.0], [86.8, 2458.0], [86.9, 2463.0], [87.0, 2468.0], [87.1, 2475.0], [87.2, 2480.0], [87.3, 2485.0], [87.4, 2491.0], [87.5, 2497.0], [87.6, 2504.0], [87.7, 2511.0], [87.8, 2517.0], [87.9, 2523.0], [88.0, 2529.0], [88.1, 2537.0], [88.2, 2545.0], [88.3, 2552.0], [88.4, 2560.0], [88.5, 2569.0], [88.6, 2578.0], [88.7, 2587.0], [88.8, 2595.0], [88.9, 2604.0], [89.0, 2613.0], [89.1, 2621.0], [89.2, 2630.0], [89.3, 2639.0], [89.4, 2648.0], [89.5, 2658.0], [89.6, 2667.0], [89.7, 2676.0], [89.8, 2686.0], [89.9, 2696.0], [90.0, 2706.0], [90.1, 2716.0], [90.2, 2727.0], [90.3, 2737.0], [90.4, 2747.0], [90.5, 2758.0], [90.6, 2768.0], [90.7, 2780.0], [90.8, 2791.0], [90.9, 2802.0], [91.0, 2812.0], [91.1, 2824.0], [91.2, 2836.0], [91.3, 2849.0], [91.4, 2861.0], [91.5, 2873.0], [91.6, 2886.0], [91.7, 2897.0], [91.8, 2907.0], [91.9, 2919.0], [92.0, 2933.0], [92.1, 2945.0], [92.2, 2957.0], [92.3, 2968.0], [92.4, 2980.0], [92.5, 2991.0], [92.6, 3005.0], [92.7, 3016.0], [92.8, 3028.0], [92.9, 3041.0], [93.0, 3054.0], [93.1, 3067.0], [93.2, 3080.0], [93.3, 3093.0], [93.4, 3106.0], [93.5, 3118.0], [93.6, 3131.0], [93.7, 3144.0], [93.8, 3160.0], [93.9, 3174.0], [94.0, 3188.0], [94.1, 3203.0], [94.2, 3218.0], [94.3, 3234.0], [94.4, 3252.0], [94.5, 3269.0], [94.6, 3286.0], [94.7, 3303.0], [94.8, 3323.0], [94.9, 3341.0], [95.0, 3359.0], [95.1, 3379.0], [95.2, 3398.0], [95.3, 3419.0], [95.4, 3445.0], [95.5, 3469.0], [95.6, 3495.0], [95.7, 3519.0], [95.8, 3540.0], [95.9, 3561.0], [96.0, 3586.0], [96.1, 3615.0], [96.2, 3646.0], [96.3, 3680.0], [96.4, 3707.0], [96.5, 3738.0], [96.6, 3765.0], [96.7, 3800.0], [96.8, 3840.0], [96.9, 3889.0], [97.0, 3933.0], [97.1, 3973.0], [97.2, 4017.0], [97.3, 4065.0], [97.4, 4113.0], [97.5, 4171.0], [97.6, 4227.0], [97.7, 4280.0], [97.8, 4338.0], [97.9, 4401.0], [98.0, 4471.0], [98.1, 4546.0], [98.2, 4623.0], [98.3, 4701.0], [98.4, 4802.0], [98.5, 4959.0], [98.6, 5125.0], [98.7, 5340.0], [98.8, 5640.0], [98.9, 6023.0], [99.0, 6405.0], [99.1, 7052.0], [99.2, 7649.0], [99.3, 13460.0], [99.4, 19464.0], [99.5, 22690.0], [99.6, 26715.0], [99.7, 28386.0], [99.8, 32137.0], [99.9, 39961.0], [100.0, 120382.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 11298.0, "series": [{"data": [[0.0, 7966.0], [68300.0, 1.0], [69900.0, 6.0], [100.0, 11098.0], [32900.0, 2.0], [33700.0, 3.0], [34500.0, 1.0], [35300.0, 1.0], [40100.0, 2.0], [46500.0, 2.0], [47300.0, 3.0], [48100.0, 1.0], [50500.0, 5.0], [200.0, 11298.0], [51300.0, 2.0], [52100.0, 1.0], [64900.0, 1.0], [69000.0, 1.0], [300.0, 10138.0], [400.0, 8148.0], [500.0, 6304.0], [600.0, 4810.0], [700.0, 3842.0], [800.0, 3247.0], [900.0, 2849.0], [1000.0, 2637.0], [1100.0, 2566.0], [1200.0, 2549.0], [1300.0, 2395.0], [1400.0, 2692.0], [1500.0, 2831.0], [1600.0, 3307.0], [1700.0, 3600.0], [1800.0, 3745.0], [1900.0, 4126.0], [2000.0, 4357.0], [2100.0, 4630.0], [2300.0, 3456.0], [2200.0, 4366.0], [2400.0, 2660.0], [2500.0, 1808.0], [2600.0, 1466.0], [2700.0, 1292.0], [2800.0, 1161.0], [2900.0, 1132.0], [3000.0, 1076.0], [3100.0, 1009.0], [3200.0, 831.0], [3300.0, 706.0], [3400.0, 568.0], [3500.0, 579.0], [3700.0, 455.0], [3600.0, 440.0], [3800.0, 308.0], [3900.0, 327.0], [4000.0, 293.0], [4200.0, 261.0], [4100.0, 236.0], [4300.0, 209.0], [68100.0, 1.0], [66500.0, 1.0], [4500.0, 190.0], [4600.0, 165.0], [4400.0, 196.0], [69700.0, 7.0], [4700.0, 136.0], [4800.0, 95.0], [4900.0, 86.0], [5000.0, 76.0], [5100.0, 74.0], [5200.0, 58.0], [5300.0, 53.0], [5500.0, 53.0], [5400.0, 40.0], [5600.0, 39.0], [5800.0, 36.0], [5700.0, 36.0], [5900.0, 30.0], [6000.0, 41.0], [6100.0, 41.0], [6200.0, 32.0], [6300.0, 31.0], [6500.0, 24.0], [6400.0, 29.0], [6600.0, 16.0], [6900.0, 22.0], [6700.0, 21.0], [6800.0, 13.0], [7000.0, 27.0], [7100.0, 35.0], [7400.0, 26.0], [7200.0, 24.0], [7300.0, 19.0], [7600.0, 14.0], [7500.0, 10.0], [7900.0, 10.0], [7700.0, 15.0], [7800.0, 6.0], [8000.0, 2.0], [8100.0, 5.0], [8200.0, 7.0], [8600.0, 5.0], [8400.0, 6.0], [9000.0, 7.0], [8800.0, 5.0], [9200.0, 3.0], [9400.0, 3.0], [9600.0, 1.0], [9800.0, 1.0], [10600.0, 2.0], [11000.0, 1.0], [12000.0, 1.0], [12200.0, 3.0], [11800.0, 1.0], [12600.0, 2.0], [12800.0, 2.0], [13200.0, 1.0], [13400.0, 2.0], [13800.0, 6.0], [14000.0, 1.0], [14400.0, 2.0], [14600.0, 4.0], [15000.0, 1.0], [15200.0, 1.0], [15800.0, 1.0], [15400.0, 2.0], [16400.0, 5.0], [16800.0, 3.0], [17200.0, 2.0], [18400.0, 3.0], [17600.0, 1.0], [18000.0, 3.0], [18800.0, 7.0], [19200.0, 3.0], [19600.0, 1.0], [20400.0, 1.0], [20000.0, 2.0], [20800.0, 3.0], [21200.0, 4.0], [22000.0, 12.0], [22400.0, 7.0], [21600.0, 6.0], [22800.0, 2.0], [23200.0, 2.0], [24400.0, 5.0], [23600.0, 3.0], [24000.0, 2.0], [25200.0, 1.0], [24800.0, 6.0], [26400.0, 5.0], [26000.0, 3.0], [25600.0, 3.0], [27200.0, 8.0], [27600.0, 9.0], [26800.0, 14.0], [28000.0, 3.0], [28400.0, 6.0], [28800.0, 5.0], [29600.0, 1.0], [29200.0, 1.0], [30400.0, 8.0], [30000.0, 1.0], [31200.0, 3.0], [30800.0, 4.0], [31600.0, 15.0], [32000.0, 8.0], [32400.0, 6.0], [32800.0, 3.0], [34400.0, 9.0], [35200.0, 1.0], [36800.0, 2.0], [40000.0, 3.0], [47200.0, 1.0], [48000.0, 1.0], [67200.0, 1.0], [70400.0, 1.0], [120000.0, 2.0], [68700.0, 1.0], [70300.0, 3.0], [34700.0, 1.0], [33900.0, 2.0], [33100.0, 2.0], [35500.0, 3.0], [36300.0, 1.0], [39500.0, 1.0], [40300.0, 1.0], [41100.0, 1.0], [48300.0, 2.0], [50700.0, 3.0], [69400.0, 3.0], [66200.0, 4.0], [68500.0, 1.0], [16500.0, 1.0], [17300.0, 1.0], [16900.0, 1.0], [17700.0, 8.0], [18100.0, 2.0], [18500.0, 2.0], [18900.0, 5.0], [19300.0, 2.0], [20100.0, 2.0], [21300.0, 1.0], [20500.0, 5.0], [20900.0, 1.0], [22100.0, 13.0], [21700.0, 4.0], [22500.0, 2.0], [23300.0, 3.0], [22900.0, 1.0], [24500.0, 4.0], [24100.0, 2.0], [23700.0, 2.0], [24900.0, 2.0], [25300.0, 1.0], [26100.0, 3.0], [26500.0, 5.0], [25700.0, 2.0], [27300.0, 10.0], [26900.0, 10.0], [27700.0, 5.0], [28100.0, 7.0], [28500.0, 4.0], [28900.0, 2.0], [30500.0, 4.0], [29700.0, 1.0], [30100.0, 1.0], [30900.0, 6.0], [31300.0, 4.0], [31700.0, 5.0], [32500.0, 4.0], [32100.0, 9.0], [34600.0, 3.0], [33000.0, 5.0], [35400.0, 1.0], [36200.0, 1.0], [40200.0, 2.0], [46600.0, 1.0], [47400.0, 2.0], [50600.0, 3.0], [51400.0, 1.0], [52200.0, 1.0], [69100.0, 1.0], [120300.0, 2.0], [33300.0, 5.0], [34100.0, 4.0], [34900.0, 3.0], [38100.0, 1.0], [39700.0, 1.0], [40500.0, 1.0], [46900.0, 4.0], [49300.0, 3.0], [65300.0, 1.0], [68200.0, 1.0], [69800.0, 2.0], [8300.0, 5.0], [8500.0, 3.0], [8700.0, 3.0], [8900.0, 4.0], [9100.0, 4.0], [9300.0, 2.0], [9700.0, 1.0], [9900.0, 2.0], [10100.0, 1.0], [10500.0, 1.0], [11100.0, 1.0], [10900.0, 1.0], [11300.0, 1.0], [11700.0, 3.0], [11900.0, 1.0], [12100.0, 2.0], [12300.0, 1.0], [12500.0, 2.0], [13300.0, 1.0], [12900.0, 2.0], [13700.0, 1.0], [13500.0, 1.0], [13900.0, 1.0], [14300.0, 3.0], [14100.0, 2.0], [14900.0, 1.0], [15700.0, 1.0], [15900.0, 2.0], [16600.0, 4.0], [17400.0, 3.0], [17000.0, 7.0], [17800.0, 4.0], [18200.0, 3.0], [19400.0, 3.0], [18600.0, 6.0], [19000.0, 6.0], [20200.0, 1.0], [20600.0, 2.0], [21000.0, 3.0], [21400.0, 1.0], [22200.0, 15.0], [21800.0, 14.0], [23400.0, 5.0], [22600.0, 4.0], [23000.0, 2.0], [24200.0, 4.0], [25000.0, 4.0], [25400.0, 6.0], [24600.0, 3.0], [25800.0, 3.0], [26200.0, 2.0], [26600.0, 7.0], [27000.0, 12.0], [27400.0, 8.0], [28200.0, 4.0], [27800.0, 4.0], [28600.0, 1.0], [30600.0, 8.0], [30200.0, 3.0], [29800.0, 1.0], [31000.0, 4.0], [31400.0, 3.0], [32600.0, 3.0], [31800.0, 10.0], [32200.0, 6.0], [34800.0, 4.0], [34000.0, 2.0], [33200.0, 4.0], [35600.0, 1.0], [40400.0, 2.0], [41200.0, 2.0], [46800.0, 1.0], [47600.0, 2.0], [50800.0, 2.0], [53200.0, 1.0], [68000.0, 2.0], [69600.0, 1.0], [66400.0, 2.0], [69500.0, 4.0], [34300.0, 5.0], [33500.0, 5.0], [35100.0, 2.0], [36700.0, 2.0], [37500.0, 1.0], [39900.0, 4.0], [40700.0, 1.0], [47100.0, 3.0], [45500.0, 1.0], [47900.0, 1.0], [50300.0, 1.0], [65500.0, 1.0], [63900.0, 1.0], [67000.0, 1.0], [68600.0, 2.0], [70200.0, 5.0], [69300.0, 1.0], [16700.0, 4.0], [17100.0, 3.0], [17500.0, 4.0], [18300.0, 3.0], [17900.0, 1.0], [18700.0, 4.0], [19100.0, 4.0], [20300.0, 1.0], [19500.0, 3.0], [19900.0, 1.0], [21500.0, 1.0], [20700.0, 1.0], [21100.0, 2.0], [22300.0, 13.0], [21900.0, 10.0], [22700.0, 4.0], [23100.0, 4.0], [23500.0, 13.0], [24300.0, 5.0], [23900.0, 2.0], [25500.0, 2.0], [24700.0, 2.0], [25100.0, 3.0], [26300.0, 3.0], [25900.0, 2.0], [27500.0, 4.0], [26700.0, 14.0], [27100.0, 20.0], [28300.0, 7.0], [27900.0, 2.0], [28700.0, 2.0], [29100.0, 1.0], [29500.0, 2.0], [30300.0, 2.0], [30700.0, 2.0], [29900.0, 2.0], [31100.0, 3.0], [31500.0, 2.0], [31900.0, 6.0], [32700.0, 2.0], [32300.0, 9.0], [33400.0, 3.0], [34200.0, 5.0], [35800.0, 1.0], [35000.0, 2.0], [39800.0, 5.0], [47000.0, 2.0], [47800.0, 2.0], [51000.0, 1.0], [63800.0, 2.0], [70000.0, 5.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 120300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 2887.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 54091.0, "series": [{"data": [[1.0, 33227.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 2887.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 46445.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 54091.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 530.0401482396533, "minX": 1.54979322E12, "maxY": 1245.1253211462458, "series": [{"data": [[1.54979352E12, 821.4913945122398], [1.54979322E12, 689.2333012864548], [1.54979358E12, 1155.6508415215508], [1.54979328E12, 1245.1253211462458], [1.54979334E12, 530.0401482396533]], "isOverall": false, "label": "jp@gc - Ultimate Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54979358E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 10.0, "minX": 1.0, "maxY": 20068.666666666664, "series": [{"data": [[2.0, 10941.909090909092], [3.0, 10012.083333333334], [4.0, 6325.736842105263], [5.0, 10.0], [6.0, 10.136363636363638], [7.0, 11.458333333333334], [8.0, 36.91304347826087], [9.0, 18.666666666666668], [10.0, 18.32258064516129], [11.0, 17.882352941176475], [12.0, 20.459459459459456], [13.0, 20.909090909090907], [14.0, 25.08571428571429], [15.0, 26.58333333333333], [16.0, 30.030303030303028], [17.0, 29.0], [18.0, 30.487179487179493], [19.0, 31.108695652173918], [20.0, 35.74193548387096], [21.0, 32.75609756097561], [22.0, 30.631578947368418], [23.0, 33.90243902439024], [24.0, 41.611111111111114], [25.0, 35.66666666666668], [26.0, 37.61111111111111], [27.0, 32.93548387096774], [28.0, 54.10416666666667], [29.0, 42.714285714285715], [30.0, 57.948717948717935], [31.0, 53.41666666666666], [32.0, 54.0], [33.0, 51.2093023255814], [34.0, 56.10526315789473], [35.0, 67.51851851851852], [36.0, 94.52499999999999], [37.0, 51.34146341463415], [38.0, 82.21212121212123], [39.0, 103.25], [40.0, 79.89999999999999], [41.0, 76.81395348837209], [42.0, 74.8235294117647], [43.0, 70.54838709677419], [44.0, 72.39130434782611], [45.0, 57.224999999999994], [46.0, 59.68571428571428], [47.0, 92.18750000000003], [48.0, 68.78260869565219], [49.0, 61.370370370370374], [50.0, 80.17187500000001], [51.0, 81.41025641025641], [52.0, 109.33333333333333], [53.0, 114.64864864864867], [54.0, 83.41509433962263], [55.0, 86.22727272727275], [56.0, 77.13157894736841], [57.0, 88.5], [58.0, 90.30612244897958], [59.0, 76.77777777777777], [60.0, 85.13793103448275], [61.0, 80.28125000000001], [63.0, 81.25757575757575], [62.0, 77.1276595744681], [64.0, 75.79591836734696], [65.0, 72.6896551724138], [66.0, 80.7017543859649], [67.0, 94.67500000000001], [68.0, 112.06666666666669], [69.0, 93.44444444444444], [70.0, 67.88709677419357], [71.0, 89.90000000000002], [72.0, 101.46551724137932], [73.0, 106.89473684210526], [74.0, 132.62962962962962], [75.0, 130.9245283018868], [76.0, 138.6835443037975], [77.0, 167.14634146341464], [78.0, 241.71428571428572], [79.0, 124.12500000000001], [80.0, 151.55555555555554], [81.0, 248.90322580645164], [82.0, 214.81081081081078], [83.0, 187.5263157894737], [84.0, 197.71052631578948], [85.0, 122.99999999999999], [86.0, 197.16666666666666], [87.0, 164.00000000000003], [88.0, 255.35294117647055], [89.0, 164.95833333333343], [90.0, 219.65000000000003], [91.0, 181.0588235294117], [92.0, 269.44444444444446], [93.0, 207.9375], [94.0, 166.4615384615385], [95.0, 131.73913043478262], [96.0, 152.16129032258067], [97.0, 197.89999999999998], [98.0, 132.68627450980392], [99.0, 138.0357142857143], [100.0, 154.33333333333334], [101.0, 142.3928571428571], [102.0, 207.0], [103.0, 199.75000000000003], [104.0, 216.67346938775512], [105.0, 206.77272727272728], [106.0, 347.5161290322581], [107.0, 204.53333333333336], [108.0, 220.41860465116278], [109.0, 220.28571428571433], [110.0, 249.0], [111.0, 384.74074074074076], [112.0, 185.05714285714288], [113.0, 212.82758620689657], [114.0, 256.25925925925924], [115.0, 190.9591836734694], [116.0, 218.84210526315786], [117.0, 196.83783783783784], [118.0, 209.64864864864862], [119.0, 197.56], [120.0, 195.93749999999994], [121.0, 184.78378378378375], [122.0, 248.9705882352941], [123.0, 246.50000000000003], [124.0, 180.40384615384616], [125.0, 197.9807692307692], [126.0, 169.3947368421053], [127.0, 207.60869565217394], [128.0, 272.11999999999995], [129.0, 239.31034482758622], [130.0, 169.88461538461536], [131.0, 222.79245283018867], [132.0, 172.08333333333334], [133.0, 250.30645161290323], [134.0, 233.0555555555556], [135.0, 218.18604651162795], [136.0, 256.375], [137.0, 191.58620689655172], [138.0, 219.5161290322581], [139.0, 298.8787878787879], [140.0, 210.81818181818187], [141.0, 222.804347826087], [142.0, 224.41666666666669], [143.0, 229.1304347826087], [144.0, 261.69999999999993], [145.0, 303.8620689655172], [146.0, 269.58974358974353], [147.0, 224.22222222222223], [148.0, 273.0666666666666], [149.0, 195.20833333333334], [150.0, 361.6896551724138], [151.0, 374.2105263157895], [152.0, 339.27659574468083], [153.0, 177.06], [154.0, 181.4285714285714], [155.0, 209.0], [156.0, 168.46938775510202], [157.0, 158.8125], [158.0, 183.44444444444446], [159.0, 176.29787234042558], [160.0, 240.30000000000004], [161.0, 191.09756097560972], [162.0, 278.63888888888886], [163.0, 233.26829268292687], [164.0, 186.089552238806], [165.0, 245.19999999999996], [166.0, 192.83870967741933], [167.0, 222.75], [168.0, 193.14814814814815], [169.0, 270.7307692307692], [170.0, 189.25000000000003], [171.0, 258.1], [172.0, 272.62025316455697], [173.0, 293.55102040816337], [174.0, 287.12307692307695], [175.0, 234.35294117647067], [176.0, 213.12499999999997], [177.0, 168.09090909090912], [178.0, 133.22580645161287], [179.0, 270.8095238095239], [180.0, 256.42499999999995], [181.0, 235.5581395348837], [182.0, 256.7551020408163], [183.0, 243.77192982456137], [184.0, 193.44680851063828], [185.0, 251.3061224489796], [186.0, 263.1754385964912], [187.0, 251.58139534883722], [188.0, 208.74418604651163], [189.0, 240.22222222222223], [190.0, 341.36666666666673], [191.0, 225.51999999999998], [192.0, 234.14285714285703], [193.0, 262.44736842105266], [194.0, 300.5777777777778], [195.0, 223.59574468085103], [196.0, 215.62068965517244], [197.0, 217.86666666666667], [198.0, 402.7692307692308], [199.0, 271.08333333333326], [200.0, 407.95918367346934], [201.0, 304.1884057971014], [202.0, 227.2], [203.0, 227.8888888888889], [204.0, 319.56666666666666], [205.0, 255.00000000000003], [206.0, 272.71641791044783], [207.0, 284.74999999999994], [208.0, 322.3157894736842], [209.0, 414.2], [210.0, 259.3703703703703], [211.0, 229.45238095238096], [212.0, 331.18181818181813], [213.0, 387.0285714285714], [214.0, 290.5833333333335], [215.0, 403.42424242424244], [216.0, 261.46153846153857], [217.0, 311.1315789473684], [218.0, 216.1538461538462], [219.0, 304.3333333333333], [220.0, 411.8], [221.0, 406.33333333333337], [222.0, 325.3191489361702], [223.0, 325.91666666666674], [224.0, 215.29508196721315], [225.0, 331.64788732394356], [226.0, 315.69047619047615], [227.0, 363.41935483870964], [228.0, 189.56862745098036], [229.0, 236.60526315789477], [230.0, 331.96969696969694], [231.0, 380.6122448979592], [232.0, 447.1621621621622], [233.0, 349.6415094339622], [234.0, 277.33333333333337], [235.0, 258.99999999999994], [236.0, 303.8979591836734], [237.0, 304.47368421052624], [238.0, 332.47222222222223], [239.0, 484.022727272727], [240.0, 422.0227272727273], [241.0, 378.92105263157896], [242.0, 419.1764705882353], [243.0, 447.6031746031747], [244.0, 286.9636363636363], [245.0, 354.7090909090907], [246.0, 284.9821428571429], [247.0, 220.73333333333338], [248.0, 320.2040816326531], [249.0, 366.6666666666667], [250.0, 378.8214285714285], [251.0, 221.1428571428571], [252.0, 357.67741935483866], [253.0, 446.63157894736844], [254.0, 623.9999999999998], [255.0, 203.90909090909093], [257.0, 314.1282051282051], [256.0, 369.0000000000001], [258.0, 297.6666666666667], [259.0, 310.17021276595744], [260.0, 260.3636363636363], [261.0, 334.67999999999995], [262.0, 475.3414634146342], [263.0, 415.84615384615375], [264.0, 270.8205128205129], [270.0, 364.85714285714295], [271.0, 333.06666666666655], [268.0, 303.8108108108108], [269.0, 409.5476190476191], [265.0, 358.8409090909091], [266.0, 410.3636363636364], [267.0, 602.1923076923077], [273.0, 448.90243902439016], [272.0, 390.58620689655174], [274.0, 447.030303030303], [275.0, 427.43333333333334], [276.0, 460.6774193548386], [277.0, 549.8000000000001], [278.0, 327.87499999999994], [279.0, 354.6923076923077], [280.0, 443.2272727272725], [286.0, 650.1739130434783], [287.0, 416.3913043478261], [284.0, 407.44230769230757], [285.0, 605.5192307692308], [281.0, 411.41509433962256], [282.0, 275.5581395348839], [283.0, 523.1399999999998], [289.0, 638.4583333333334], [288.0, 475.51282051282055], [290.0, 630.7826086956522], [291.0, 785.6666666666666], [292.0, 622.423076923077], [293.0, 887.423076923077], [294.0, 819.0303030303031], [295.0, 777.09375], [296.0, 619.8157894736843], [302.0, 559.219512195122], [303.0, 544.9354838709677], [300.0, 527.9411764705882], [301.0, 540.5555555555554], [297.0, 528.2631578947369], [298.0, 379.89189189189193], [299.0, 567.325], [305.0, 410.17391304347814], [304.0, 361.2222222222223], [306.0, 773.4324324324323], [307.0, 551.720930232558], [308.0, 455.4516129032258], [309.0, 563.7105263157895], [310.0, 580.8974358974358], [311.0, 509.41025641025647], [312.0, 397.46], [318.0, 772.8108108108107], [319.0, 617.0000000000001], [316.0, 467.0810810810811], [317.0, 451.0303030303031], [313.0, 404.5192307692308], [314.0, 465.26666666666677], [315.0, 643.8536585365852], [321.0, 716.9696969696971], [320.0, 529.5348837209302], [322.0, 810.7560975609757], [323.0, 767.7567567567569], [324.0, 674.6], [325.0, 710.0689655172415], [327.0, 674.9375000000002], [326.0, 647.0384615384617], [328.0, 537.1707317073171], [334.0, 482.1190476190476], [335.0, 669.6451612903226], [332.0, 742.44], [333.0, 506.41176470588243], [329.0, 592.7045454545456], [330.0, 580.1860465116279], [331.0, 540.8124999999999], [337.0, 412.0540540540539], [336.0, 507.3409090909093], [338.0, 513.5555555555555], [339.0, 326.12820512820514], [340.0, 498.9148936170212], [341.0, 466.3428571428572], [342.0, 500.1538461538462], [343.0, 628.0789473684213], [344.0, 520.4736842105262], [350.0, 528.2888888888889], [351.0, 481.51162790697674], [348.0, 621.0975609756097], [349.0, 509.0465116279071], [345.0, 688.1111111111112], [346.0, 697.622950819672], [347.0, 685.2857142857142], [353.0, 467.25], [352.0, 699.2352941176471], [354.0, 297.75], [355.0, 328.92105263157885], [356.0, 408.6799999999999], [357.0, 535.121212121212], [358.0, 399.1515151515151], [359.0, 398.425], [360.0, 464.517857142857], [366.0, 487.375], [367.0, 536.9767441860465], [364.0, 556.5116279069766], [365.0, 412.32], [361.0, 603.4999999999998], [362.0, 423.2820512820513], [363.0, 540.5384615384614], [369.0, 364.9473684210527], [368.0, 519.2888888888889], [370.0, 544.5681818181819], [371.0, 477.53846153846155], [372.0, 575.7567567567568], [373.0, 334.0476190476191], [374.0, 494.15384615384613], [375.0, 719.7307692307695], [376.0, 595.6964285714287], [382.0, 532.7213114754098], [383.0, 660.6136363636366], [380.0, 593.9767441860467], [381.0, 562.1999999999999], [377.0, 783.1666666666666], [378.0, 407.47058823529414], [379.0, 730.0192307692308], [385.0, 613.7777777777779], [384.0, 589.0624999999999], [386.0, 428.5625], [387.0, 602.9230769230769], [388.0, 538.9666666666667], [389.0, 512.7307692307693], [390.0, 451.05405405405406], [391.0, 437.41666666666663], [392.0, 579.9210526315791], [398.0, 516.7894736842106], [399.0, 459.904761904762], [396.0, 507.0571428571428], [397.0, 612.25], [393.0, 570.4166666666666], [394.0, 724.0625], [395.0, 520.4347826086957], [401.0, 602.6521739130432], [400.0, 531.268292682927], [402.0, 676.3589743589743], [403.0, 624.8571428571431], [404.0, 598.3181818181818], [405.0, 697.7333333333332], [406.0, 699.9411764705878], [407.0, 783.9615384615385], [408.0, 889.2083333333333], [414.0, 437.49999999999994], [415.0, 663.2765957446809], [412.0, 840.102564102564], [413.0, 513.3793103448276], [409.0, 756.1944444444442], [410.0, 726.6904761904761], [411.0, 674.0810810810809], [417.0, 605.82], [416.0, 738.4571428571429], [418.0, 507.45454545454544], [419.0, 650.9473684210525], [420.0, 621.4871794871794], [421.0, 805.5757575757575], [422.0, 541.8666666666667], [423.0, 554.1999999999999], [424.0, 503.6857142857143], [430.0, 540.1785714285714], [431.0, 558.0625], [428.0, 566.1071428571429], [429.0, 718.974358974359], [425.0, 671.6428571428572], [426.0, 686.3939393939393], [427.0, 447.6428571428571], [433.0, 640.4857142857143], [432.0, 391.4545454545455], [434.0, 609.439024390244], [435.0, 458.4615384615384], [436.0, 537.0196078431376], [437.0, 443.01724137931035], [438.0, 745.5882352941176], [439.0, 686.8125], [440.0, 686.8571428571429], [446.0, 896.5645161290322], [447.0, 852.9714285714284], [444.0, 564.3243243243243], [445.0, 591.6065573770492], [441.0, 612.0806451612905], [442.0, 694.8000000000001], [443.0, 767.8372093023254], [450.0, 813.5806451612905], [449.0, 942.9642857142859], [448.0, 986.8666666666664], [451.0, 1030.0344827586207], [460.0, 842.8863636363637], [461.0, 779.7343749999999], [462.0, 760.3404255319149], [463.0, 683.5479452054797], [452.0, 853.7441860465116], [453.0, 481.48387096774195], [454.0, 1039.731707317073], [455.0, 607.7254901960782], [456.0, 664.15625], [457.0, 647.1521739130436], [458.0, 707.4883720930235], [459.0, 718.3636363636363], [465.0, 849.0526315789474], [464.0, 768.6744186046512], [466.0, 784.5526315789473], [467.0, 678.6862745098038], [468.0, 652.3461538461538], [469.0, 690.0833333333333], [470.0, 634.7222222222222], [471.0, 674.7608695652174], [472.0, 763.175], [478.0, 604.4893617021278], [479.0, 986.2156862745101], [476.0, 729.5833333333333], [477.0, 745.6346153846155], [473.0, 888.225], [474.0, 878.7741935483872], [475.0, 635.0294117647057], [481.0, 542.5357142857143], [480.0, 576.1666666666667], [482.0, 569.4528301886792], [483.0, 696.5365853658535], [484.0, 618.3469387755101], [485.0, 972.1111111111111], [486.0, 618.8085106382978], [487.0, 553.0833333333336], [488.0, 492.0333333333333], [494.0, 347.5081967213116], [495.0, 460.45833333333337], [492.0, 583.2857142857143], [493.0, 635.7857142857143], [489.0, 399.837837837838], [490.0, 526.7916666666667], [491.0, 1126.3125], [497.0, 537.1176470588234], [496.0, 415.2580645161291], [498.0, 610.0512820512821], [499.0, 532.5555555555555], [500.0, 650.0000000000001], [501.0, 665.1458333333333], [502.0, 571.16], [503.0, 649.4374999999999], [504.0, 474.5925925925926], [510.0, 611.4594594594595], [511.0, 783.8124999999999], [508.0, 973.4600000000003], [509.0, 589.2857142857143], [505.0, 771.2666666666665], [506.0, 808.4074074074073], [507.0, 1023.6666666666664], [515.0, 782.6666666666667], [512.0, 754.4374999999999], [526.0, 793.3793103448274], [527.0, 479.8974358974359], [524.0, 1200.8947368421054], [525.0, 688.6315789473683], [522.0, 1086.92], [523.0, 525.5757575757576], [513.0, 533.5945945945947], [514.0, 586.5111111111111], [516.0, 766.8387096774195], [517.0, 861.9473684210527], [518.0, 615.6052631578947], [519.0, 616.25], [528.0, 609.5952380952381], [542.0, 754.8333333333331], [543.0, 1718.428571428571], [540.0, 560.1944444444443], [541.0, 728.9787234042554], [538.0, 562.5952380952381], [539.0, 706.9743589743589], [536.0, 700.6730769230768], [537.0, 673.0454545454544], [529.0, 678.2631578947368], [530.0, 686.9433962264151], [531.0, 684.7659574468084], [532.0, 674.6428571428573], [533.0, 609.2040816326531], [534.0, 676.3809523809524], [535.0, 576.5199999999998], [520.0, 794.5500000000001], [521.0, 1154.6470588235293], [547.0, 895.8333333333334], [544.0, 940.1600000000001], [558.0, 1214.2702702702702], [559.0, 910.931034482759], [556.0, 595.8], [557.0, 766.5128205128206], [554.0, 718.7857142857141], [555.0, 759.7446808510639], [545.0, 1158.9310344827586], [546.0, 861.5357142857143], [548.0, 1135.4102564102566], [549.0, 761.8275862068967], [550.0, 1276.7551020408166], [551.0, 837.4107142857142], [560.0, 971.5833333333334], [574.0, 735.1451612903228], [575.0, 689.3181818181818], [572.0, 1030.5555555555557], [573.0, 1094.6666666666667], [570.0, 969.5142857142856], [571.0, 942.3260869565216], [568.0, 1195.5161290322583], [569.0, 1549.5714285714287], [561.0, 1144.09756097561], [562.0, 946.6285714285714], [563.0, 1253.9215686274508], [564.0, 1592.3571428571427], [565.0, 1354.2352941176473], [566.0, 743.5454545454545], [567.0, 1232.9636363636364], [552.0, 707.94], [553.0, 988.2857142857142], [579.0, 782.3846153846155], [576.0, 1019.0555555555552], [590.0, 904.548387096774], [591.0, 641.34375], [588.0, 412.49999999999994], [589.0, 500.9428571428572], [586.0, 668.5454545454546], [587.0, 999.9259259259259], [577.0, 808.9555555555556], [578.0, 858.0384615384613], [580.0, 1112.142857142857], [581.0, 1011.877551020408], [582.0, 1080.583333333333], [583.0, 910.7619047619048], [592.0, 1082.9375], [606.0, 684.9661016949154], [607.0, 827.3181818181819], [604.0, 874.9803921568626], [605.0, 837.6511627906975], [602.0, 961.9999999999999], [603.0, 880.2051282051284], [600.0, 1040.5142857142857], [601.0, 1029.8000000000002], [593.0, 943.3999999999997], [594.0, 722.6400000000001], [595.0, 540.4285714285716], [596.0, 1012.5200000000002], [597.0, 692.1951219512194], [598.0, 627.8048780487804], [599.0, 880.9512195121952], [584.0, 816.0612244897959], [585.0, 914.153846153846], [611.0, 812.9230769230769], [608.0, 749.0000000000001], [622.0, 630.5499999999998], [623.0, 1044.439393939394], [620.0, 647.520833333333], [621.0, 615.127659574468], [618.0, 511.2857142857142], [619.0, 567.6666666666665], [609.0, 727.7750000000002], [610.0, 767.063829787234], [612.0, 675.6785714285714], [613.0, 703.7647058823528], [614.0, 966.7692307692308], [615.0, 852.0384615384617], [624.0, 824.7391304347825], [638.0, 690.8235294117648], [639.0, 959.2173913043479], [636.0, 667.891304347826], [637.0, 857.3170731707319], [634.0, 758.2941176470588], [635.0, 800.7380952380952], [632.0, 887.9749999999999], [633.0, 878.7254901960785], [625.0, 683.8], [626.0, 574.3243243243244], [627.0, 849.0], [628.0, 872.2580645161291], [629.0, 937.6315789473684], [630.0, 1346.2857142857144], [631.0, 851.3636363636365], [616.0, 991.7358490566038], [617.0, 521.9056603773583], [643.0, 1186.5918367346942], [640.0, 859.7000000000002], [654.0, 1093.8181818181818], [655.0, 972.6363636363636], [652.0, 1112.5909090909092], [653.0, 947.5806451612905], [650.0, 997.5], [651.0, 760.8214285714287], [641.0, 886.2812499999999], [642.0, 919.3333333333334], [644.0, 1172.9411764705883], [645.0, 1209.2051282051282], [646.0, 1200.352941176471], [647.0, 1055.928571428571], [656.0, 1066.4150943396223], [670.0, 1322.2571428571428], [671.0, 1246.9761904761904], [668.0, 920.430769230769], [669.0, 936.068181818182], [666.0, 1283.608695652174], [667.0, 1449.793103448276], [664.0, 894.6976744186045], [665.0, 1169.966666666667], [657.0, 1108.5609756097558], [658.0, 899.8600000000001], [659.0, 1723.0869565217392], [660.0, 731.1836734693878], [661.0, 1504.6410256410252], [662.0, 1370.457142857143], [663.0, 1045.21875], [648.0, 1292.3333333333335], [649.0, 717.0344827586207], [675.0, 1474.3749999999995], [672.0, 1165.7627118644064], [686.0, 1263.155555555556], [687.0, 831.8333333333334], [684.0, 1386.527777777778], [685.0, 1252.30303030303], [682.0, 900.8333333333334], [683.0, 598.4444444444445], [673.0, 1422.4772727272727], [674.0, 1519.9803921568632], [676.0, 1215.4999999999998], [677.0, 1146.6086956521744], [678.0, 1297.0714285714284], [679.0, 1557.5945945945946], [688.0, 924.7499999999999], [702.0, 1010.6382978723406], [703.0, 1006.3170731707319], [700.0, 1100.7105263157894], [701.0, 1150.6875], [698.0, 838.8461538461537], [699.0, 811.8113207547169], [696.0, 1570.371428571428], [697.0, 1629.428571428571], [689.0, 1505.043478260869], [690.0, 1299.2399999999998], [691.0, 1564.2222222222222], [692.0, 1295.6799999999998], [693.0, 1089.5074626865674], [694.0, 1128.0000000000005], [695.0, 879.1666666666666], [680.0, 604.9444444444445], [681.0, 1010.2500000000001], [707.0, 1380.6285714285714], [704.0, 1141.0689655172416], [718.0, 694.1166666666669], [719.0, 1048.653846153846], [716.0, 678.0925925925925], [717.0, 651.7741935483873], [714.0, 836.8999999999997], [715.0, 1000.0], [705.0, 715.5849056603773], [706.0, 731.875], [708.0, 855.0444444444443], [709.0, 908.511627906977], [710.0, 1023.9761904761906], [711.0, 606.8499999999999], [720.0, 623.66], [734.0, 1071.05], [735.0, 930.0163934426229], [732.0, 675.6739130434781], [733.0, 1162.127659574468], [730.0, 577.1842105263158], [731.0, 934.7027027027029], [728.0, 785.9444444444445], [729.0, 744.0869565217391], [721.0, 866.7380952380952], [722.0, 757.9032258064517], [723.0, 791.1538461538461], [724.0, 792.1363636363635], [725.0, 952.2631578947369], [726.0, 770.5238095238095], [727.0, 739.5172413793105], [712.0, 602.529411764706], [713.0, 919.75], [739.0, 837.1463414634147], [736.0, 1232.3181818181818], [751.0, 1136.074074074074], [749.0, 973.9322033898306], [750.0, 912.6851851851852], [747.0, 865.0], [748.0, 894.847457627119], [737.0, 1210.3095238095236], [738.0, 1029.3243243243244], [740.0, 1244.6000000000001], [741.0, 1142.7], [742.0, 1318.1176470588232], [743.0, 663.9101123595507], [752.0, 1637.115384615385], [766.0, 782.0], [767.0, 984.7105263157896], [764.0, 1099.421686746988], [765.0, 959.8518518518518], [762.0, 1133.873563218391], [763.0, 904.0392156862742], [760.0, 1520.1458333333333], [761.0, 1220.5945945945948], [753.0, 1245.1999999999998], [754.0, 1052.139534883721], [755.0, 1259.8222222222223], [756.0, 1323.5581395348836], [757.0, 1135.7999999999997], [758.0, 1080.3116883116884], [759.0, 1422.9423076923078], [744.0, 1025.5], [745.0, 831.9999999999999], [746.0, 883.4390243902438], [771.0, 927.9310344827586], [768.0, 893.8666666666666], [782.0, 1070.872340425532], [783.0, 1171.5555555555554], [780.0, 820.7547169811322], [781.0, 817.1071428571429], [778.0, 893.8461538461539], [779.0, 874.225], [769.0, 832.4827586206897], [770.0, 1036.659574468085], [772.0, 726.9729729729731], [773.0, 1029.5641025641025], [774.0, 1097.0754716981132], [775.0, 1180.7540983606561], [784.0, 669.0249999999999], [798.0, 1483.5769230769226], [799.0, 1594.7083333333335], [796.0, 1179.9411764705883], [797.0, 1233.94], [794.0, 1111.938775510204], [795.0, 644.9166666666664], [792.0, 778.258064516129], [793.0, 1098.6562500000002], [785.0, 787.3061224489797], [786.0, 964.6956521739129], [787.0, 901.1764705882355], [788.0, 931.8200000000002], [789.0, 874.1842105263157], [790.0, 1055.4666666666667], [791.0, 1109.6], [776.0, 882.7954545454545], [777.0, 1109.35], [803.0, 1385.2682926829266], [800.0, 1156.4249999999997], [814.0, 1174.7941176470588], [815.0, 1977.0540540540537], [812.0, 973.6326530612246], [813.0, 1027.4565217391303], [810.0, 2069.2499999999995], [811.0, 1201.5853658536585], [801.0, 2088.103448275863], [802.0, 1247.2352941176468], [804.0, 891.7777777777777], [805.0, 999.5250000000001], [806.0, 1131.9482758620695], [807.0, 1268.56], [816.0, 1724.9000000000003], [830.0, 1008.5434782608697], [831.0, 858.2285714285714], [828.0, 1004.0416666666667], [829.0, 1095.909090909091], [826.0, 1159.3157894736842], [827.0, 1079.9714285714288], [824.0, 957.090909090909], [825.0, 986.4705882352939], [817.0, 1212.5483870967741], [818.0, 1776.7142857142853], [819.0, 1145.8032786885244], [820.0, 1131.6379310344826], [821.0, 819.6060606060607], [822.0, 1187.7399999999993], [823.0, 993.2272727272726], [808.0, 1936.366666666667], [809.0, 1691.8157894736844], [835.0, 1205.2424242424242], [832.0, 1232.9310344827586], [846.0, 1089.1666666666665], [847.0, 681.4523809523811], [844.0, 1414.8235294117649], [845.0, 1023.1363636363637], [842.0, 942.5192307692307], [843.0, 952.44], [833.0, 1206.0857142857144], [834.0, 937.4814814814814], [836.0, 1392.690476190476], [837.0, 1169.2978723404256], [838.0, 1062.0238095238092], [839.0, 964.3095238095239], [848.0, 1223.148148148148], [862.0, 1150.9767441860465], [863.0, 1197.780487804878], [860.0, 1269.8333333333335], [861.0, 1360.7702702702702], [858.0, 1552.1052631578946], [859.0, 1097.1999999999998], [856.0, 1326.6728971962614], [857.0, 1323.5205479452052], [849.0, 1038.0217391304345], [850.0, 1434.3953488372092], [851.0, 962.6363636363636], [852.0, 827.4347826086957], [853.0, 1109.1666666666665], [854.0, 1085.1276595744682], [855.0, 1191.9333333333334], [840.0, 828.9393939393939], [841.0, 1007.0714285714286], [867.0, 862.8529411764705], [864.0, 1349.6818181818178], [878.0, 1245.7297297297296], [879.0, 1172.8064516129034], [876.0, 1129.3214285714287], [877.0, 1272.0508474576268], [874.0, 1123.2941176470586], [875.0, 955.0357142857143], [865.0, 1142.4893617021278], [866.0, 1155.9117647058824], [868.0, 1080.0566037735846], [869.0, 1160.8648648648652], [870.0, 1081.7619047619048], [871.0, 868.3636363636364], [880.0, 1267.9743589743591], [894.0, 1357.3589743589748], [895.0, 1289.3333333333335], [892.0, 1602.1176470588234], [893.0, 1359.4426229508194], [890.0, 1154.2105263157891], [891.0, 1070.3181818181822], [888.0, 1227.1470588235293], [889.0, 1089.9152542372883], [881.0, 840.6923076923076], [882.0, 1006.269230769231], [883.0, 806.022727272727], [884.0, 800.9687499999999], [885.0, 881.6285714285714], [886.0, 1070.681818181818], [887.0, 1338.6212121212122], [872.0, 1093.3823529411766], [873.0, 931.4516129032256], [899.0, 941.0000000000001], [896.0, 1124.9811320754714], [910.0, 844.5740740740741], [911.0, 1059.779661016949], [908.0, 705.1200000000001], [909.0, 919.294117647059], [906.0, 740.723076923077], [907.0, 750.9444444444442], [897.0, 1168.0945945945946], [898.0, 942.9591836734694], [900.0, 1153.657142857143], [901.0, 957.375], [902.0, 1301.9523809523807], [903.0, 877.8936170212768], [912.0, 1151.953488372093], [926.0, 1312.9677419354837], [927.0, 1092.1521739130433], [924.0, 1212.3243243243244], [925.0, 1110.4090909090908], [922.0, 1465.7777777777778], [923.0, 1406.0000000000002], [920.0, 935.7812499999999], [921.0, 1043.4516129032259], [913.0, 1405.9420289855075], [914.0, 1287.571428571429], [915.0, 1700.2340425531918], [916.0, 1525.2758620689651], [917.0, 915.8571428571429], [918.0, 1481.1063829787233], [919.0, 1004.5142857142858], [904.0, 1250.3269230769233], [905.0, 1014.0312499999998], [931.0, 1110.2456140350878], [928.0, 1031.1612903225807], [942.0, 1266.2758620689656], [943.0, 1241.9591836734694], [940.0, 1256.8108108108113], [941.0, 803.78], [938.0, 1279.2258064516127], [939.0, 870.975], [929.0, 1266.0975609756097], [930.0, 856.0540540540541], [932.0, 1258.8444444444442], [933.0, 941.0], [934.0, 911.818181818182], [935.0, 1098.0500000000004], [944.0, 1367.3], [958.0, 1090.2380952380954], [959.0, 1467.529411764706], [956.0, 1436.842105263158], [957.0, 1526.71875], [954.0, 1114.2051282051277], [955.0, 1439.9148936170209], [952.0, 1276.7499999999998], [953.0, 1087.7307692307695], [945.0, 1471.0769230769229], [946.0, 1486.636363636364], [947.0, 1036.787878787879], [948.0, 928.8196721311476], [949.0, 1284.0256410256409], [950.0, 1370.787878787879], [951.0, 1159.9259259259256], [936.0, 1349.1724137931033], [937.0, 954.9523809523807], [963.0, 1150.6808510638296], [960.0, 1210.9615384615386], [974.0, 1662.0999999999997], [975.0, 1635.78], [972.0, 1005.7142857142857], [973.0, 1588.1132075471694], [970.0, 1303.4814814814818], [971.0, 1103.2244897959185], [961.0, 1265.3235294117646], [962.0, 1134.8545454545458], [964.0, 1226.3518518518515], [965.0, 1380.534482758621], [966.0, 1401.6093750000007], [967.0, 1116.761194029851], [976.0, 1307.8666666666666], [990.0, 823.3582089552236], [991.0, 2621.1904761904766], [988.0, 1330.8205128205125], [989.0, 1177.844444444445], [986.0, 818.2941176470588], [987.0, 1677.7600000000002], [984.0, 905.6341463414637], [985.0, 1233.176470588236], [977.0, 1926.5102040816325], [978.0, 967.7599999999998], [979.0, 1606.0000000000002], [980.0, 1325.9767441860465], [981.0, 1533.9999999999995], [982.0, 990.6571428571427], [983.0, 1059.28125], [968.0, 1336.984374999999], [969.0, 1241.4032258064517], [995.0, 1044.9090909090908], [992.0, 679.5892857142857], [1006.0, 3287.342105263159], [1007.0, 1299.0638297872338], [1004.0, 1037.5416666666667], [1005.0, 1193.7837837837837], [1002.0, 1240.6666666666667], [1003.0, 1025.0909090909092], [993.0, 1446.3750000000005], [994.0, 1263.3333333333333], [996.0, 1522.6296296296296], [997.0, 1001.4074074074076], [998.0, 1186.6052631578946], [999.0, 1406.952380952381], [1008.0, 1398.309523809524], [1022.0, 1061.2272727272727], [1023.0, 941.7083333333333], [1020.0, 1178.8888888888887], [1021.0, 700.1470588235294], [1018.0, 1086.1999999999996], [1019.0, 1414.5625], [1016.0, 1547.5454545454547], [1017.0, 1141.9230769230771], [1009.0, 1281.3606557377047], [1010.0, 1040.9375], [1011.0, 2710.92], [1012.0, 1277.9210526315792], [1013.0, 1243.2121212121212], [1014.0, 1169.4901960784314], [1015.0, 1458.410256410257], [1000.0, 1284.3809523809525], [1001.0, 889.9], [1030.0, 1218.4878048780486], [1024.0, 875.7777777777778], [1052.0, 1469.360655737705], [1054.0, 1554.1864406779662], [1048.0, 1167.4545454545455], [1050.0, 1311.4857142857143], [1044.0, 1195.7692307692312], [1046.0, 1514.2285714285713], [1026.0, 1007.5714285714284], [1028.0, 1068.2040816326532], [1032.0, 1746.0476190476193], [1034.0, 1562.6857142857143], [1036.0, 1386.5483870967741], [1038.0, 1305.590909090909], [1056.0, 1604.3417721518988], [1084.0, 1016.5106382978722], [1086.0, 950.5238095238095], [1080.0, 1192.6999999999996], [1082.0, 1479.8787878787882], [1076.0, 1202.522727272727], [1078.0, 1203.2439024390244], [1072.0, 1650.4590163934429], [1074.0, 1236.8205128205127], [1058.0, 1839.042857142857], [1060.0, 1665.3076923076926], [1062.0, 1793.542372881356], [1064.0, 1758.5079365079368], [1066.0, 1832.5844155844152], [1068.0, 1835.2340425531916], [1070.0, 1532.7551020408164], [1040.0, 1401.5909090909092], [1042.0, 812.0833333333333], [1094.0, 996.2647058823529], [1088.0, 866.6046511627907], [1116.0, 1193.8], [1118.0, 1337.244444444445], [1112.0, 913.8695652173914], [1114.0, 1510.269230769231], [1108.0, 1263.958333333333], [1110.0, 1391.1724137931037], [1090.0, 1390.7755102040815], [1092.0, 1611.7866666666664], [1096.0, 1073.0000000000002], [1098.0, 1266.8285714285714], [1100.0, 1177.7971014492757], [1102.0, 1405.8076923076924], [1120.0, 1502.0666666666664], [1148.0, 1574.8181818181815], [1150.0, 1358.8695652173913], [1144.0, 1046.3658536585367], [1146.0, 1118.8666666666666], [1140.0, 978.060606060606], [1142.0, 1191.4285714285713], [1136.0, 1074.9038461538462], [1138.0, 934.5200000000001], [1122.0, 1413.8095238095239], [1124.0, 1429.85], [1126.0, 1599.290909090909], [1128.0, 1384.3170731707316], [1130.0, 1379.7959183673474], [1132.0, 1612.1250000000002], [1134.0, 1161.4489795918366], [1104.0, 1533.25], [1106.0, 1153.5483870967744], [1158.0, 1324.0238095238096], [1152.0, 1354.2444444444448], [1180.0, 1591.439024390244], [1182.0, 1470.0882352941173], [1176.0, 1746.7017543859647], [1178.0, 1401.964285714286], [1172.0, 1795.8600000000004], [1174.0, 1466.6052631578948], [1154.0, 1049.8292682926829], [1156.0, 636.3913043478259], [1160.0, 1364.4878048780488], [1162.0, 1429.703125], [1164.0, 987.8392857142854], [1166.0, 1394.3380281690145], [1184.0, 1086.6216216216217], [1212.0, 732.4999999999999], [1214.0, 1041.0], [1208.0, 1583.3103448275863], [1210.0, 1168.3888888888891], [1204.0, 1549.64705882353], [1206.0, 1461.4745762711873], [1200.0, 831.906976744186], [1202.0, 604.5102040816327], [1186.0, 1576.2758620689654], [1188.0, 1543.85], [1190.0, 1607.5744680851064], [1192.0, 1476.219512195122], [1194.0, 1534.55], [1196.0, 1442.575], [1198.0, 877.9268292682927], [1168.0, 1677.2551020408166], [1170.0, 1568.4084507042253], [1222.0, 1705.4777777777783], [1216.0, 1102.2], [1244.0, 1170.4309392265186], [1246.0, 1382.8640776699033], [1240.0, 1264.2615384615383], [1242.0, 1736.8399999999997], [1236.0, 1444.7826086956522], [1238.0, 1809.3181818181822], [1218.0, 1779.5054945054947], [1220.0, 1591.298969072165], [1224.0, 1310.16091954023], [1226.0, 849.9250000000002], [1228.0, 1282.0217391304348], [1230.0, 1366.21875], [1248.0, 2341.6821705426364], [1250.0, 1859.8768891725654], [1232.0, 1891.9062500000002], [1234.0, 2175.3695652173915], [1031.0, 1423.763157894737], [1025.0, 1072.5853658536587], [1053.0, 1346.734375], [1055.0, 1604.7631578947373], [1049.0, 1368.8620689655174], [1051.0, 2066.272727272728], [1045.0, 1088.9473684210527], [1047.0, 1206.1363636363635], [1027.0, 1186.674418604651], [1029.0, 950.7222222222222], [1033.0, 1383.7333333333331], [1035.0, 1308.8857142857144], [1037.0, 1117.6363636363637], [1039.0, 1104.9374999999998], [1057.0, 1875.7460317460316], [1085.0, 912.6764705882352], [1087.0, 1113.6136363636365], [1081.0, 1372.53488372093], [1083.0, 1283.3333333333333], [1077.0, 1242.7021276595744], [1079.0, 1469.125], [1073.0, 1524.3469387755101], [1075.0, 1385.2272727272727], [1059.0, 1877.7027027027034], [1061.0, 1695.6792452830189], [1063.0, 1595.470588235294], [1065.0, 2018.7303370786515], [1067.0, 1873.2459016393439], [1069.0, 1427.326530612245], [1071.0, 1683.2096774193546], [1041.0, 1158.4166666666667], [1043.0, 1547.4642857142858], [1095.0, 889.7419354838711], [1089.0, 1105.909090909091], [1117.0, 1291.2127659574467], [1119.0, 1205.7407407407406], [1113.0, 1623.409090909091], [1115.0, 1200.0526315789473], [1109.0, 1151.0], [1111.0, 1243.4888888888888], [1091.0, 1353.7241379310344], [1093.0, 1403.777777777778], [1097.0, 1262.3666666666663], [1099.0, 1121.4545454545453], [1101.0, 1191.5862068965516], [1103.0, 1143.0833333333335], [1121.0, 1438.1666666666665], [1149.0, 1353.675], [1151.0, 1049.9545454545453], [1145.0, 1114.3734939759033], [1147.0, 1176.5833333333337], [1141.0, 1122.1904761904764], [1143.0, 1118.8269230769233], [1137.0, 1462.9387755102043], [1139.0, 1058.2444444444445], [1123.0, 1455.4047619047615], [1125.0, 1524.5901639344258], [1127.0, 1395.6388888888891], [1129.0, 1350.4444444444443], [1131.0, 1269.9433962264147], [1133.0, 1216.275], [1135.0, 1013.829268292683], [1105.0, 1258.0967741935485], [1107.0, 1363.1199999999997], [1159.0, 918.0833333333335], [1153.0, 1099.767441860465], [1181.0, 1741.5000000000002], [1183.0, 1583.5952380952378], [1177.0, 1653.5238095238096], [1179.0, 922.7708333333333], [1173.0, 1503.1599999999999], [1175.0, 1980.6046511627908], [1155.0, 964.1774193548387], [1157.0, 1142.2023809523807], [1161.0, 1343.4383561643833], [1163.0, 1347.9310344827586], [1165.0, 1005.9350649350649], [1167.0, 1791.4852941176466], [1185.0, 1399.0933333333335], [1213.0, 1168.0000000000002], [1215.0, 1048.5135135135135], [1209.0, 1378.1641791044774], [1211.0, 1031.8125], [1205.0, 1661.920634920635], [1207.0, 1468.1363636363637], [1201.0, 918.3589743589743], [1203.0, 1492.0927835051546], [1187.0, 1835.5806451612902], [1189.0, 1611.1388888888887], [1191.0, 1757.5714285714287], [1193.0, 1464.0967741935485], [1195.0, 1141.4693877551022], [1197.0, 1365.8727272727272], [1199.0, 1155.7083333333333], [1169.0, 1833.3095238095243], [1171.0, 1647.5714285714282], [1223.0, 1410.2388059701493], [1217.0, 1052.03125], [1245.0, 1483.5465116279072], [1247.0, 1794.6923076923078], [1241.0, 1869.920353982301], [1243.0, 1679.7540983606555], [1237.0, 1191.7586206896553], [1239.0, 1816.301587301587], [1219.0, 1632.315789473684], [1221.0, 963.2307692307689], [1225.0, 1017.8928571428572], [1227.0, 1278.6041666666665], [1229.0, 1086.5581395348838], [1231.0, 2508.939393939394], [1249.0, 1715.8425925925928], [1233.0, 2080.7999999999997], [1235.0, 2125.1590909090914], [1.0, 20068.666666666664]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1016.0286059275535, 1477.48417124039]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1250.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12051.616666666667, "minX": 1.54979322E12, "maxY": 434482.8333333333, "series": [{"data": [[1.54979352E12, 248093.38333333333], [1.54979322E12, 191127.73333333334], [1.54979358E12, 434482.8333333333], [1.54979328E12, 354201.26666666666], [1.54979334E12, 42608.96666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54979352E12, 70412.43333333333], [1.54979322E12, 54243.45], [1.54979358E12, 94945.28333333334], [1.54979328E12, 100525.33333333333], [1.54979334E12, 12051.616666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54979358E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 674.085885638421, "minX": 1.54979322E12, "maxY": 2008.9391057312346, "series": [{"data": [[1.54979352E12, 1192.939549975312], [1.54979322E12, 674.085885638421], [1.54979358E12, 1623.3343224049052], [1.54979328E12, 2008.9391057312346], [1.54979334E12, 1087.6419600576457]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54979358E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 674.0788353248184, "minX": 1.54979322E12, "maxY": 2008.937821146226, "series": [{"data": [[1.54979352E12, 1192.9381392396106], [1.54979322E12, 674.0788353248184], [1.54979358E12, 1604.329847261407], [1.54979328E12, 2008.937821146226], [1.54979334E12, 988.6510191476235]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54979358E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.06897261684167172, "minX": 1.54979322E12, "maxY": 34.14614748516388, "series": [{"data": [[1.54979352E12, 0.0830570642590114], [1.54979322E12, 0.10969189213935829], [1.54979358E12, 34.14614748516388], [1.54979328E12, 0.09268774703557268], [1.54979334E12, 0.06897261684167172]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54979358E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 4.0, "minX": 1.54979322E12, "maxY": 70423.0, "series": [{"data": [[1.54979352E12, 6820.0], [1.54979322E12, 18589.0], [1.54979358E12, 8896.0], [1.54979328E12, 70423.0], [1.54979334E12, 6197.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54979352E12, 5.0], [1.54979322E12, 8.0], [1.54979358E12, 4.0], [1.54979328E12, 6.0], [1.54979334E12, 4.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54979352E12, 2723.9000000000015], [1.54979322E12, 1466.0], [1.54979358E12, 3079.9000000000015], [1.54979328E12, 3015.800000000003], [1.54979334E12, 2827.9000000000015]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54979352E12, 4522.990000000002], [1.54979322E12, 6630.770000000037], [1.54979358E12, 4522.980000000003], [1.54979328E12, 29821.69000000037], [1.54979334E12, 6333.94000000001]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54979352E12, 3337.9500000000007], [1.54979322E12, 2009.9500000000007], [1.54979358E12, 3569.9000000000015], [1.54979328E12, 4026.9000000000015], [1.54979334E12, 3726.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54979358E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 144.0, "minX": 80.0, "maxY": 120178.5, "series": [{"data": [[80.0, 349.0], [674.0, 1926.5], [685.0, 1614.0], [364.0, 415.0], [472.0, 1566.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[80.0, 120178.5], [685.0, 144.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 685.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 80.0, "maxY": 1926.5, "series": [{"data": [[80.0, 349.0], [674.0, 1926.5], [685.0, 1614.0], [364.0, 415.0], [472.0, 1566.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[80.0, 0.0], [685.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 685.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 64.81666666666666, "minX": 1.54979322E12, "maxY": 669.9666666666667, "series": [{"data": [[1.54979352E12, 493.4], [1.54979322E12, 384.8833333333333], [1.54979358E12, 664.4333333333333], [1.54979328E12, 669.9666666666667], [1.54979334E12, 64.81666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54979358E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.54979322E12, "maxY": 674.6666666666666, "series": [{"data": [[1.54979352E12, 472.56666666666666], [1.54979322E12, 364.05], [1.54979358E12, 637.2166666666667], [1.54979328E12, 674.6666666666666], [1.54979334E12, 80.88333333333334]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.54979334E12, 0.06666666666666667]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}, {"data": [[1.54979358E12, 48.05]], "isOverall": false, "label": "Non HTTP response code: java.net.NoRouteToHostException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54979358E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.54979322E12, "maxY": 674.6666666666666, "series": [{"data": [[1.54979352E12, 472.56666666666666], [1.54979322E12, 364.05], [1.54979358E12, 637.2166666666667], [1.54979328E12, 674.6666666666666], [1.54979334E12, 80.88333333333334]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}, {"data": [[1.54979358E12, 48.05], [1.54979334E12, 0.06666666666666667]], "isOverall": false, "label": "Petición HTTP-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54979358E12, "title": "Transactions Per Second"}},
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
