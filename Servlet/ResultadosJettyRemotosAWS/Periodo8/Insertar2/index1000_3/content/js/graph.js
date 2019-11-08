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
        data: {"result": {"minY": 151.0, "minX": 0.0, "maxY": 4817.0, "series": [{"data": [[0.0, 151.0], [0.1, 202.0], [0.2, 203.0], [0.3, 203.0], [0.4, 208.0], [0.5, 210.0], [0.6, 217.0], [0.7, 223.0], [0.8, 225.0], [0.9, 226.0], [1.0, 228.0], [1.1, 228.0], [1.2, 229.0], [1.3, 229.0], [1.4, 229.0], [1.5, 229.0], [1.6, 230.0], [1.7, 230.0], [1.8, 231.0], [1.9, 231.0], [2.0, 235.0], [2.1, 235.0], [2.2, 236.0], [2.3, 236.0], [2.4, 237.0], [2.5, 237.0], [2.6, 238.0], [2.7, 241.0], [2.8, 243.0], [2.9, 244.0], [3.0, 246.0], [3.1, 249.0], [3.2, 250.0], [3.3, 252.0], [3.4, 253.0], [3.5, 254.0], [3.6, 254.0], [3.7, 254.0], [3.8, 254.0], [3.9, 258.0], [4.0, 261.0], [4.1, 262.0], [4.2, 262.0], [4.3, 263.0], [4.4, 264.0], [4.5, 264.0], [4.6, 265.0], [4.7, 266.0], [4.8, 266.0], [4.9, 269.0], [5.0, 269.0], [5.1, 269.0], [5.2, 271.0], [5.3, 272.0], [5.4, 272.0], [5.5, 274.0], [5.6, 275.0], [5.7, 275.0], [5.8, 276.0], [5.9, 276.0], [6.0, 276.0], [6.1, 277.0], [6.2, 278.0], [6.3, 279.0], [6.4, 279.0], [6.5, 279.0], [6.6, 280.0], [6.7, 281.0], [6.8, 282.0], [6.9, 282.0], [7.0, 283.0], [7.1, 283.0], [7.2, 283.0], [7.3, 285.0], [7.4, 285.0], [7.5, 285.0], [7.6, 285.0], [7.7, 286.0], [7.8, 287.0], [7.9, 287.0], [8.0, 288.0], [8.1, 288.0], [8.2, 288.0], [8.3, 289.0], [8.4, 289.0], [8.5, 290.0], [8.6, 291.0], [8.7, 292.0], [8.8, 293.0], [8.9, 293.0], [9.0, 294.0], [9.1, 294.0], [9.2, 295.0], [9.3, 295.0], [9.4, 296.0], [9.5, 298.0], [9.6, 301.0], [9.7, 301.0], [9.8, 302.0], [9.9, 303.0], [10.0, 304.0], [10.1, 305.0], [10.2, 305.0], [10.3, 305.0], [10.4, 305.0], [10.5, 306.0], [10.6, 307.0], [10.7, 309.0], [10.8, 310.0], [10.9, 311.0], [11.0, 312.0], [11.1, 313.0], [11.2, 314.0], [11.3, 315.0], [11.4, 317.0], [11.5, 317.0], [11.6, 317.0], [11.7, 318.0], [11.8, 320.0], [11.9, 321.0], [12.0, 321.0], [12.1, 322.0], [12.2, 322.0], [12.3, 323.0], [12.4, 323.0], [12.5, 325.0], [12.6, 325.0], [12.7, 325.0], [12.8, 327.0], [12.9, 328.0], [13.0, 329.0], [13.1, 329.0], [13.2, 330.0], [13.3, 331.0], [13.4, 334.0], [13.5, 334.0], [13.6, 334.0], [13.7, 335.0], [13.8, 337.0], [13.9, 339.0], [14.0, 339.0], [14.1, 340.0], [14.2, 341.0], [14.3, 344.0], [14.4, 344.0], [14.5, 346.0], [14.6, 348.0], [14.7, 348.0], [14.8, 352.0], [14.9, 355.0], [15.0, 356.0], [15.1, 358.0], [15.2, 358.0], [15.3, 361.0], [15.4, 362.0], [15.5, 363.0], [15.6, 363.0], [15.7, 365.0], [15.8, 368.0], [15.9, 369.0], [16.0, 370.0], [16.1, 370.0], [16.2, 370.0], [16.3, 373.0], [16.4, 375.0], [16.5, 376.0], [16.6, 377.0], [16.7, 385.0], [16.8, 385.0], [16.9, 386.0], [17.0, 388.0], [17.1, 390.0], [17.2, 392.0], [17.3, 392.0], [17.4, 393.0], [17.5, 396.0], [17.6, 396.0], [17.7, 397.0], [17.8, 400.0], [17.9, 406.0], [18.0, 410.0], [18.1, 410.0], [18.2, 413.0], [18.3, 414.0], [18.4, 414.0], [18.5, 416.0], [18.6, 420.0], [18.7, 426.0], [18.8, 427.0], [18.9, 432.0], [19.0, 435.0], [19.1, 442.0], [19.2, 442.0], [19.3, 443.0], [19.4, 444.0], [19.5, 444.0], [19.6, 446.0], [19.7, 446.0], [19.8, 446.0], [19.9, 448.0], [20.0, 456.0], [20.1, 457.0], [20.2, 462.0], [20.3, 463.0], [20.4, 463.0], [20.5, 465.0], [20.6, 465.0], [20.7, 466.0], [20.8, 471.0], [20.9, 477.0], [21.0, 479.0], [21.1, 481.0], [21.2, 481.0], [21.3, 484.0], [21.4, 487.0], [21.5, 488.0], [21.6, 489.0], [21.7, 490.0], [21.8, 497.0], [21.9, 503.0], [22.0, 503.0], [22.1, 505.0], [22.2, 507.0], [22.3, 508.0], [22.4, 512.0], [22.5, 512.0], [22.6, 518.0], [22.7, 521.0], [22.8, 522.0], [22.9, 526.0], [23.0, 528.0], [23.1, 530.0], [23.2, 534.0], [23.3, 534.0], [23.4, 536.0], [23.5, 536.0], [23.6, 538.0], [23.7, 539.0], [23.8, 541.0], [23.9, 549.0], [24.0, 550.0], [24.1, 554.0], [24.2, 556.0], [24.3, 556.0], [24.4, 557.0], [24.5, 560.0], [24.6, 562.0], [24.7, 562.0], [24.8, 565.0], [24.9, 568.0], [25.0, 570.0], [25.1, 577.0], [25.2, 579.0], [25.3, 580.0], [25.4, 581.0], [25.5, 581.0], [25.6, 582.0], [25.7, 582.0], [25.8, 582.0], [25.9, 582.0], [26.0, 583.0], [26.1, 584.0], [26.2, 584.0], [26.3, 585.0], [26.4, 587.0], [26.5, 590.0], [26.6, 590.0], [26.7, 592.0], [26.8, 592.0], [26.9, 595.0], [27.0, 598.0], [27.1, 602.0], [27.2, 603.0], [27.3, 603.0], [27.4, 603.0], [27.5, 604.0], [27.6, 609.0], [27.7, 610.0], [27.8, 610.0], [27.9, 610.0], [28.0, 613.0], [28.1, 616.0], [28.2, 619.0], [28.3, 621.0], [28.4, 627.0], [28.5, 629.0], [28.6, 632.0], [28.7, 632.0], [28.8, 633.0], [28.9, 636.0], [29.0, 641.0], [29.1, 642.0], [29.2, 644.0], [29.3, 645.0], [29.4, 646.0], [29.5, 647.0], [29.6, 648.0], [29.7, 649.0], [29.8, 653.0], [29.9, 656.0], [30.0, 656.0], [30.1, 663.0], [30.2, 664.0], [30.3, 665.0], [30.4, 668.0], [30.5, 668.0], [30.6, 669.0], [30.7, 670.0], [30.8, 671.0], [30.9, 674.0], [31.0, 674.0], [31.1, 674.0], [31.2, 674.0], [31.3, 674.0], [31.4, 676.0], [31.5, 678.0], [31.6, 679.0], [31.7, 682.0], [31.8, 683.0], [31.9, 689.0], [32.0, 690.0], [32.1, 694.0], [32.2, 695.0], [32.3, 695.0], [32.4, 697.0], [32.5, 699.0], [32.6, 702.0], [32.7, 703.0], [32.8, 704.0], [32.9, 706.0], [33.0, 708.0], [33.1, 711.0], [33.2, 712.0], [33.3, 718.0], [33.4, 718.0], [33.5, 723.0], [33.6, 724.0], [33.7, 727.0], [33.8, 728.0], [33.9, 729.0], [34.0, 729.0], [34.1, 730.0], [34.2, 732.0], [34.3, 732.0], [34.4, 734.0], [34.5, 737.0], [34.6, 737.0], [34.7, 741.0], [34.8, 750.0], [34.9, 752.0], [35.0, 753.0], [35.1, 756.0], [35.2, 762.0], [35.3, 764.0], [35.4, 765.0], [35.5, 772.0], [35.6, 773.0], [35.7, 777.0], [35.8, 777.0], [35.9, 777.0], [36.0, 779.0], [36.1, 779.0], [36.2, 779.0], [36.3, 780.0], [36.4, 781.0], [36.5, 787.0], [36.6, 789.0], [36.7, 789.0], [36.8, 795.0], [36.9, 798.0], [37.0, 799.0], [37.1, 800.0], [37.2, 806.0], [37.3, 814.0], [37.4, 819.0], [37.5, 821.0], [37.6, 823.0], [37.7, 824.0], [37.8, 828.0], [37.9, 829.0], [38.0, 829.0], [38.1, 832.0], [38.2, 837.0], [38.3, 837.0], [38.4, 838.0], [38.5, 840.0], [38.6, 852.0], [38.7, 858.0], [38.8, 859.0], [38.9, 859.0], [39.0, 864.0], [39.1, 866.0], [39.2, 866.0], [39.3, 872.0], [39.4, 872.0], [39.5, 876.0], [39.6, 877.0], [39.7, 878.0], [39.8, 878.0], [39.9, 894.0], [40.0, 898.0], [40.1, 903.0], [40.2, 913.0], [40.3, 915.0], [40.4, 921.0], [40.5, 925.0], [40.6, 926.0], [40.7, 928.0], [40.8, 931.0], [40.9, 935.0], [41.0, 940.0], [41.1, 949.0], [41.2, 962.0], [41.3, 966.0], [41.4, 967.0], [41.5, 973.0], [41.6, 974.0], [41.7, 1003.0], [41.8, 1025.0], [41.9, 1054.0], [42.0, 1107.0], [42.1, 1158.0], [42.2, 1179.0], [42.3, 1219.0], [42.4, 1250.0], [42.5, 1261.0], [42.6, 1278.0], [42.7, 1286.0], [42.8, 1331.0], [42.9, 1358.0], [43.0, 1384.0], [43.1, 1401.0], [43.2, 1421.0], [43.3, 1426.0], [43.4, 1430.0], [43.5, 1451.0], [43.6, 1456.0], [43.7, 1458.0], [43.8, 1466.0], [43.9, 1485.0], [44.0, 1494.0], [44.1, 1495.0], [44.2, 1512.0], [44.3, 1513.0], [44.4, 1514.0], [44.5, 1523.0], [44.6, 1530.0], [44.7, 1531.0], [44.8, 1538.0], [44.9, 1541.0], [45.0, 1544.0], [45.1, 1547.0], [45.2, 1552.0], [45.3, 1556.0], [45.4, 1567.0], [45.5, 1582.0], [45.6, 1582.0], [45.7, 1586.0], [45.8, 1598.0], [45.9, 1599.0], [46.0, 1604.0], [46.1, 1604.0], [46.2, 1607.0], [46.3, 1611.0], [46.4, 1617.0], [46.5, 1617.0], [46.6, 1619.0], [46.7, 1620.0], [46.8, 1621.0], [46.9, 1622.0], [47.0, 1638.0], [47.1, 1640.0], [47.2, 1641.0], [47.3, 1649.0], [47.4, 1659.0], [47.5, 1660.0], [47.6, 1664.0], [47.7, 1666.0], [47.8, 1669.0], [47.9, 1674.0], [48.0, 1677.0], [48.1, 1678.0], [48.2, 1681.0], [48.3, 1696.0], [48.4, 1700.0], [48.5, 1702.0], [48.6, 1702.0], [48.7, 1706.0], [48.8, 1707.0], [48.9, 1721.0], [49.0, 1722.0], [49.1, 1728.0], [49.2, 1731.0], [49.3, 1732.0], [49.4, 1734.0], [49.5, 1737.0], [49.6, 1737.0], [49.7, 1742.0], [49.8, 1742.0], [49.9, 1748.0], [50.0, 1751.0], [50.1, 1752.0], [50.2, 1754.0], [50.3, 1754.0], [50.4, 1757.0], [50.5, 1757.0], [50.6, 1759.0], [50.7, 1760.0], [50.8, 1761.0], [50.9, 1762.0], [51.0, 1769.0], [51.1, 1769.0], [51.2, 1773.0], [51.3, 1778.0], [51.4, 1783.0], [51.5, 1789.0], [51.6, 1794.0], [51.7, 1795.0], [51.8, 1796.0], [51.9, 1799.0], [52.0, 1806.0], [52.1, 1812.0], [52.2, 1814.0], [52.3, 1814.0], [52.4, 1816.0], [52.5, 1817.0], [52.6, 1818.0], [52.7, 1820.0], [52.8, 1822.0], [52.9, 1825.0], [53.0, 1834.0], [53.1, 1848.0], [53.2, 1853.0], [53.3, 1855.0], [53.4, 1857.0], [53.5, 1859.0], [53.6, 1864.0], [53.7, 1867.0], [53.8, 1868.0], [53.9, 1872.0], [54.0, 1873.0], [54.1, 1875.0], [54.2, 1877.0], [54.3, 1880.0], [54.4, 1885.0], [54.5, 1888.0], [54.6, 1892.0], [54.7, 1899.0], [54.8, 1900.0], [54.9, 1905.0], [55.0, 1908.0], [55.1, 1909.0], [55.2, 1909.0], [55.3, 1911.0], [55.4, 1911.0], [55.5, 1911.0], [55.6, 1917.0], [55.7, 1922.0], [55.8, 1923.0], [55.9, 1929.0], [56.0, 1930.0], [56.1, 1935.0], [56.2, 1939.0], [56.3, 1943.0], [56.4, 1945.0], [56.5, 1948.0], [56.6, 1952.0], [56.7, 1952.0], [56.8, 1953.0], [56.9, 1954.0], [57.0, 1956.0], [57.1, 1958.0], [57.2, 1963.0], [57.3, 1964.0], [57.4, 1964.0], [57.5, 1964.0], [57.6, 1969.0], [57.7, 1974.0], [57.8, 1974.0], [57.9, 1976.0], [58.0, 1976.0], [58.1, 1979.0], [58.2, 1979.0], [58.3, 1979.0], [58.4, 1980.0], [58.5, 1989.0], [58.6, 1991.0], [58.7, 1991.0], [58.8, 1993.0], [58.9, 1995.0], [59.0, 1996.0], [59.1, 1996.0], [59.2, 2000.0], [59.3, 2001.0], [59.4, 2001.0], [59.5, 2006.0], [59.6, 2008.0], [59.7, 2010.0], [59.8, 2012.0], [59.9, 2013.0], [60.0, 2014.0], [60.1, 2015.0], [60.2, 2020.0], [60.3, 2021.0], [60.4, 2022.0], [60.5, 2026.0], [60.6, 2026.0], [60.7, 2027.0], [60.8, 2027.0], [60.9, 2038.0], [61.0, 2041.0], [61.1, 2043.0], [61.2, 2058.0], [61.3, 2059.0], [61.4, 2061.0], [61.5, 2066.0], [61.6, 2071.0], [61.7, 2074.0], [61.8, 2082.0], [61.9, 2082.0], [62.0, 2083.0], [62.1, 2088.0], [62.2, 2088.0], [62.3, 2092.0], [62.4, 2093.0], [62.5, 2098.0], [62.6, 2101.0], [62.7, 2103.0], [62.8, 2107.0], [62.9, 2112.0], [63.0, 2114.0], [63.1, 2118.0], [63.2, 2120.0], [63.3, 2126.0], [63.4, 2129.0], [63.5, 2130.0], [63.6, 2131.0], [63.7, 2134.0], [63.8, 2136.0], [63.9, 2137.0], [64.0, 2137.0], [64.1, 2142.0], [64.2, 2145.0], [64.3, 2146.0], [64.4, 2147.0], [64.5, 2151.0], [64.6, 2164.0], [64.7, 2167.0], [64.8, 2168.0], [64.9, 2168.0], [65.0, 2170.0], [65.1, 2172.0], [65.2, 2172.0], [65.3, 2172.0], [65.4, 2174.0], [65.5, 2177.0], [65.6, 2179.0], [65.7, 2194.0], [65.8, 2194.0], [65.9, 2195.0], [66.0, 2196.0], [66.1, 2199.0], [66.2, 2202.0], [66.3, 2203.0], [66.4, 2207.0], [66.5, 2208.0], [66.6, 2213.0], [66.7, 2216.0], [66.8, 2220.0], [66.9, 2229.0], [67.0, 2230.0], [67.1, 2232.0], [67.2, 2236.0], [67.3, 2240.0], [67.4, 2241.0], [67.5, 2244.0], [67.6, 2247.0], [67.7, 2249.0], [67.8, 2250.0], [67.9, 2250.0], [68.0, 2252.0], [68.1, 2260.0], [68.2, 2265.0], [68.3, 2266.0], [68.4, 2266.0], [68.5, 2269.0], [68.6, 2271.0], [68.7, 2272.0], [68.8, 2275.0], [68.9, 2278.0], [69.0, 2282.0], [69.1, 2282.0], [69.2, 2284.0], [69.3, 2288.0], [69.4, 2290.0], [69.5, 2291.0], [69.6, 2293.0], [69.7, 2294.0], [69.8, 2296.0], [69.9, 2301.0], [70.0, 2303.0], [70.1, 2316.0], [70.2, 2317.0], [70.3, 2319.0], [70.4, 2326.0], [70.5, 2332.0], [70.6, 2333.0], [70.7, 2336.0], [70.8, 2337.0], [70.9, 2338.0], [71.0, 2339.0], [71.1, 2344.0], [71.2, 2348.0], [71.3, 2349.0], [71.4, 2353.0], [71.5, 2354.0], [71.6, 2355.0], [71.7, 2356.0], [71.8, 2357.0], [71.9, 2359.0], [72.0, 2373.0], [72.1, 2374.0], [72.2, 2379.0], [72.3, 2382.0], [72.4, 2383.0], [72.5, 2384.0], [72.6, 2389.0], [72.7, 2394.0], [72.8, 2396.0], [72.9, 2399.0], [73.0, 2400.0], [73.1, 2400.0], [73.2, 2401.0], [73.3, 2410.0], [73.4, 2410.0], [73.5, 2411.0], [73.6, 2414.0], [73.7, 2417.0], [73.8, 2417.0], [73.9, 2417.0], [74.0, 2424.0], [74.1, 2425.0], [74.2, 2426.0], [74.3, 2427.0], [74.4, 2428.0], [74.5, 2429.0], [74.6, 2430.0], [74.7, 2439.0], [74.8, 2441.0], [74.9, 2443.0], [75.0, 2444.0], [75.1, 2448.0], [75.2, 2452.0], [75.3, 2455.0], [75.4, 2456.0], [75.5, 2466.0], [75.6, 2467.0], [75.7, 2468.0], [75.8, 2469.0], [75.9, 2469.0], [76.0, 2472.0], [76.1, 2477.0], [76.2, 2478.0], [76.3, 2481.0], [76.4, 2481.0], [76.5, 2484.0], [76.6, 2489.0], [76.7, 2490.0], [76.8, 2492.0], [76.9, 2498.0], [77.0, 2498.0], [77.1, 2499.0], [77.2, 2512.0], [77.3, 2516.0], [77.4, 2523.0], [77.5, 2527.0], [77.6, 2528.0], [77.7, 2530.0], [77.8, 2534.0], [77.9, 2542.0], [78.0, 2543.0], [78.1, 2544.0], [78.2, 2549.0], [78.3, 2550.0], [78.4, 2551.0], [78.5, 2555.0], [78.6, 2555.0], [78.7, 2557.0], [78.8, 2557.0], [78.9, 2559.0], [79.0, 2561.0], [79.1, 2565.0], [79.2, 2565.0], [79.3, 2566.0], [79.4, 2569.0], [79.5, 2570.0], [79.6, 2571.0], [79.7, 2573.0], [79.8, 2573.0], [79.9, 2574.0], [80.0, 2574.0], [80.1, 2577.0], [80.2, 2583.0], [80.3, 2586.0], [80.4, 2588.0], [80.5, 2592.0], [80.6, 2595.0], [80.7, 2596.0], [80.8, 2607.0], [80.9, 2609.0], [81.0, 2610.0], [81.1, 2611.0], [81.2, 2617.0], [81.3, 2622.0], [81.4, 2627.0], [81.5, 2628.0], [81.6, 2630.0], [81.7, 2630.0], [81.8, 2631.0], [81.9, 2631.0], [82.0, 2631.0], [82.1, 2631.0], [82.2, 2632.0], [82.3, 2634.0], [82.4, 2635.0], [82.5, 2638.0], [82.6, 2639.0], [82.7, 2639.0], [82.8, 2642.0], [82.9, 2645.0], [83.0, 2647.0], [83.1, 2665.0], [83.2, 2674.0], [83.3, 2675.0], [83.4, 2678.0], [83.5, 2679.0], [83.6, 2680.0], [83.7, 2680.0], [83.8, 2685.0], [83.9, 2687.0], [84.0, 2689.0], [84.1, 2694.0], [84.2, 2695.0], [84.3, 2696.0], [84.4, 2698.0], [84.5, 2709.0], [84.6, 2714.0], [84.7, 2714.0], [84.8, 2715.0], [84.9, 2718.0], [85.0, 2719.0], [85.1, 2723.0], [85.2, 2724.0], [85.3, 2725.0], [85.4, 2725.0], [85.5, 2727.0], [85.6, 2731.0], [85.7, 2734.0], [85.8, 2736.0], [85.9, 2743.0], [86.0, 2745.0], [86.1, 2748.0], [86.2, 2749.0], [86.3, 2758.0], [86.4, 2759.0], [86.5, 2759.0], [86.6, 2768.0], [86.7, 2774.0], [86.8, 2778.0], [86.9, 2781.0], [87.0, 2781.0], [87.1, 2782.0], [87.2, 2783.0], [87.3, 2784.0], [87.4, 2787.0], [87.5, 2792.0], [87.6, 2794.0], [87.7, 2797.0], [87.8, 2806.0], [87.9, 2807.0], [88.0, 2819.0], [88.1, 2819.0], [88.2, 2823.0], [88.3, 2825.0], [88.4, 2827.0], [88.5, 2837.0], [88.6, 2838.0], [88.7, 2840.0], [88.8, 2843.0], [88.9, 2846.0], [89.0, 2852.0], [89.1, 2854.0], [89.2, 2854.0], [89.3, 2855.0], [89.4, 2866.0], [89.5, 2867.0], [89.6, 2868.0], [89.7, 2876.0], [89.8, 2879.0], [89.9, 2882.0], [90.0, 2888.0], [90.1, 2899.0], [90.2, 2911.0], [90.3, 2915.0], [90.4, 2915.0], [90.5, 2917.0], [90.6, 2919.0], [90.7, 2929.0], [90.8, 2934.0], [90.9, 2934.0], [91.0, 2945.0], [91.1, 2950.0], [91.2, 2953.0], [91.3, 2956.0], [91.4, 2958.0], [91.5, 2961.0], [91.6, 2963.0], [91.7, 2964.0], [91.8, 2964.0], [91.9, 2973.0], [92.0, 2985.0], [92.1, 2987.0], [92.2, 2995.0], [92.3, 3002.0], [92.4, 3006.0], [92.5, 3009.0], [92.6, 3022.0], [92.7, 3023.0], [92.8, 3031.0], [92.9, 3031.0], [93.0, 3032.0], [93.1, 3039.0], [93.2, 3051.0], [93.3, 3052.0], [93.4, 3059.0], [93.5, 3061.0], [93.6, 3069.0], [93.7, 3073.0], [93.8, 3074.0], [93.9, 3077.0], [94.0, 3081.0], [94.1, 3083.0], [94.2, 3084.0], [94.3, 3092.0], [94.4, 3098.0], [94.5, 3099.0], [94.6, 3099.0], [94.7, 3104.0], [94.8, 3107.0], [94.9, 3126.0], [95.0, 3132.0], [95.1, 3135.0], [95.2, 3148.0], [95.3, 3150.0], [95.4, 3163.0], [95.5, 3190.0], [95.6, 3195.0], [95.7, 3213.0], [95.8, 3215.0], [95.9, 3217.0], [96.0, 3223.0], [96.1, 3224.0], [96.2, 3230.0], [96.3, 3230.0], [96.4, 3267.0], [96.5, 3269.0], [96.6, 3278.0], [96.7, 3282.0], [96.8, 3300.0], [96.9, 3302.0], [97.0, 3316.0], [97.1, 3320.0], [97.2, 3331.0], [97.3, 3333.0], [97.4, 3356.0], [97.5, 3361.0], [97.6, 3362.0], [97.7, 3372.0], [97.8, 3453.0], [97.9, 3463.0], [98.0, 3471.0], [98.1, 3500.0], [98.2, 3574.0], [98.3, 3623.0], [98.4, 3706.0], [98.5, 3722.0], [98.6, 3821.0], [98.7, 3822.0], [98.8, 3826.0], [98.9, 3834.0], [99.0, 3891.0], [99.1, 3921.0], [99.2, 3963.0], [99.3, 4050.0], [99.4, 4055.0], [99.5, 4161.0], [99.6, 4202.0], [99.7, 4235.0], [99.8, 4433.0], [99.9, 4817.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 95.0, "series": [{"data": [[600.0, 55.0], [700.0, 45.0], [800.0, 30.0], [900.0, 16.0], [1000.0, 3.0], [1100.0, 3.0], [1200.0, 5.0], [1300.0, 3.0], [1400.0, 11.0], [1500.0, 18.0], [100.0, 1.0], [1600.0, 24.0], [1700.0, 36.0], [1800.0, 28.0], [1900.0, 44.0], [2000.0, 34.0], [2100.0, 36.0], [2200.0, 37.0], [2300.0, 31.0], [2400.0, 43.0], [2500.0, 36.0], [2600.0, 37.0], [2800.0, 24.0], [2700.0, 33.0], [2900.0, 21.0], [3000.0, 24.0], [3100.0, 10.0], [200.0, 95.0], [3300.0, 10.0], [3200.0, 11.0], [3400.0, 3.0], [3500.0, 2.0], [3700.0, 2.0], [3600.0, 1.0], [3800.0, 5.0], [3900.0, 2.0], [4000.0, 2.0], [4100.0, 1.0], [4200.0, 2.0], [4400.0, 1.0], [300.0, 82.0], [4800.0, 1.0], [400.0, 40.0], [500.0, 52.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 218.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 559.0, "series": [{"data": [[1.0, 223.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 218.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 559.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 145.7420000000001, "minX": 1.54960788E12, "maxY": 145.7420000000001, "series": [{"data": [[1.54960788E12, 145.7420000000001]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 265.3333333333333, "minX": 1.0, "maxY": 4433.0, "series": [{"data": [[3.0, 1982.5], [4.0, 1864.0], [5.0, 2001.0], [6.0, 1911.0], [7.0, 2112.0], [8.0, 2172.0], [9.0, 1752.0], [10.0, 1964.0], [12.0, 1795.0], [13.0, 1979.0], [14.0, 2543.0], [15.0, 1806.0], [16.0, 2557.0], [17.0, 2417.0], [18.0, 2645.0], [19.0, 1817.0], [20.0, 2240.0], [21.0, 2787.0], [23.0, 1971.5], [24.0, 1353.5], [25.0, 1187.5], [26.0, 296.6666666666667], [27.0, 691.0], [28.0, 423.7368421052632], [29.0, 374.91666666666663], [30.0, 276.61111111111114], [31.0, 431.2857142857144], [33.0, 265.3333333333333], [32.0, 432.125], [35.0, 834.0], [34.0, 759.5], [37.0, 527.75], [36.0, 607.8333333333333], [38.0, 744.5], [39.0, 693.5], [41.0, 1128.0], [40.0, 646.5], [43.0, 701.4], [42.0, 1834.0], [44.0, 561.8571428571429], [45.0, 693.3333333333333], [46.0, 1743.5], [47.0, 2680.0], [49.0, 1198.0], [48.0, 835.6666666666667], [50.0, 1981.5], [51.0, 1103.5], [53.0, 1288.3333333333335], [52.0, 723.6], [55.0, 732.25], [54.0, 1169.0], [56.0, 660.8888888888889], [57.0, 423.0], [59.0, 761.8333333333333], [58.0, 1324.5], [60.0, 637.4444444444445], [61.0, 724.3333333333334], [62.0, 711.5], [63.0, 734.25], [64.0, 866.0], [66.0, 1408.5], [65.0, 974.0], [67.0, 2194.0], [69.0, 764.3076923076924], [71.0, 851.4444444444445], [70.0, 832.7857142857143], [68.0, 2275.0], [72.0, 836.0833333333334], [75.0, 1026.8], [74.0, 843.4545454545454], [73.0, 712.5], [76.0, 1057.4], [77.0, 1005.25], [79.0, 1231.5], [78.0, 2006.0], [82.0, 1584.5], [83.0, 2220.0], [80.0, 3269.0], [84.0, 1388.0], [87.0, 1204.5], [86.0, 1361.6666666666665], [85.0, 3333.0], [88.0, 1033.6666666666667], [89.0, 1174.1666666666667], [90.0, 912.25], [91.0, 843.7272727272727], [92.0, 744.6153846153845], [93.0, 1099.5454545454545], [94.0, 1152.6], [95.0, 1942.0], [96.0, 1169.0], [99.0, 1306.0], [98.0, 2875.0], [103.0, 1012.375], [102.0, 1038.3999999999999], [101.0, 785.1666666666666], [100.0, 1010.8333333333334], [104.0, 1120.4285714285713], [105.0, 1137.25], [106.0, 1227.5], [107.0, 2288.0], [111.0, 2204.5], [109.0, 2806.0], [108.0, 1556.0], [115.0, 2083.0], [114.0, 2337.0], [113.0, 1722.0], [112.0, 2010.0], [119.0, 2523.0], [118.0, 2549.0], [117.0, 2466.0], [116.0, 2595.0], [123.0, 3104.0], [122.0, 1956.0], [121.0, 2674.0], [120.0, 2854.0], [127.0, 1599.0], [126.0, 1818.0], [125.0, 2516.0], [124.0, 3022.0], [134.0, 2919.0], [133.0, 2410.0], [132.0, 1969.0], [131.0, 2439.5], [129.0, 2296.0], [128.0, 2120.0], [143.0, 3453.0], [142.0, 3096.5], [140.0, 3032.0], [139.0, 3302.0], [138.0, 2748.0], [137.0, 2333.0], [136.0, 3481.5], [151.0, 3126.0], [150.0, 2284.0], [149.0, 1737.0], [148.0, 1728.0], [147.0, 3006.0], [146.0, 2987.0], [145.0, 3083.0], [144.0, 2569.0], [159.0, 3623.0], [158.0, 2448.0], [157.0, 2698.0], [156.0, 3132.0], [155.0, 3052.0], [154.0, 2631.0], [153.0, 2609.0], [152.0, 1964.0], [167.0, 1444.5], [166.0, 1877.0], [165.0, 1607.0], [164.0, 2551.0], [163.0, 2723.0], [162.0, 2550.0], [161.0, 1855.0], [160.0, 2468.0], [173.0, 1807.6666666666667], [172.0, 1970.0], [171.0, 1924.0], [170.0, 1619.6666666666667], [169.0, 1963.0], [168.0, 1779.6666666666667], [174.0, 1734.0], [175.0, 1978.75], [177.0, 2258.0], [176.0, 1516.0], [180.0, 1632.0], [182.0, 1544.0], [183.0, 2340.6666666666665], [181.0, 2634.0], [179.0, 2396.0], [178.0, 2715.0], [190.0, 1736.888888888889], [189.0, 1965.0], [191.0, 1556.0], [188.0, 2781.0], [187.0, 3722.0], [186.0, 3098.0], [185.0, 3331.0], [184.0, 1900.0], [195.0, 2225.0], [196.0, 2603.5], [199.0, 1906.3333333333333], [198.0, 2167.0], [197.0, 1909.0], [193.0, 3059.0], [192.0, 2775.0], [201.0, 2125.5], [204.0, 2246.5], [206.0, 1976.5], [205.0, 2253.0], [207.0, 3821.0], [203.0, 3135.0], [202.0, 2417.0], [200.0, 2428.0], [210.0, 1921.5], [211.0, 2027.0], [212.0, 2147.0], [214.0, 2151.6666666666665], [215.0, 1830.0], [213.0, 2866.0], [209.0, 4433.0], [208.0, 2101.0], [218.0, 1663.6666666666667], [219.0, 2354.5], [220.0, 2268.0], [221.0, 2182.0], [223.0, 2382.0], [222.0, 2383.0], [217.0, 2774.0], [216.0, 2026.0], [226.0, 1981.6666666666665], [225.0, 2038.5], [227.0, 1899.0], [231.0, 1935.3333333333333], [230.0, 2126.0], [229.0, 2301.0], [228.0, 3034.5], [224.0, 3213.0], [233.0, 2689.0], [234.0, 3232.0], [235.0, 2554.5], [239.0, 2193.6666666666665], [238.0, 2565.0], [237.0, 2768.0], [236.0, 2319.0], [232.0, 2964.0], [242.0, 2451.3333333333335], [244.0, 2404.3333333333335], [245.0, 2587.0], [247.0, 2472.0], [246.0, 2929.0], [243.0, 2961.0], [241.0, 2876.0], [240.0, 2725.0], [251.0, 2534.6666666666665], [252.0, 2071.0], [254.0, 1976.3333333333333], [255.0, 2164.3333333333335], [253.0, 3593.5], [249.0, 2554.5], [259.0, 2128.5], [261.0, 2023.0], [260.0, 2934.0], [262.0, 2326.5], [263.0, 2032.5], [256.0, 3230.0], [258.0, 4161.0], [257.0, 2577.0], [265.0, 2339.0], [264.0, 1846.0], [271.0, 2482.0], [266.0, 1913.0], [267.0, 3074.0], [269.0, 2200.0], [268.0, 2012.0], [270.0, 2667.5], [274.0, 2613.5], [275.0, 2105.2], [284.0, 2430.090909090909], [285.0, 2288.733333333333], [287.0, 2556.0], [286.0, 2414.5], [276.0, 3203.0], [277.0, 3248.0], [278.0, 2490.0], [279.0, 2308.4], [273.0, 2734.0], [272.0, 2995.0], [280.0, 2074.3333333333335], [281.0, 2481.75], [282.0, 2363.411764705882], [283.0, 2237.923076923076], [290.0, 2152.6666666666665], [289.0, 2423.0], [288.0, 3963.0], [291.0, 2750.25], [300.0, 1384.0], [292.0, 2761.3333333333335], [293.0, 2880.5], [294.0, 2203.0], [295.0, 2819.0], [298.0, 2741.3333333333335], [297.0, 3822.0], [296.0, 2394.0], [299.0, 2819.0], [303.0, 2723.6666666666665], [302.0, 2372.5], [301.0, 2444.0], [316.0, 2582.8888888888887], [306.0, 2514.909090909091], [307.0, 2359.0], [305.0, 2440.875], [304.0, 2473.2], [309.0, 2551.5], [308.0, 2759.0], [310.0, 2266.0], [311.0, 2745.0], [315.0, 2503.3333333333335], [318.0, 2487.3333333333335], [317.0, 2398.333333333333], [319.0, 2357.0], [313.0, 2555.0], [312.0, 1799.0], [314.0, 2915.0], [321.0, 2591.3333333333335], [320.0, 2674.6666666666665], [322.0, 2658.0], [323.0, 2758.0], [324.0, 3369.0], [325.0, 2480.75], [326.0, 2898.5], [327.0, 2783.0], [328.0, 2682.0], [329.0, 2934.0], [332.0, 2489.0], [331.0, 2027.0], [330.0, 2678.0], [1.0, 1974.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[145.7420000000001, 1589.8749999999986]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 332.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6250.0, "minX": 1.54960788E12, "maxY": 7015.7, "series": [{"data": [[1.54960788E12, 7015.7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960788E12, 6250.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1589.8749999999986, "minX": 1.54960788E12, "maxY": 1589.8749999999986, "series": [{"data": [[1.54960788E12, 1589.8749999999986]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1589.8629999999985, "minX": 1.54960788E12, "maxY": 1589.8629999999985, "series": [{"data": [[1.54960788E12, 1589.8629999999985]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 17.211000000000006, "minX": 1.54960788E12, "maxY": 17.211000000000006, "series": [{"data": [[1.54960788E12, 17.211000000000006]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 151.0, "minX": 1.54960788E12, "maxY": 4817.0, "series": [{"data": [[1.54960788E12, 4817.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960788E12, 151.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960788E12, 2887.3999999999996]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960788E12, 3890.4300000000003]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960788E12, 3131.7]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1751.5, "minX": 16.0, "maxY": 1751.5, "series": [{"data": [[16.0, 1751.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1751.5, "minX": 16.0, "maxY": 1751.5, "series": [{"data": [[16.0, 1751.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960788E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960788E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960788E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960788E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960788E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960788E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Transactions Per Second"}},
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
